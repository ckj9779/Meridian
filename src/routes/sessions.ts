// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import type { FastifyInstance } from 'fastify';
import { pool } from '../config/database.js';
import { formatList, formatSingle, notFound, parsePagination } from '../utils/query.js';

/**
 * Read-only query routes for the `sessions` table.
 *
 * Two addressable forms for `:id`:
 *   - UUID — matched against `id` column.
 *   - Digits-only — matched against `session_number` column.
 *
 * Ordering uses `session_number ASC` (human-meaningful) rather than
 * `created_at ASC` (insertion timestamp). These are normally equivalent; if
 * they diverge (historical backfill), `session_number` is the right lens.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGITS_RE = /^\d+$/;

export async function sessionsRoute(app: FastifyInstance): Promise<void> {
  app.get('/api/sessions', async (request, reply) => {
    const pagination = parsePagination(request.query);
    try {
      const countResult = await pool.query<{ total: string }>(
        'SELECT count(*)::text AS total FROM sessions',
      );
      const total = Number(countResult.rows[0]?.total ?? 0);
      const dataResult = await pool.query(
        'SELECT * FROM sessions ORDER BY session_number ASC LIMIT $1 OFFSET $2',
        [pagination.limit, pagination.offset],
      );
      return formatList(dataResult.rows, total, pagination);
    } catch (err) {
      app.log.error({ err, route: 'GET /api/sessions' }, 'sessions list query failed');
      reply.code(500);
      return {
        ok: false,
        error: { code: 'query_failed', message: 'Failed to list sessions' },
      };
    }
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
    const { id } = request.params;
    try {
      let row: Record<string, unknown> | undefined;
      if (UUID_RE.test(id)) {
        const result = await pool.query('SELECT * FROM sessions WHERE id = $1::uuid LIMIT 1', [
          id,
        ]);
        row = result.rows[0];
      } else if (DIGITS_RE.test(id)) {
        const result = await pool.query(
          'SELECT * FROM sessions WHERE session_number = $1::int LIMIT 1',
          [Number(id)],
        );
        row = result.rows[0];
      } else {
        return notFound(reply, `No session with id '${id}' (expected UUID or session number)`);
      }
      if (!row) {
        return notFound(reply, `No session with id '${id}'`);
      }
      return formatSingle(row);
    } catch (err) {
      app.log.error({ err, id, route: 'GET /api/sessions/:id' }, 'session fetch failed');
      reply.code(500);
      return {
        ok: false,
        error: { code: 'query_failed', message: 'Failed to fetch session' },
      };
    }
  });
}
