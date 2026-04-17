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
 * ## Modes
 *
 * Default: `ON CONFLICT DO UPDATE` on mutable columns (D69). Immutable
 * columns (PK, dates, origin-session) are preserved; mutable columns
 * (summary, rationale, status, severity, etc.) are updated to match
 * the seed JSON. This makes re-seeding after decision/issue updates
 * idempotent without requiring --reseed truncation.
 *
 * --reseed / RESEED=1: truncate the four managed tables then reload.
 * Only the tables this script owns are truncated — `system_context` and
 * `stack_components` are untouched.
 *
 * --dry-run / DRY_RUN=1: run all operations inside a transaction that
 * is rolled back at the end. Prints per-row INSERT vs UPDATE actions
 * and totals. No data is modified.
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

function isDryRunRequested(): boolean {
  if (process.env.DRY_RUN === '1') return true;
  return process.argv.includes('--dry-run');
}

interface SeedResult {
  inserted: number;
  updated: number;
}

async function truncateManaged(): Promise<void> {
  const list = MANAGED_TABLES.join(', ');
  // eslint-disable-next-line no-console
  console.log(`Reseed: TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  await pool.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

// ---- decisions ------------------------------------------------------------
// D69: ON CONFLICT (id) DO UPDATE mutable columns.
// Immutable: id, session_number, decided_at
// Mutable: status, superseded_by, summary, rationale, components_affected,
//   layers_affected, related_issues, canon
const DECISIONS_UPSERT = `
  INSERT INTO decisions (
    id, session_number, status, superseded_by, summary, rationale,
    components_affected, layers_affected, decided_at, related_issues, canon
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    superseded_by = EXCLUDED.superseded_by,
    summary = EXCLUDED.summary,
    rationale = EXCLUDED.rationale,
    components_affected = EXCLUDED.components_affected,
    layers_affected = EXCLUDED.layers_affected,
    related_issues = EXCLUDED.related_issues,
    canon = EXCLUDED.canon
  RETURNING (xmax = 0) AS was_insert
`;

async function seedDecisions(rows: unknown[], dryRun: boolean): Promise<SeedResult> {
  const result: SeedResult = { inserted: 0, updated: 0 };
  for (const raw of rows) {
    const r = asRow(raw);
    if (!r) continue;
    const status = typeof r.status === 'string' ? r.status : 'pending_validation';
    const decidedAt = r.decided_at ?? r.date ?? null;
    const canon = typeof r.canon === 'boolean' ? r.canon : false;
    const res = await pool.query(DECISIONS_UPSERT, [
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
      canon,
    ]);
    const wasInsert = res.rows[0]?.was_insert;
    if (wasInsert) {
      result.inserted++;
      if (dryRun) {
        // eslint-disable-next-line no-console
        console.log(`[DRY-RUN] decisions: would INSERT ${r.id} (${r.summary})`);
      }
    } else {
      result.updated++;
      if (dryRun) {
        // eslint-disable-next-line no-console
        console.log(`[DRY-RUN] decisions: would UPDATE ${r.id}`);
      }
    }
  }
  return result;
}

// ---- issues ---------------------------------------------------------------
// D69: ON CONFLICT (id) DO UPDATE mutable columns.
// Immutable: id, session_opened
// Mutable: summary, description, status, severity, phase, related_decisions,
//   resolution, component, session_resolved, blocked_by, blocks
const ISSUES_UPSERT = `
  INSERT INTO issues (
    id, session_opened, session_resolved, status, severity, component,
    summary, resolution, blocked_by, blocks,
    description, phase, related_decisions
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
  ON CONFLICT (id) DO UPDATE SET
    session_resolved = EXCLUDED.session_resolved,
    status = EXCLUDED.status,
    severity = EXCLUDED.severity,
    component = EXCLUDED.component,
    summary = EXCLUDED.summary,
    resolution = EXCLUDED.resolution,
    blocked_by = EXCLUDED.blocked_by,
    blocks = EXCLUDED.blocks,
    description = EXCLUDED.description,
    phase = EXCLUDED.phase,
    related_decisions = EXCLUDED.related_decisions
  RETURNING (xmax = 0) AS was_insert
`;

async function seedIssues(rows: unknown[], dryRun: boolean): Promise<SeedResult> {
  const result: SeedResult = { inserted: 0, updated: 0 };
  for (const raw of rows) {
    const r = asRow(raw);
    if (!r) continue;
    const summary =
      (typeof r.summary === 'string' ? r.summary : null) ??
      (typeof r.title === 'string' ? r.title : null) ??
      '(no summary)';
    const resolution =
      (typeof r.resolution === 'string' ? r.resolution : null) ??
      (typeof r.notes === 'string' ? r.notes : null);
    const description = typeof r.description === 'string' ? r.description : null;
    const res = await pool.query(ISSUES_UPSERT, [
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
    ]);
    const wasInsert = res.rows[0]?.was_insert;
    if (wasInsert) {
      result.inserted++;
      if (dryRun) {
        // eslint-disable-next-line no-console
        console.log(`[DRY-RUN] issues: would INSERT ${r.id} (${summary})`);
      }
    } else {
      result.updated++;
      if (dryRun) {
        // eslint-disable-next-line no-console
        console.log(`[DRY-RUN] issues: would UPDATE ${r.id}`);
      }
    }
  }
  return result;
}

// ---- sessions -------------------------------------------------------------
// D69: ON CONFLICT (session_number) DO UPDATE mutable columns.
// Immutable: session_number, date, theme
// Mutable: summary, decisions_made, issues_resolved, issues_opened,
//   artifacts_produced, deep_context_ref
const SESSIONS_UPSERT = `
  INSERT INTO sessions (
    session_number, date, theme, decisions_made, issues_resolved,
    issues_opened, artifacts_produced, deep_context_ref, summary
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (session_number) DO UPDATE SET
    summary = EXCLUDED.summary,
    decisions_made = EXCLUDED.decisions_made,
    issues_resolved = EXCLUDED.issues_resolved,
    issues_opened = EXCLUDED.issues_opened,
    artifacts_produced = EXCLUDED.artifacts_produced,
    deep_context_ref = EXCLUDED.deep_context_ref
  RETURNING (xmax = 0) AS was_insert
`;

async function seedSessions(rows: unknown[], dryRun: boolean): Promise<SeedResult> {
  const result: SeedResult = { inserted: 0, updated: 0 };
  for (const raw of rows) {
    const r = asRow(raw);
    if (!r) continue;
    const artifactsRaw = r.artifacts_produced ?? r.key_deliverables ?? null;
    const artifacts =
      Array.isArray(artifactsRaw)
        ? artifactsRaw
        : typeof artifactsRaw === 'string'
          ? [artifactsRaw]
          : null;
    const res = await pool.query(SESSIONS_UPSERT, [
      r.session_number ?? r.number,
      r.date,
      r.theme,
      r.decisions_made ?? null,
      r.issues_resolved ?? null,
      r.issues_opened ?? null,
      artifacts,
      r.deep_context_ref ?? null,
      typeof r.summary === 'string' ? r.summary : null,
    ]);
    const wasInsert = res.rows[0]?.was_insert;
    if (wasInsert) {
      result.inserted++;
      if (dryRun) {
        // eslint-disable-next-line no-console
        console.log(`[DRY-RUN] sessions: would INSERT S${r.session_number ?? r.number} (${r.theme})`);
      }
    } else {
      result.updated++;
      if (dryRun) {
        // eslint-disable-next-line no-console
        console.log(`[DRY-RUN] sessions: would UPDATE S${r.session_number ?? r.number}`);
      }
    }
  }
  return result;
}

// ---- model_preferences ----------------------------------------------------
// Note: model_preferences has only a partial unique index
// (task_type WHERE is_default = true), not a full UNIQUE constraint on
// task_type. ON CONFLICT DO UPDATE cannot target partial indexes, so this
// table stays ON CONFLICT DO NOTHING. D69 scope note: behavior-preserving
// for this table; revisit if a full UNIQUE constraint is added.
async function seedModelPreferences(rows: unknown[], dryRun: boolean): Promise<SeedResult> {
  const result: SeedResult = { inserted: 0, updated: 0 };
  for (const raw of rows) {
    const r = asRow(raw);
    if (!r) continue;
    const res = await pool.query(
      `INSERT INTO model_preferences (task_type, provider, model_id, is_default)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING (xmax = 0) AS was_insert`,
      [
        r.task_type ?? r.task,
        r.provider,
        r.model_id ?? r.model,
        r.is_default ?? true,
      ],
    );
    if (res.rowCount && res.rowCount > 0) {
      result.inserted++;
      if (dryRun) {
        // eslint-disable-next-line no-console
        console.log(`[DRY-RUN] model_preferences: would INSERT ${r.task_type ?? r.task}`);
      }
    }
    // ON CONFLICT DO NOTHING returns 0 rows on conflict — no update count.
  }
  return result;
}

// system_context and tech_watch are NOT seeded by this script.
// system_context is seeded as a single versioned document by seed-002.ts (D33).
// tech_watch is reserved for the Phase 1 monitoring agent; inventory data now
// lives in `stack_components`, also seeded by seed-002.ts (D34).

async function main(): Promise<void> {
  const reseed = isReseedRequested();
  const dryRun = isDryRunRequested();

  if (dryRun && reseed) {
    // eslint-disable-next-line no-console
    console.log('[DRY-RUN] --reseed and --dry-run both set. Dry-run takes precedence — no truncation.');
  }

  // Dry-run wraps everything in a single transaction that is rolled back.
  if (dryRun) {
    await pool.query('BEGIN');
    // eslint-disable-next-line no-console
    console.log('[DRY-RUN] Transaction opened — all operations will be rolled back.\n');
  }

  if (reseed && !dryRun) {
    await truncateManaged();
  }

  const seed = loadSeed();
  const decisions = [
    ...(seed.decisions ?? []),
    ...(seed.decisions_pending_session_07 ?? []),
  ];
  const issues = [...(seed.issues ?? []), ...(seed.legacy_issues ?? [])];

  const counts = {
    decisions: await seedDecisions(decisions, dryRun),
    issues: await seedIssues(issues, dryRun),
    sessions: await seedSessions(seed.sessions ?? [], dryRun),
    model_preferences: await seedModelPreferences(seed.model_preferences ?? [], dryRun),
  };

  if (dryRun) {
    // eslint-disable-next-line no-console
    console.log('\n--- Dry-run summary ---');
    for (const [table, { inserted, updated }] of Object.entries(counts)) {
      // eslint-disable-next-line no-console
      console.log(`[DRY-RUN] ${table}: ${inserted} to insert, ${updated} to update`);
    }
    await pool.query('ROLLBACK');
    // eslint-disable-next-line no-console
    console.log('[DRY-RUN] Transaction rolled back — no changes applied.');
  } else {
    const label = reseed ? ' (after reseed truncate)' : '';
    // eslint-disable-next-line no-console
    console.log(`Seed complete${label}. Row operations:`);
    for (const [table, { inserted, updated }] of Object.entries(counts)) {
      // eslint-disable-next-line no-console
      console.log(`  ${table}: ${inserted} inserted, ${updated} updated`);
    }
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
