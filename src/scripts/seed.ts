// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SEED_FILE = join(
  __dirname,
  '..',
  '..',
  '.meridian',
  'data',
  'seed',
  'meridian-seed-data.json',
);

/**
 * Phase 0 seed runner.
 *
 * Reads `.meridian/data/seed/meridian-seed-data.json` and populates the
 * per-row Phase 0 tables: `decisions`, `issues`, `sessions`,
 * `model_preferences`. The `system_context` and `stack_components` tables are
 * seeded separately by `src/scripts/seed-002.ts` (see D33, D34).
 *
 * After migration 003 the seed JSON vocabulary matches the DDL columns
 * directly (no adapter rewrites needed); defensive `??` fallbacks remain so
 * the script still works against unmodified seed JSON for bootstrap purposes.
 *
 * ## --reseed flag
 *
 * Default mode: `ON CONFLICT DO NOTHING` inserts — safe reruns.
 * Reseed mode: truncate the four data tables managed by this script, then
 * reload. Invoked via `npx tsx src/scripts/seed.ts --reseed` or `RESEED=1`.
 * Only the tables this script owns are truncated — `system_context` and
 * `stack_components` are untouched.
 */

interface SeedShape {
  decisions?: unknown[];
  decisions_pending_session_07?: unknown[];
  issues?: unknown[];
  legacy_issues?: unknown[];
  sessions?: unknown[];
  system_context?: unknown[];
  model_preferences?: unknown[];
  tech_watch?: unknown[];
}

function loadSeed(): SeedShape {
  const raw = readFileSync(SEED_FILE, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Seed file is not an object at the top level');
  }
  return parsed as SeedShape;
}

type Row = Record<string, unknown>;

function asRow(x: unknown): Row | null {
  return typeof x === 'object' && x !== null ? (x as Row) : null;
}

/**
 * Normalize severity strings to the canonical set. Older seed data used
 * `"normal"` (pre-migration-003) or null (legacy CAG-* issues, see
 * migration-003 ledger INS-001). Both map to `medium`.
 */
function normalizeSeverity(raw: unknown): string {
  if (typeof raw !== 'string') return 'medium';
  const s = raw.toLowerCase();
  if (s === 'normal') return 'medium';
  return s;
}

/**
 * Tables this script owns. Listed in the order they are safe to truncate
 * (no inter-table FKs exist in Phase 0, so order is informational).
 */
const MANAGED_TABLES = ['decisions', 'issues', 'sessions', 'model_preferences'] as const;

function isReseedRequested(): boolean {
  if (process.env.RESEED === '1') return true;
  return process.argv.includes('--reseed');
}

async function truncateManaged(): Promise<void> {
  // TRUNCATE ... RESTART IDENTITY CASCADE — safe because no FKs target these
  // tables in Phase 0, but CASCADE is cheap insurance against future
  // additions. RESTART IDENTITY is a no-op for decisions/issues (varchar
  // PKs) but matters if any future table on this list uses serial.
  const list = MANAGED_TABLES.join(', ');
  // eslint-disable-next-line no-console
  console.log(`Reseed: TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  await pool.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

// ---- decisions ------------------------------------------------------------
// JSON (after migration 003): {id, session_number, status, superseded_by,
//   summary, rationale, date, related_issues}
// DB: {id, session_number, status, superseded_by, summary, rationale,
//   components_affected, layers_affected, decided_at, related_issues}
async function seedDecisions(rows: unknown[]): Promise<number> {
  let inserted = 0;
  await pool.query('BEGIN');
  try {
    for (const raw of rows) {
      const r = asRow(raw);
      if (!r) continue;
      const status = typeof r.status === 'string' ? r.status : 'pending_validation';
      const decidedAt = r.decided_at ?? r.date ?? null;
      const result = await pool.query(
        `INSERT INTO decisions (
           id, session_number, status, superseded_by, summary, rationale,
           components_affected, layers_affected, decided_at, related_issues
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [
          r.id,
          r.session_number ?? r.session,
          status,
          r.superseded_by ?? null,
          r.summary,
          r.rationale,
          r.components_affected ?? null,
          r.layers_affected ?? null,
          decidedAt,
          r.related_issues ?? null,
        ],
      );
      inserted += result.rowCount ?? 0;
    }
    await pool.query('COMMIT');
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
  return inserted;
}

