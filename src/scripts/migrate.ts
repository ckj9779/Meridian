// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

interface MigrationFile {
  version: number;
  name: string;
  path: string;
}

/**
 * Migrations are forward-only numbered SQL files in `migrations/`. Each file
 * wraps its DDL in BEGIN/COMMIT (per `docs/DATABASE.md:79-84`). Already-
 * applied versions are tracked in the `schema_migrations` table.
 */
function listMigrations(): MigrationFile[] {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const parsed: MigrationFile[] = [];
  for (const file of files) {
    const match = /^(\d+)_(.+)\.sql$/.exec(file);
    if (!match) continue;
    const versionStr = match[1];
    const name = match[2];
    if (!versionStr || !name) continue;
    parsed.push({
      version: Number.parseInt(versionStr, 10),
      name,
      path: join(MIGRATIONS_DIR, file),
    });
  }
  parsed.sort((a, b) => a.version - b.version);
  return parsed;
}

async function ensureSchemaMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    integer PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedVersions(): Promise<Set<number>> {
  const res = await pool.query<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version',
  );
  return new Set(res.rows.map((r) => r.version));
}

async function runMigration(migration: MigrationFile): Promise<void> {
  const sql = readFileSync(migration.path, 'utf8');
  // Each migration file is responsible for its own BEGIN/COMMIT. We execute
  // the file contents as a single multi-statement query.
  await pool.query(sql);
  // eslint-disable-next-line no-console
  console.log(`Applied migration ${migration.version}: ${migration.name}`);
}

async function main(): Promise<void> {
  await ensureSchemaMigrationsTable();
  const migrations = listMigrations();
  const applied = await appliedVersions();
  const pending = migrations.filter((m) => !applied.has(m.version));

  if (pending.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`No pending migrations. Applied: ${[...applied].sort().join(', ') || '(none)'}`);
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`Pending migrations: ${pending.map((m) => m.version).join(', ')}`);
  for (const migration of pending) {
    await runMigration(migration);
  }
  // eslint-disable-next-line no-console
  console.log(`Migration run complete. Applied ${pending.length} migration(s).`);
}

try {
  await main();
  await pool.end();
  process.exit(0);
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('Migration failed:', err);
  await pool.end();
  process.exit(1);
}
