// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import { pool } from '../config/database.js';

/**
 * Seed for Migration 002 artifacts: `system_context` (single active versioned
 * row per D33) and `stack_components` (technology inventory per D34).
 *
 * Separate from `src/scripts/seed.ts` so that the JSON-driven seed stays
 * focused on the per-row tables (decisions/issues/sessions/model_preferences)
 * and this file captures the reshape work that D33 and D34 authorize.
 *
 * Idempotent: skips insert if a row with the same key already exists.
 */

// ---- system_context (D33, resolves INS-012) ------------------------------
// The seed JSON's system_context array is a flat K/V dictionary (33 entries).
// Per D33, that dictionary is consolidated into the `content` column of a
// single active row (version 1) of the versioned-document table. The content
// is kept as structured jsonb semantically — stored as a JSON string in the
// text column per the DDL.
const SYSTEM_CONTEXT_V1: Record<string, string> = {
  project_name: 'Meridian',
  current_phase: '0',
  phase_description: 'Can remember — PostgreSQL + API + Zuplo MCP',
  architecture:
    'One store, many lenses — unified canonical knowledge graph with three retrieval lenses',
  canonical_store: 'PostgreSQL + Apache AGE (AGE deferred to Phase 2)',
  api_framework: 'Fastify + TypeScript (Node.js)',
  package_manager: 'npm',
  api_gateway: 'Zuplo — auth, rate limiting, semantic caching, MCP exposure',
  infrastructure_host: 'Railway',
  frontend_host: 'Vercel (future)',
  frontend_framework: 'Next.js (future)',
  execution_runtime: 'Anthropic Agents API (unconfirmed — MER-15)',
  license: 'BSL 1.1',
  owner: 'Charles K. Johnson',
  owner_email: 'mobile@charleskjohnson.com',
  github_repo: 'ckj9779/Meridian',
  github_visibility: 'public',
  local_repo_path: '/mnt/d/Meridian/',
  machine_name: 'StarshipOne',
  os: 'Windows + WSL (Ubuntu)',
  gpg_key: 'rsa4096/799AD4A789D27DA8, expires 2028-04-13',
  node_version: 'v22.17.0',
  python_version: '3.13.5',
  postgresql_version: '18.3 (Railway)',
  git_signing: 'commit.gpgsign=true, tag.gpgsign=true',
  push_method:
    'HTTPS from Git Bash (workaround). SSH from WSL planned (D29, MER-18 deferred).',
  streaming_protocol: 'SSE for server-to-client. No WebSockets.',
  domain_model: 'Four domains: Professional, Private, Spiritual, Romantic',
  value_proposition:
    'Intelligence multiplier — graph-scored briefings from automated source scanning. Compresses 5-10 hrs/day manual intelligence gathering to 30-60 min reviewed briefings.',
  commits_on_main: '4 as of Session 07',
  email_corpus_m365:
    '415,627 files, 126 folders, 26.3 GB (~200K emails). POC subset 2024-2025: 143,996 files, 8.74 GB (~72K emails).',
  email_corpus_gmail: '90%+ personal. Four-domain data. Not yet exported.',
  email_corpus_icloud: 'Neglected account. Unknown signal quality.',
  email_corpus_mslive: 'Neglected account. Unknown signal quality.',
};

async function seedSystemContext(): Promise<number> {
  const existing = await pool.query<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM system_context',
  );
  if ((existing.rows[0]?.n ?? 0) > 0) {
    // eslint-disable-next-line no-console
    console.log('system_context already seeded; skipping');
    return 0;
  }
  // Note: `content` column is `text NOT NULL`, so we serialize the structured
  // document to a JSON string. The DDL chose text over jsonb intentionally
  // (see docs/DATABASE.md:315-327); callers that want structured access can
  // parse on read.
  const content = JSON.stringify(SYSTEM_CONTEXT_V1, null, 2);
  await pool.query(
    `INSERT INTO system_context (version, content, change_summary, approved_by, active)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      1,
      content,
      'Initial system context compiled from Sessions 01-07. First versioned document.',
      'Charles K. Johnson',
      true,
    ],
  );
  return 1;
}

// ---- stack_components (D34, resolves INS-013) ----------------------------
// Technology inventory. Phase 0 and 1 components are already selected or
// deployed; later-phase entries are `planned` and will be revised before
// their phase begins.
interface StackRow {
  component: string;
  technology: string;
  version: string | null;
  status: 'planned' | 'selected' | 'deployed' | 'deprecated';
  phase: number;
  notes: string;
}

const STACK_COMPONENTS: readonly StackRow[] = [
  {
    component: 'apache_age',
    technology: 'PostgreSQL graph extension',
    version: 'Supports PG 11-18',
    status: 'selected',
    phase: 2,
    notes:
      'Cypher query support. Deferred to Phase 2. Custom Docker image from apache/age planned. PG 18 compatibility unverified.',
  },
  {
    component: 'zuplo',
    technology: 'API gateway / MCP server handler',
    version: 'current',
    status: 'selected',
    phase: 0,
    notes:
      'Auth, rate limiting, semantic caching, MCP exposure, observability. Edge deployment.',
  },
  {
    component: 'railway',
    technology: 'Infrastructure hosting',
    version: 'current',
    status: 'deployed',
    phase: 0,
    notes: 'PostgreSQL 18.3 deployed and online. Meridian project created.',
  },
  {
    component: 'fastify',
    technology: 'Node.js API framework',
    version: 'latest',
    status: 'selected',
    phase: 0,
    notes:
      'TypeScript-first. JSON Schema validation. Plugin architecture. Selected Session 07 (D31).',
  },
  {
    component: 'postgresql',
    technology: 'Database',
    version: '18.3',
    status: 'deployed',
    phase: 0,
    notes: 'Phase 0 tables live. AGE extension deferred to Phase 2.',
  },
  {
    component: 'anthropic_agents_api',
    technology: 'Managed agent execution runtime',
    version: 'unconfirmed',
    status: 'planned',
    phase: 1,
    notes:
      'MER-15: GA status unconfirmed. Interim: Claude Code subagents + Railway scheduled jobs.',
  },
  {
    component: 'nextjs',
    technology: 'Frontend framework',
    version: 'latest',
    status: 'planned',
    phase: 4,
    notes: 'Vercel deployment. Three-function interface.',
  },
  {
    component: 'vercel',
    technology: 'Frontend hosting',
    version: 'current',
    status: 'planned',
    phase: 4,
    notes: 'Frontend only. Not for backend services (D07).',
  },
];

async function seedStackComponents(): Promise<number> {
  let inserted = 0;
  await pool.query('BEGIN');
  try {
    for (const row of STACK_COMPONENTS) {
      const result = await pool.query(
        `INSERT INTO stack_components (component, technology, version, status, phase, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (component) DO NOTHING`,
        [row.component, row.technology, row.version, row.status, row.phase, row.notes],
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

async function main(): Promise<void> {
  const scInserted = await seedSystemContext();
  const stackInserted = await seedStackComponents();
  // eslint-disable-next-line no-console
  console.log('Seed-002 complete. Rows inserted:');
  // eslint-disable-next-line no-console
  console.log(`  system_context: ${scInserted}`);
  // eslint-disable-next-line no-console
  console.log(`  stack_components: ${stackInserted}`);
}

try {
  await main();
  await pool.end();
  process.exit(0);
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('Seed-002 failed:', err);
  await pool.end();
  process.exit(1);
}
