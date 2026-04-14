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
 * The seed JSON at `.meridian/data/seed/meridian-seed-data.json` and the
 * DATABASE.md DDLs do not share a field vocabulary. This script maps JSON
 * fields onto DB columns where the mapping is defensible, and skips tables
 * whose JSON shape is conceptually incompatible with the DDL. See ledger
 * INS-007..INS-012 for details.
 *
 * Per-table transactions: failure in one table does not corrupt another.
 * Idempotent: `ON CONFLICT DO NOTHING` so reruns are safe.
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
 * Normalize severity strings to the canonical set. JSON uses "normal" which
 * doesn't match any value in DATABASE.md's documented severity enum. Mapped
 * to "medium" as the closest semantic equivalent. See INS-008.
 */
function normalizeSeverity(raw: unknown): string {
  if (typeof raw !== 'string') return 'medium';
  const s = raw.toLowerCase();
  if (s === 'normal') return 'medium';
  return s;
}

// ---- decisions ------------------------------------------------------------
// JSON: {id, session, status, superseded_by, summary, rationale, date, related_issues}
// DB:   {id, session_number, status, superseded_by, summary, rationale,
//        components_affected, layers_affected}
//
// `decisions_pending_session_07` entries lack `status`; they represent
// decisions made this session not yet formally reviewed — default to
// `pending_validation` per DATABASE.md's documented enum. See INS-007.
async function seedDecisions(rows: unknown[]): Promise<number> {
  let inserted = 0;
  await pool.query('BEGIN');
  try {
    for (const raw of rows) {
      const r = asRow(raw);
      if (!r) continue;
      const status = typeof r.status === 'string' ? r.status : 'pending_validation';
      const result = await pool.query(
        `INSERT INTO decisions (
           id, session_number, status, superseded_by, summary, rationale,
           components_affected, layers_affected
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
// JSON: {id, title, description, status, severity, phase, session_opened,
//        session_resolved, related_decisions, notes}
// DB:   {id, session_opened, session_resolved, status, severity, component,
//        summary, resolution, blocked_by, blocks}
//
// Mapping: summary = title (description goes into resolution if no notes).
// `phase` and `related_decisions` are not persisted (no DB columns). See INS-009.
async function seedIssues(rows: unknown[]): Promise<number> {
  let inserted = 0;
  await pool.query('BEGIN');
  try {
    for (const raw of rows) {
      const r = asRow(raw);
      if (!r) continue;
      const title = typeof r.title === 'string' ? r.title : null;
      const description = typeof r.description === 'string' ? r.description : null;
      const notes = typeof r.notes === 'string' ? r.notes : null;
      const summary = title ?? description ?? '(no title)';
      const resolution = notes ?? description ?? null;
      const result = await pool.query(
        `INSERT INTO issues (
           id, session_opened, session_resolved, status, severity, component,
           summary, resolution, blocked_by, blocks
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
// JSON: {number, date, theme, decisions_made, issues_opened, issues_resolved,
//        key_deliverables, summary}
// DB:   {session_number, date, theme, decisions_made, issues_resolved,
//        issues_opened, artifacts_produced, deep_context_ref}
//
// `key_deliverables` (string) is stuffed into `artifacts_produced` (text[]) as a
// single-element array. `summary` is not persisted. See INS-010.
async function seedSessions(rows: unknown[]): Promise<number> {
  let inserted = 0;
  await pool.query('BEGIN');
  try {
    for (const raw of rows) {
      const r = asRow(raw);
      if (!r) continue;
      const artifacts =
        typeof r.key_deliverables === 'string' ? [r.key_deliverables] : null;
      const result = await pool.query(
        `INSERT INTO sessions (
           session_number, date, theme, decisions_made, issues_resolved,
           issues_opened, artifacts_produced, deep_context_ref
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
// JSON: {task, model, provider, notes}
// DB:   {task_type, provider, model_id, is_default}
//
// Each JSON row is assumed to be the default for its task (one entry per task
// in the seed data). `notes` is not persisted. See INS-011.
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
        [r.task_type ?? r.task, r.provider, r.model_id ?? r.model, r.is_default ?? true],
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

// system_context and tech_watch are NOT seeded in Phase 0.
// The JSON shapes are conceptually incompatible with the DDLs:
//  - system_context JSON is a flat {key, value} dictionary; the DDL is a
//    versioned document table with content/version/active (INS-012).
//  - tech_watch JSON is a technology inventory (what's in the stack); the
//    DDL is a monitoring event log with event_type/title/detected_at (INS-013).
// Owner decision required before seeding these.

async function main(): Promise<void> {
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
    system_context: 0, // skipped — see INS-012
    tech_watch: 0, // skipped — see INS-013
  };

  // eslint-disable-next-line no-console
  console.log('Seed complete. Rows inserted:');
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
