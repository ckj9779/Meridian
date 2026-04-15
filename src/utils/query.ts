// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ApiError, ApiSuccess } from '../types/index.js';

/**
 * Shared pagination + response helpers for read-only Phase 0 query routes.
 *
 * Envelope shape matches `docs/CODING_STANDARDS.md:148-171` and the
 * `ApiSuccess<T>` / `ApiError` types in `src/types/index.ts`. This utility
 * module exists so every route handler emits the same payload shape; Zuplo
 * and downstream MCP consumers depend on it.
 */

const LIMIT_MAX = 200;
const LIMIT_DEFAULT = 50;
const OFFSET_DEFAULT = 0;

export interface Pagination {
  limit: number;
  offset: number;
}

/**
 * Parse and clamp `limit` / `offset` query parameters.
 *
 * - `limit` defaults to 50, is silently capped at 200 (prompt Step 5 test 3).
 * - `offset` defaults to 0 and must be non-negative.
 *
 * Invalid input (non-numeric, negative) throws a ZodError, which Fastify
 * turns into a 400 by default. Callers can opt to wrap in try/catch if they
 * want to customize that response.
 */
const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(LIMIT_MAX).default(LIMIT_DEFAULT),
  offset: z.coerce.number().int().min(0).default(OFFSET_DEFAULT),
});

export function parsePagination(query: unknown): Pagination {
  // Coerce silently: if caller passes limit=300 we want 200, not a 400.
  const raw = (query ?? {}) as Record<string, unknown>;
  const clamped = {
    ...raw,
    limit:
      raw.limit !== undefined && raw.limit !== ''
        ? Math.min(Number(raw.limit) || LIMIT_DEFAULT, LIMIT_MAX)
        : undefined,
  };
  return paginationSchema.parse(clamped);
}

export interface ListMeta {
  total: number;
  limit: number;
  offset: number;
}

export function formatList<T>(
  rows: T[],
  total: number,
  pagination: Pagination,
): ApiSuccess<T[]> & { meta: ListMeta } {
  return {
    ok: true,
    data: rows,
    meta: {
      total,
      limit: pagination.limit,
      offset: pagination.offset,
    },
  };
}

export function formatSingle<T>(row: T): ApiSuccess<T> {
  return {
    ok: true,
    data: row,
  };
}

export function notFound(reply: FastifyReply, message: string): ApiError {
  reply.code(404);
  return {
    ok: false,
    error: {
      code: 'not_found',
      message,
    },
  };
}
