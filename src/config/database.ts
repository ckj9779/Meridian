// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import pg from 'pg';
import { config } from './env.js';

const { Pool } = pg;

/**
 * Shared PostgreSQL connection pool.
 *
 * Railway's SSL chain is not validated end-to-end by Node's default CA bundle,
 * so `rejectUnauthorized: false` is required (see INS-006 in the Phase 0
 * scaffold insight ledger).
 *
 * PHASE 2 TODO (AGE): Add `pool.on('connect')` handler to run
 *   LOAD 'age';
 *   SET search_path = ag_catalog, "$user", public;
 * on every new connection. See `docs/DATABASE.md:13-40`. Not implemented in
 * Phase 0 because the AGE extension is not yet installed on Railway.
 */
export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
});

/**
 * Lightweight connectivity probe. Used by the /health route and by scripts
 * that want to fail fast if the database is unreachable. Returns true on
 * success; throws on failure with contextual information.
 */
export async function testConnection(): Promise<boolean> {
  const result = await pool.query<{ ok: number }>('SELECT 1 AS ok');
  const row = result.rows[0];
  if (!row || row.ok !== 1) {
    throw new Error('Database probe returned unexpected shape');
  }
  return true;
}
