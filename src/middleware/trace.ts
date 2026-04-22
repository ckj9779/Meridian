// Copyright (c) 2026 Charles K. Johnson
// SPDX-License-Identifier: BSL-1.1

import { FastifyRequest, FastifyReply } from 'fastify';
import { ulid } from 'ulid';

/**
 * Trace middleware — D50 (ULID trace IDs).
 *
 * Reads X-Trace-Id header injected by Zuplo. If absent (direct call
 * that passed gateway auth, or /health probe), generates a new ULID.
 * Attaches to request.traceId for downstream middleware and route
 * handlers. The Pino mixin reads request.traceId on every log emit.
 *
 * Must be registered BEFORE gatewaySecretHook in src/index.ts so
 * rejected requests still carry a trace ID in audit_events.
 */
export async function traceHook(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const injected = request.headers['x-trace-id'];
  request.traceId = typeof injected === 'string' && injected.length > 0
    ? injected
    : ulid();
}
