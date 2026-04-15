// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import type { FastifyInstance } from 'fastify';
import { pool } from '../config/database.js';
import { formatList, parsePagination } from '../utils/query.js';

/**
 * Read-only query route for `model_preferences` (D22 model routing defaults).
 *
 * The table lacks a `created_at` column (see INS-003); ordering by
 * `task_type ASC, is_default DESC, updated_at ASC` puts defaults first
 * within each task type.
 */

const ORDER_BY = 'ORDER BY task_type ASC, is_default DESC, updated_at ASC';

export async function modelsRoute(app: FastifyInstance): Promise<void> {
  app.get('/api/models', async (request, reply) => {
    const pagination = parsePagination(request.query);
    try {
      const countResult = await pool.query<{ total: string }>(
        'SELECT count(*)::text AS total FROM model_preferences',
      );
      const total = Number(countResult.rows[0]?.total ?? 0);
      const dataResult = await pool.query(
        `SELECT * FROM model_preferences ${ORDER_BY} LIMIT $1 OFFSET $2`,
        [pagination.limit, pagination.offset],
      );
      return formatList(dataResult.rows, total, pagination);
    } catch (err) {
      app.log.error({ err, route: 'GET /api/models' }, 'models list query failed');
      reply.code(500);
      return {
        ok: false,
        error: { code: 'query_failed', message: 'Failed to list model preferences' },
      };
    }
  });
}
