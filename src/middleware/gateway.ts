// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import { FastifyRequest, FastifyReply } from 'fastify';

const BYPASS_PATHS = ['/health'];
const GATEWAY_HEADER = 'x-gateway-secret';

export async function gatewaySecretHook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Bypass for Railway health probe — per D64
  if (BYPASS_PATHS.includes(request.url)) {
    return;
  }

  const secret = process.env.BACKEND_SECRET;
  if (!secret) {
    request.log.error('BACKEND_SECRET environment variable is not set');
    reply.code(500).send({ ok: false, error: { code: 'CONFIGURATION_ERROR', message: 'Server misconfiguration' } });
    return;
  }

  const incoming = request.headers[GATEWAY_HEADER];
  if (!incoming || incoming !== secret) {
    reply.code(401).send({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid gateway secret' } });
    return;
  }
}