// ---- issues ---------------------------------------------------------------
// JSON (after migration 003): {id, summary, description, status, severity,
//   phase, session_opened, session_resolved, related_decisions, resolution}
// DB: adds description, phase, related_decisions columns from migration 003.
async function seedIssues(rows: unknown[]): Promise<number> {
  let inserted = 0;
  await pool.query('BEGIN');
  try {
    for (const raw of rows) {
      const r = asRow(raw);
      if (!r) continue;
      // Defensive: tolerate pre-migration-003 JSON with `title`/`notes`.
      const summary =
        (typeof r.summary === 'string' ? r.summary : null) ??
        (typeof r.title === 'string' ? r.title : null) ??
        '(no summary)';
      const resolution =
        (typeof r.resolution === 'string' ? r.resolution : null) ??
        (typeof r.notes === 'string' ? r.notes : null);
      const description = typeof r.description === 'string' ? r.description : null;
      const result = await pool.query(
        `INSERT INTO issues (
           id, session_opened, session_resolved, status, severity, component,
           summary, resolution, blocked_by, blocks,
           description, phase, related_decisions
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO NOTHING`,
        [
          r.id,
          r.session_opened,
          r.session_resolved ?? null,
          r.status,
          normalizeSeverity(r.severity),
          r.component ?? null,
          summary,
          resolution,
          r.blocked_by ?? null,
          r.blocks ?? null,
          description,
          r.phase ?? null,
          r.related_decisions ?? null,
        ],
      );
      inserted += result.rowCount ?? 0;
    }
    await pool.query('COMMIT');
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
  return inserted;
}

// ---- sessions -------------------------------------------------------------
// JSON (after migration 003): {session_number, date, theme, decisions_made,
//   issues_opened, issues_resolved, artifacts_produced, summary}
// DB: adds `summary` column from migration 003.
async function seedSessions(rows: unknown[]): Promise<number> {
  let inserted = 0;
  await pool.query('BEGIN');
  try {
    for (const raw of rows) {
      const r = asRow(raw);
      if (!r) continue;
      // Defensive fallback for pre-migration-003 shape.
      const artifactsRaw = r.artifacts_produced ?? r.key_deliverables ?? null;
      const artifacts =
        Array.isArray(artifactsRaw)
          ? artifactsRaw
          : typeof artifactsRaw === 'string'
            ? [artifactsRaw]
            : null;
      const result = await pool.query(
        `INSERT INTO sessions (
           session_number, date, theme, decisions_made, issues_resolved,
           issues_opened, artifacts_produced, deep_context_ref, summary
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (session_number) DO NOTHING`,
        [
          r.session_number ?? r.number,
          r.date,
          r.theme,
          r.decisions_made ?? null,
          r.issues_resolved ?? null,
          r.issues_opened ?? null,
          artifacts,
          r.deep_context_ref ?? null,
          typeof r.summary === 'string' ? r.summary : null,
        ],
      );
      inserted += result.rowCount ?? 0;
    }
    await pool.query('COMMIT');
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
  return inserted;
}

// ---- model_preferences ----------------------------------------------------
// JSON (after migration 003): {task_type, provider, model_id, is_default, notes}
// DB: {task_type, provider, model_id, is_default}
async function seedModelPreferences(rows: unknown[]): Promise<number> {
  let inserted = 0;
  await pool.query('BEGIN');
  try {
    for (const raw of rows) {
      const r = asRow(raw);
      if (!r) continue;
      const result = await pool.query(
        `INSERT INTO model_preferences (task_type, provider, model_id, is_default)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [
          r.task_type ?? r.task,
          r.provider,
          r.model_id ?? r.model,
          r.is_default ?? true,
        ],
      );
      inserted += result.rowCount ?? 0;
    }
    await pool.query('COMMIT');
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
  return inserted;
}

// system_context and tech_watch are NOT seeded by this script.
// system_context is seeded as a single versioned document by seed-002.ts (D33).
// tech_watch is reserved for the Phase 1 monitoring agent; inventory data now
// lives in `stack_components`, also seeded by seed-002.ts (D34).

async function main(): Promise<void> {
  const reseed = isReseedRequested();
  if (reseed) {
    await truncateManaged();
  }

  const seed = loadSeed();
  const decisions = [
    ...(seed.decisions ?? []),
    ...(seed.decisions_pending_session_07 ?? []),
  ];
  const issues = [...(seed.issues ?? []), ...(seed.legacy_issues ?? [])];

  const counts = {
    decisions: await seedDecisions(decisions),
    issues: await seedIssues(issues),
    sessions: await seedSessions(seed.sessions ?? []),
    model_preferences: await seedModelPreferences(seed.model_preferences ?? []),
    system_context: 0, // seeded by seed-002.ts (D33)
    tech_watch: 0, // reserved for Phase 1 monitoring agent (D34)
  };

  // eslint-disable-next-line no-console
  console.log(`Seed complete${reseed ? ' (after reseed truncate)' : ''}. Rows inserted:`);
  for (const [table, count] of Object.entries(counts)) {
    // eslint-disable-next-line no-console
    console.log(`  ${table}: ${count}`);
  }
}

try {
  await main();
  await pool.end();
  process.exit(0);
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  await pool.end();
  process.exit(1);
}
