// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { gatewaySecretHook } from './middleware/gateway.js';
import { traceHook } from './middleware/trace.js';
import { auditStartHook, auditHook } from './middleware/audit.js';
import { config } from './config/env.js';
import { pool } from './config/database.js';
import { healthRoute } from './routes/health.js';
import { decisionsRoute } from './routes/decisions.js';
import { issuesRoute } from './routes/issues.js';
import { sessionsRoute } from './routes/sessions.js';
import { contextRoute } from './routes/context.js';
import { stackRoute } from './routes/stack.js';
import { modelsRoute } from './routes/models.js';
import { requestContext } from './lib/request-context.js';

const app = Fastify({
  logger: {
    level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    mixin: () => {
      const ctx = requestContext.getStore();
      if (!ctx) return {};
      return {
        traceId: ctx.traceId,
        callerIdentity: ctx.callerIdentity,
      };
    },
  },
});

await app.register(cors, {
  origin: [
    'https://mydatasphere.dev',
    'https://api.mydatasphere.dev',
    'http://localhost:3000',
  ],
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

app.addHook('onRequest', traceHook);
app.addHook('onRequest', auditStartHook);
app.addHook('onRequest', gatewaySecretHook);
app.addHook('onResponse', auditHook);

await app.register(healthRoute);
await app.register(decisionsRoute);
await app.register(issuesRoute);
await app.register(sessionsRoute);
await app.register(contextRoute);
await app.register(stackRoute);
await app.register(modelsRoute);

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'Shutdown signal received');
  try {
    await app.close();
    await pool.end();
    app.log.info('Clean shutdown complete');
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

try {
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error({ err }, 'Failed to start server');
  await pool.end();
  process.exit(1);
}
