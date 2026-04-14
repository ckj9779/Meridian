// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import Fastify from 'fastify';
import { config } from './config/env.js';
import { pool } from './config/database.js';
import { healthRoute } from './routes/health.js';

const app = Fastify({
  logger: {
    level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

await app.register(healthRoute);

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
