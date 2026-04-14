// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import type { FastifyInstance } from 'fastify';
import { testConnection } from '../config/database.js';

interface HealthPayload {
  status: 'ok' | 'degraded';
  version: string;
  phase: number;
  timestamp: string;
  database: 'connected' | 'error';
}

const PHASE0_VERSION = '0.1.0';
const PHASE0_NUMBER = 0;

export async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply): Promise<HealthPayload> => {
    let database: HealthPayload['database'];
    let status: HealthPayload['status'];
    try {
      await testConnection();
      database = 'connected';
      status = 'ok';
    } catch (err) {
      app.log.error({ err }, 'Database health probe failed');
      database = 'error';
      status = 'degraded';
      reply.code(503);
    }
    return {
      status,
      version: PHASE0_VERSION,
      phase: PHASE0_NUMBER,
      timestamp: new Date().toISOString(),
      database,
    };
  });
}
