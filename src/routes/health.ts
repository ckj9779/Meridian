// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import type { FastifyInstance } from 'fastify';

export async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request): Promise<{ status: 'ok' }> => {
    return { status: 'ok' };
  });
}
