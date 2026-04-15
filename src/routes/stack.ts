// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../config/database.js';
import { formatList, parsePagination } from '../utils/query.js';

/**
 * Read-only query route for `stack_components` (D34 technology inventory).
 *
 * Human-readable column is `component` (not `name` — see INS-004). Ordering
 * by `phase ASC NULLS LAST, component ASC` keeps the list in
 * deployment-timeline order, then alphabetical within a phase.
 */

const listQuerySchema = z.object({
  phase: z.coerce.number().int().min(0).optional(),
  status: z.string().trim().min(1).optional(),
});

const ORDER_BY = 'ORDER BY phase ASC NULLS LAST, component ASC';

export async function stackRoute(app: FastifyInstance): Promise<void> {
  app.get('/api/stack', async (request, reply) => {
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
    const { phase, status } = filtersParsed.data;

    const where: string[] = [];
    const params: unknown[] = [];
    if (phase !== undefined) {
      params.push(phase);
      where.push(`phase = $${params.length}`);
    }
    if (status !== undefined) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    try {
      const countResult = await pool.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM stack_components ${whereClause}`,
        params,
      );
      const total = Number(countResult.rows[0]?.total ?? 0);

      const dataParams = [...params, pagination.limit, pagination.offset];
      const dataResult = await pool.query(
        `SELECT * FROM stack_components ${whereClause} ${ORDER_BY} LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
        dataParams,
      );
      return formatList(dataResult.rows, total, pagination);
    } catch (err) {
      app.log.error({ err, route: 'GET /api/stack' }, 'stack list query failed');
      reply.code(500);
      return {
        ok: false,
        error: { code: 'query_failed', message: 'Failed to list stack components' },
      };
    }
  });
}
