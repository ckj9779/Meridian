// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../config/database.js';

/**
 * Audit query routes. D43 (attribution), D54 (observability as knowledge infrastructure).
 * Registered with prefix /v1 in index.ts → accessible at /v1/audit and /v1/audit/:trace_id.
 *
 * All routes are behind Zuplo (Clerk JWT + gateway secret). Fastify only sees
 * authenticated requests from the gateway.
 */

const listQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.coerce.number().int().optional(),
  caller: z.string().trim().min(1).optional(),
  method: z.string().trim().min(1).optional(),
});

export async function auditRoute(app: FastifyInstance): Promise<void> {
  app.get('/audit', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: { code: 'invalid_query', message: 'Invalid query parameters', details: parsed.error.issues } };
    }

    const { limit, offset, status, caller, method } = parsed.data;

    // Parse and validate from/to timestamps
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 7 * 86400_000);

    let fromDate: Date;
    let toDate: Date;

    if (parsed.data.from) {
      const d = new Date(parsed.data.from);
      if (isNaN(d.getTime())) {
        reply.code(400);
        return { ok: false, error: { code: 'invalid_query', message: "'from' is not a valid ISO timestamp" } };
      }
      fromDate = d;
    } else {
      fromDate = defaultFrom;
    }

    if (parsed.data.to) {
      const d = new Date(parsed.data.to);
      if (isNaN(d.getTime())) {
        reply.code(400);
        return { ok: false, error: { code: 'invalid_query', message: "'to' is not a valid ISO timestamp" } };
      }
      toDate = d;
    } else {
      toDate = now;
    }

    reply.header('x-trace-id', request.traceId);

    const where: string[] = ['timestamp >= $1', 'timestamp <= $2'];
    const params: unknown[] = [fromDate, toDate];

    if (status !== undefined) {
      params.push(status);
      where.push(`status_code = $${params.length}`);
    }
    if (caller) {
      params.push(caller);
      where.push(`caller_identity = $${params.length}`);
    }
    if (method) {
      params.push(method.toUpperCase());
      where.push(`http_method = $${params.length}`);
    }

    const whereClause = `WHERE ${where.join(' AND ')}`;

    try {
      const countResult = await pool.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM audit_events ${whereClause}`,
        params,
      );
      const total = Number(countResult.rows[0]?.total ?? 0);

      const dataParams = [...params, limit, offset];
      const dataResult = await pool.query(
        `SELECT * FROM audit_events ${whereClause} ORDER BY timestamp DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
        dataParams,
      );

      return {
        ok: true,
        data: dataResult.rows,
        meta: {
          total,
          limit,
          offset,
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        },
      };
    } catch (err) {
      app.log.error({ err, route: 'GET /v1/audit' }, 'audit list query failed');
      reply.code(500);
      return { ok: false, error: { code: 'internal_error', message: 'internal_error' } };
    }
  });

  app.get<{ Params: { trace_id: string } }>('/audit/:trace_id', async (request, reply) => {
    const { trace_id } = request.params;

    reply.header('x-trace-id', request.traceId);

    try {
      const result = await pool.query(
        `SELECT * FROM audit_events WHERE trace_id = $1 ORDER BY timestamp ASC`,
        [trace_id],
      );

      if (result.rows.length === 0) {
        reply.code(404);
        return { ok: false, error: { code: 'not_found', message: `No audit events for trace_id '${trace_id}'` } };
      }

      return { ok: true, data: result.rows };
    } catch (err) {
      app.log.error({ err, trace_id, route: 'GET /v1/audit/:trace_id' }, 'audit trace lookup failed');
      reply.code(500);
      return { ok: false, error: { code: 'internal_error', message: 'internal_error' } };
    }
  });
}
