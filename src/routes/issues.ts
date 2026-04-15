// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../config/database.js';
import { formatList, formatSingle, notFound, parsePagination } from '../utils/query.js';

/**
 * Read-only query routes for the `issues` table.
 *
 * `issues.id` is `varchar(20)` storing values like `MER-01`, `CAG-02`
 * directly (see INS-002). `:id` matches case-insensitively against the PK.
 * Includes migration-003 columns: `description`, `phase`, `related_decisions`.
 */

const listQuerySchema = z.object({
  status: z.string().trim().min(1).optional(),
  severity: z.string().trim().min(1).optional(),
  phase: z.coerce.number().int().min(0).optional(),
});

const ORDER_BY = 'ORDER BY created_at ASC';

export async function issuesRoute(app: FastifyInstance): Promise<void> {
  app.get('/api/issues', async (request, reply) => {
    const pagination = parsePagination(request.query);
    const filtersParsed = listQuerySchema.safeParse(request.query);
    if (!filtersParsed.success) {
      reply.code(400);
      return {
        ok: false,
        error: {
          code: 'invalid_query',
          message: 'Invalid query parameters',
          details: filtersParsed.error.issues,
        },
      };
    }
    const { status, severity, phase } = filtersParsed.data;

    const where: string[] = [];
    const params: unknown[] = [];
    if (status !== undefined) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    if (severity !== undefined) {
      params.push(severity);
      where.push(`severity = $${params.length}`);
    }
    if (phase !== undefined) {
      params.push(phase);
      where.push(`phase = $${params.length}`);
    }
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    try {
      const countResult = await pool.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM issues ${whereClause}`,
        params,
      );
      const total = Number(countResult.rows[0]?.total ?? 0);

      const dataParams = [...params, pagination.limit, pagination.offset];
      const dataResult = await pool.query(
        `SELECT * FROM issues ${whereClause} ${ORDER_BY} LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
        dataParams,
      );
      return formatList(dataResult.rows, total, pagination);
    } catch (err) {
      app.log.error({ err, route: 'GET /api/issues' }, 'issues list query failed');
      reply.code(500);
      return {
        ok: false,
        error: { code: 'query_failed', message: 'Failed to list issues' },
      };
    }
  });

  app.get<{ Params: { id: string } }>('/api/issues/:id', async (request, reply) => {
    const { id } = request.params;
    try {
      const result = await pool.query(
        'SELECT * FROM issues WHERE upper(id) = upper($1) LIMIT 1',
        [id],
      );
      const row = result.rows[0];
      if (!row) {
        return notFound(reply, `No issue with id '${id}'`);
      }
      return formatSingle(row);
    } catch (err) {
      app.log.error({ err, id, route: 'GET /api/issues/:id' }, 'issue fetch failed');
      reply.code(500);
      return {
        ok: false,
        error: { code: 'query_failed', message: 'Failed to fetch issue' },
      };
    }
  });
}
