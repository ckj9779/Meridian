// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../config/database.js';
import { formatList, formatSingle, notFound, parsePagination } from '../utils/query.js';

/**
 * Read-only query routes for the `decisions` table.
 *
 * `decisions.id` is `varchar(10)` storing values like `D01` directly (see
 * INS-002 in `.meridian/insights/2026-04-15_phase0-api-routes.md`); the `:id`
 * route matches case-insensitively against the primary key.
 *
 * Columns include migration-003 additions: `decided_at`, `related_issues`.
 * `SELECT *` is used so the shape stays in sync with the table without
 * requiring parallel updates here; the shared `Decision` type in
 * `src/types/index.ts` is the interface contract for consumers.
 */

const listQuerySchema = z.object({
  status: z.string().trim().min(1).optional(),
  session: z.coerce.number().int().min(0).optional(),
});

const ORDER_BY = 'ORDER BY decided_at ASC NULLS LAST, created_at ASC';

export async function decisionsRoute(app: FastifyInstance): Promise<void> {
  app.get('/api/decisions', async (request, reply) => {
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
    const { status, session } = filtersParsed.data;

    const where: string[] = [];
    const params: unknown[] = [];
    if (status !== undefined) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    if (session !== undefined) {
      params.push(session);
      where.push(`session_number = $${params.length}`);
    }
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    try {
      const countResult = await pool.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM decisions ${whereClause}`,
        params,
      );
      const total = Number(countResult.rows[0]?.total ?? 0);

      const dataParams = [...params, pagination.limit, pagination.offset];
      const dataResult = await pool.query(
        `SELECT * FROM decisions ${whereClause} ${ORDER_BY} LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
        dataParams,
      );
      return formatList(dataResult.rows, total, pagination);
    } catch (err) {
      app.log.error({ err, route: 'GET /api/decisions' }, 'decisions list query failed');
      reply.code(500);
      return {
        ok: false,
        error: { code: 'query_failed', message: 'Failed to list decisions' },
      };
    }
  });

  app.get<{ Params: { id: string } }>('/api/decisions/:id', async (request, reply) => {
    const { id } = request.params;
    try {
      const result = await pool.query(
        'SELECT * FROM decisions WHERE upper(id) = upper($1) LIMIT 1',
        [id],
      );
      const row = result.rows[0];
      if (!row) {
        return notFound(reply, `No decision with id '${id}'`);
      }
      return formatSingle(row);
    } catch (err) {
      app.log.error({ err, id, route: 'GET /api/decisions/:id' }, 'decision fetch failed');
      reply.code(500);
      return {
        ok: false,
        error: { code: 'query_failed', message: 'Failed to fetch decision' },
      };
    }
  });
}
