// Copyright (c) 2026 Charles K. Johnson
// SPDX-License-Identifier: BSL-1.1

import { FastifyRequest, FastifyReply } from 'fastify';
import { ulid } from 'ulid';
import { createHash } from 'crypto';
import { pool } from '../config/database.js';

/**
 * Audit middleware — D43 (attribution), D48 (observability cascade),
 * D54 (audit data feeds knowledge graph).
 *
 * Two hooks:
 *   auditStartHook (onRequest)  — captures request.startMs
 *   auditHook      (onResponse) — writes audit_events row
 *
 * auditHook uses onResponse (not reply.raw.on('finish')) because
 * onResponse fires after the response is sent — reply.statusCode and
 * all request fields are available synchronously. reply.raw has
 * already emitted 'finish' by this point; attaching a listener there
 * would never fire.
 *
 * audit_events.id is a ULID — no DB default exists by design.
 * Time-sortable PKs; fails loudly if middleware is skipped.
 */

const BYPASS_PATHS = new Set(['/health']);

/**
 * Decode JWT payload segment without verification.
 * Returns the sub claim, or null if decoding fails.
 * Zuplo has already verified signature and expiry;
 * BACKEND_SECRET ensures only Zuplo-proxied requests reach Railway.
 */
function extractSub(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.slice(7);
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) return null;
    const padded = payloadB64
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payloadB64.length / 4) * 4, '=');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const payload = JSON.parse(json) as Record<string, unknown>;
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * SHA-256 hash of request body for write operations.
 * Returns null for GET/HEAD/OPTIONS or empty bodies.
 */
function hashBody(method: string, body: unknown): string | null {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return null;
  if (!body) return null;
  const serialized = typeof body === 'string'
    ? body
    : JSON.stringify(body);
  return createHash('sha256').update(serialized).digest('hex');
}

/**
 * Capture request start time for duration_ms calculation.
 * Must be registered on onRequest BEFORE gatewaySecretHook.
 */
export async function auditStartHook(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  request.startMs = Date.now();
}

/**
 * Write one audit_events row per non-bypassed request.
 * Registered on onResponse — fires after response is sent.
 * Fire-and-forget INSERT; audit failures are logged but never fatal.
 */
export async function auditHook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Skip audit for bypassed paths
  if (BYPASS_PATHS.has(request.routeOptions?.url ?? request.url)) {
    return;
  }

  const callerIdentity = extractSub(
    request.headers['authorization'] as string | undefined
  );
  const durationMs = Date.now() - (request.startMs ?? Date.now());
  const statusCode = reply.statusCode;

  let callerType: string;
  if (!callerIdentity) {
    callerType = 'anonymous';
  } else if (callerIdentity.startsWith('user_')) {
    callerType = 'human_pat';
  } else {
    callerType = 'm2m_claude_code';
  }

  const authMethod = request.headers['authorization']
    ? 'clerk_pat'
    : 'gateway_secret_only';

  // Awaited — onResponse hooks must return a Promise, not use done()
  // Audit failure is caught and logged but never fatal to the response.
  try {
    await pool.query(
      `INSERT INTO audit_events
         (id, trace_id, timestamp, caller_identity, caller_type,
          auth_method, http_method, route, status_code, duration_ms,
          request_body_hash)
       VALUES
         ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        ulid(),
        request.traceId,
        callerIdentity ?? 'anonymous',
        callerType,
        authMethod,
        request.method,
        request.routeOptions?.url ?? request.url,
        statusCode,
        durationMs,
        hashBody(request.method, request.body),
      ]
    );
  } catch (err: unknown) {
    request.log.error(
      { err, traceId: request.traceId },
      'audit_events INSERT failed'
    );
  }
}
