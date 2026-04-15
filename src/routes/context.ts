// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import type { FastifyInstance } from 'fastify';
import { pool } from '../config/database.js';
import { formatSingle, notFound } from '../utils/query.js';

/**
 * Read-only query route for the active system context.
 *
 * The `system_context` table enforces at most one active row via the partial
 * unique index `idx_context_active WHERE active = true`. This endpoint fetches
 * that singleton. Returns 404 if no active context is present.
 */

export async function contextRoute(app: FastifyInstance): Promise<void> {
  app.get('/api/context', async (_request, reply) => {
    try {
      const result = await pool.query(
        'SELECT * FROM system_context WHERE active = true ORDER BY version DESC LIMIT 1',
      );
      const row = result.rows[0];
      if (!row) {
        return notFound(reply, 'No active system context');
      }
      return formatSingle(row);
    } catch (err) {
      app.log.error({ err, route: 'GET /api/context' }, 'context fetch failed');
      reply.code(500);
      return {
        ok: false,
        error: { code: 'query_failed', message: 'Failed to fetch system context' },
      };
    }
  });
}
