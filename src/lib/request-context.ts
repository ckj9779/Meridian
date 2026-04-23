// Copyright (c) 2026 Charles K. Johnson
// SPDX-License-Identifier: BSL-1.1

/**
 * Request context threading via AsyncLocalStorage.
 * Allows pino mixin to read per-request fields (traceId, callerIdentity)
 * without access to the Fastify request object.
 * D50 (trace IDs), D54 (observability as knowledge infrastructure).
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  traceId: string;
  callerIdentity: string | null;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
