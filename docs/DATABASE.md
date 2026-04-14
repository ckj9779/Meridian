<!-- Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE. -->

# Meridian — Database Reference

> Derived from SAD Section 7. Read this for all database work: schema, migrations, queries, connection handling.

## Overview

PostgreSQL 18 (Railway deployment) with Apache AGE extension is the sole database (D05). Hosted on Railway via custom Docker image extending `apache/age`. All relational tables and the AGE graph topology coexist in a single instance. One database, one connection string, one backup strategy.

**Phase 2 blocker:** Apache AGE compatibility with PostgreSQL 18 is unverified. The `apache/age` Docker image must be tested against PG 18 before AGE deployment. If incompatible, Railway PostgreSQL may need to be pinned to PG 16.

## Connection Requirements

### AGE initialization — CRITICAL
Every new database connection must execute these statements before any Cypher query:

```sql
LOAD 'age';
SET search_path = ag_catalog, "$user", public;
```

**This is per-connection, not per-session.** If using a connection pool, these must run in the pool's `afterCreate` or `onConnect` callback. Failure produces:
```
ERROR: unhandled cipher(cstring) function call error
```

### Connection pool pattern (Node.js)
```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
});

pool.on('connect', async (client) => {
  await client.query("LOAD 'age'");
  await client.query('SET search_path = ag_catalog, "$user", public');
});
```

**Railway-specific:** Connections require `ssl: { rejectUnauthorized: false }`. Railway uses a certificate chain that the Node.js default CA bundle does not fully trust. This is standard Railway practice. Future hardening: pin Railway's CA certificate.

### Docker image
Custom Dockerfile extending `apache/age` official image. Must include:
- `shared_preload_libraries = 'age'` in postgresql.conf
- SSL configuration for Railway
- Health check endpoint

## Schema Conventions

- **Table names:** snake_case (e.g., `staged_extractions`, `agent_events`)
- **Column names:** snake_case
- **Primary keys:** uuid, generated with `gen_random_uuid()`
- **Timestamps:** All tables include `created_at timestamptz NOT NULL DEFAULT now()`. Tables with mutable rows include `updated_at timestamptz NOT NULL DEFAULT now()`.
- **Enums:** Stored as `varchar` with CHECK constraints, not PostgreSQL ENUM types (easier to add values without migration).
- **JSON:** Use `jsonb`, never `json`. Supports indexing and operators.
- **Arrays:** PostgreSQL native arrays (e.g., `text[]` for domains).
- **Full-text search:** `tsvector` columns with GIN indexes. Generated columns or trigger-maintained.

## Migration Strategy

All schema changes go through numbered migration files. Never execute ad-hoc DDL against production.

### Migration file naming
```
migrations/
  001_initial_schema.sql
  002_add_tech_watch.sql
  003_add_content_tsv_index.sql
```

### Migration file format
```sql
-- Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.
-- Migration: 001_initial_schema
-- Description: Create core tables for Phase 0
-- Ref: SAD Section 7.1, Phase 0 roadmap
-- Date: 2026-04-14

BEGIN;

-- [DDL statements here]

COMMIT;
```

### Rules
- Migrations are forward-only. No down migrations in v0.x (complexity not warranted at this scale).
- Each migration is idempotent where possible (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
- Never include data (INSERT/UPDATE/DELETE) in migration files. Data seeding is a separate script.
- Test migrations against a local PostgreSQL instance before applying to Railway.

---

## Relational Schema — 16 Tables

### sources
Intelligence source definitions. Each row is a mission objective for a scanning agent.

```sql
CREATE TABLE sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type            varchar(50) NOT NULL,       -- youtube, rss, reddit, twitter, substack, hackernews, blog, government, linkedin, other
  name            varchar(255) NOT NULL,      -- human-readable display name
  identifier      text NOT NULL,              -- URL, handle, feed path, subreddit
  description     text,                       -- why monitored; what signal to watch for
  frequency       varchar(20) NOT NULL,       -- realtime, hourly, daily, weekly
  priority        varchar(20) NOT NULL,       -- critical, high, medium, low
  domains         text[] NOT NULL,            -- {Professional, Private, Spiritual, Romantic}
  enabled         boolean NOT NULL DEFAULT true,
  agent_notes     text,                       -- instructions for scanning agent
  last_scanned_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sources_type ON sources(type);
CREATE INDEX idx_sources_enabled ON sources(enabled) WHERE enabled = true;
```

### scan_runs
Execution log for agent scanning sessions.

```sql
CREATE TABLE scan_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id          uuid NOT NULL REFERENCES sources(id),
  session_id         varchar(255),             -- Agents API session identifier
  status             varchar(20) NOT NULL,     -- pending, running, completed, failed, timeout, budget_exhausted
  started_at         timestamptz,
  completed_at       timestamptz,
  items_found        integer,
  entities_extracted integer,
  tokens_used        integer,
  cost_usd           decimal(10,4),
  error_message      text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scan_runs_source ON scan_runs(source_id);
CREATE INDEX idx_scan_runs_status ON scan_runs(status);
CREATE INDEX idx_scan_runs_session ON scan_runs(session_id);
```

### raw_items
Raw content pulled from sources or email corpus. Stored before extraction.

```sql
CREATE TABLE raw_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         uuid REFERENCES sources(id),           -- null for email corpus
  scan_run_id       uuid REFERENCES scan_runs(id),
  item_type         varchar(50) NOT NULL,                  -- email, article, video, reddit_post, tweet, hn_thread, gov_notice, blog_post
  external_id       varchar(255),                          -- message-ID, video ID, post ID
  title             text,
  content           text,
  content_tsv       tsvector,                              -- GIN indexed for FTS
  metadata          jsonb,                                 -- source-specific: from/to/cc for email, channel for youtube, etc.
  source_type       varchar(20),                           -- personal, notification, transactional, newsletter, advertisement, system (D14)
  item_date         timestamptz,                           -- original content date
  extraction_status varchar(20) NOT NULL DEFAULT 'pending', -- pending, extracted, failed
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_raw_items_source ON raw_items(source_id);
CREATE INDEX idx_raw_items_type ON raw_items(item_type);
CREATE INDEX idx_raw_items_extraction ON raw_items(extraction_status);
CREATE INDEX idx_raw_items_tsv ON raw_items USING GIN(content_tsv);
CREATE INDEX idx_raw_items_external ON raw_items(external_id);
CREATE INDEX idx_raw_items_date ON raw_items(item_date);
```

### staged_extractions
Entity extraction results awaiting human review (D24). Nothing enters the live graph without passing through this table.

```sql
CREATE TABLE staged_extractions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_item_id          uuid REFERENCES raw_items(id),
  batch_id             uuid,                                -- groups for batch triage (D23)
  extracted_json       jsonb NOT NULL,                      -- full extraction conforming to prompt schema
  model_used           varchar(100),                        -- claude-haiku-4.5, etc.
  status               varchar(20) NOT NULL DEFAULT 'staged', -- staged, in_review, approved, rejected, partial
  reviewer_notes       text,
  corrections_applied  jsonb,                               -- what changed during review
  reviewed_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_staged_status ON staged_extractions(status);
CREATE INDEX idx_staged_batch ON staged_extractions(batch_id);
CREATE INDEX idx_staged_json ON staged_extractions USING GIN(extracted_json);
```

### briefings
Synthesized intelligence output for human consumption.

```sql
CREATE TABLE briefings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_type  varchar(50) NOT NULL,       -- morning_intel, meeting_prep, competitive, regulatory, relationship, custom
  title          text NOT NULL,
  content        jsonb NOT NULL,             -- structured: sections, graph refs, action recommendations
  graph_refs     jsonb,                      -- array of node/edge IDs referenced
  source_refs    jsonb,                      -- array of raw_item IDs that contributed
  model_used     varchar(100),
  status         varchar(20) NOT NULL DEFAULT 'generated', -- generated, read, actioned, dismissed
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_briefings_type ON briefings(briefing_type);
CREATE INDEX idx_briefings_status ON briefings(status);
CREATE INDEX idx_briefings_created ON briefings(created_at DESC);
```

### agent_events
Episodic memory. Every agent action logged for cross-session querying and observability.

```sql
CREATE TABLE agent_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  varchar(255) NOT NULL,         -- Agents API session identifier
  agent_type  varchar(50) NOT NULL,          -- intel_scanner, email_ingester, extractor, briefing_gen, triage, maintenance
  mission_id  uuid,                          -- references mission_policies.id if applicable
  event_type  varchar(50) NOT NULL,          -- source_fetched, entity_extracted, graph_match, briefing_generated, escalation, error, checkpoint, budget_warning
  event_data  jsonb NOT NULL,                -- event-specific payload
  tokens_used integer,
  timestamp   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_session ON agent_events(session_id);
CREATE INDEX idx_events_type ON agent_events(event_type);
CREATE INDEX idx_events_agent ON agent_events(agent_type);
CREATE INDEX idx_events_timestamp ON agent_events(timestamp DESC);
```

### corrections
Human feedback on extraction quality. Feeds self-maintenance layer for prompt improvement.

```sql
CREATE TABLE corrections (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correction_type        varchar(50) NOT NULL,   -- entity_reclassify, domain_change, entity_merge, entity_split, edge_add, edge_remove, name_correction, relationship_correction
  staged_extraction_id   uuid REFERENCES staged_extractions(id),
  original_value         jsonb NOT NULL,
  corrected_value        jsonb NOT NULL,
  entity_refs            jsonb,                  -- graph node/edge IDs affected
  session_context        text,                   -- conversational context of the correction
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_corrections_type ON corrections(correction_type);
CREATE INDEX idx_corrections_created ON corrections(created_at DESC);
```

### escalations
Harness-blocked actions and agent-flagged items requiring human review.

```sql
CREATE TABLE escalations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_type   varchar(50) NOT NULL,    -- budget_exceeded, domain_violation, scope_deviation, low_confidence, contradictory_data, action_blocked, timeout, maintenance_proposal
  agent_session_id  varchar(255) NOT NULL,
  context_data      jsonb NOT NULL,          -- what was attempted, why blocked, relevant graph refs
  status            varchar(20) NOT NULL DEFAULT 'pending', -- pending, reviewed, resolved, dismissed
  resolution_notes  text,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_escalations_type ON escalations(escalation_type);
CREATE INDEX idx_escalations_status ON escalations(status);
```

### mission_policies
Harness configuration per mission type. Defines agent constraints.

```sql
CREATE TABLE mission_policies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_type        varchar(50) NOT NULL,    -- morning_intel, regulatory_watch, tech_stack_monitor, email_ingestion, meeting_prep, relationship_scan, custom
  budget_tokens_max   integer,
  budget_cost_max     decimal(10,4),
  domain_scope        text[] NOT NULL,         -- allowed domain vectors
  allowed_actions     jsonb NOT NULL,          -- { read: 'free', stage_write: 'free', graph_write: 'human_approval', external_send: 'hard_gate' }
  source_scope        jsonb,                   -- allowed source IDs/types. null = all
  time_limit_seconds  integer,
  escalation_rules    jsonb,
  enabled             boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_policies_type ON mission_policies(mission_type);
```

### model_preferences
User-selected model defaults per task type (D22).

```sql
CREATE TABLE model_preferences (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type  varchar(50) NOT NULL,           -- extraction, conversation, briefing, recommendation, triage, maintenance
  provider   varchar(50) NOT NULL,           -- anthropic, google, openai
  model_id   varchar(100) NOT NULL,          -- claude-haiku-4.5, claude-sonnet-4.6, etc.
  is_default boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_preferences_default ON model_preferences(task_type) WHERE is_default = true;
```

### system_context
Versioned operating context document. The CLAUDE.md equivalent for Meridian agents.

```sql
CREATE TABLE system_context (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version         integer NOT NULL,
  content         text NOT NULL,              -- full operating context document
  change_summary  text,
  approved_by     varchar(100),               -- always human
  active          boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_context_active ON system_context(active) WHERE active = true;
```

### sessions
Development session metadata. Seeds with historical session data.

```sql
CREATE TABLE sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_number     integer NOT NULL UNIQUE,
  date               date NOT NULL,
  theme              text NOT NULL,
  decisions_made     text[],                   -- {D01, D02, ...}
  issues_resolved    text[],
  issues_opened      text[],
  artifacts_produced text[],
  deep_context_ref   text,                     -- reference to full deep context
  summary            text,                     -- migration 003: 2-3 sentence blurb for MCP queries
  created_at         timestamptz NOT NULL DEFAULT now()
);
```

### decisions
All architectural decisions. Queryable by component, layer, status.

```sql
CREATE TABLE decisions (
  id                   varchar(10) PRIMARY KEY,  -- D01, D02, etc.
  session_number       integer NOT NULL,
  status               varchar(30) NOT NULL,     -- active, superseded, reversed, pending_validation
  superseded_by        varchar(10),              -- references decisions.id
  summary              text NOT NULL,
  rationale            text NOT NULL,
  components_affected  text[],
  layers_affected      text[],                   -- context, memory, skills, harness, orchestration, self_maintenance
  decided_at           date,                     -- migration 003: when the decision was made
  related_issues       text[],                   -- migration 003: issue IDs this decision touches
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_decisions_status ON decisions(status);
```

### issues
Project issue register with blocking relationships.

```sql
CREATE TABLE issues (
  id                 varchar(20) PRIMARY KEY,    -- MER-01, CAG-02, etc.
  session_opened     integer NOT NULL,
  session_resolved   integer,
  status             varchar(20) NOT NULL,       -- open, resolved, superseded, deferred
  severity           varchar(20) NOT NULL,       -- critical, high, medium, low
  component          varchar(100),
  summary            text NOT NULL,              -- one-line headline
  resolution         text,
  blocked_by         text[],                     -- issue IDs
  blocks             text[],                     -- issue IDs
  description        text,                       -- migration 003: long-form context
  phase              smallint,                   -- migration 003: project phase (0-5)
  related_decisions  text[],                     -- migration 003: decision IDs
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_issues_status ON issues(status);
CREATE INDEX idx_issues_severity ON issues(severity);
CREATE INDEX idx_issues_component ON issues(component);
```

### stack_components
Static technology inventory (migration 002, D34). Describes *what is in the stack* — a registry that answers "does Meridian use X?" Distinct from `tech_watch`, which logs events *about* that stack (releases, deprecations, breaking changes) and is fed by the Phase 1 monitoring agent.

```sql
CREATE TABLE stack_components (
  id         serial       PRIMARY KEY,
  component  varchar(100) NOT NULL UNIQUE,      -- apache_age, fastify, zuplo, ...
  technology varchar(200) NOT NULL,             -- descriptive name
  version    varchar(50),                       -- "18.3", "latest", "current"
  status     varchar(50)  NOT NULL DEFAULT 'planned', -- planned, selected, deployed, deprecated
  phase      smallint,                          -- introducing phase (0-5)
  notes      text,
  created_at timestamptz  NOT NULL DEFAULT now(),
  updated_at timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_stack_components_status ON stack_components(status);
CREATE INDEX idx_stack_components_phase  ON stack_components(phase);
```

**`serial` primary key — intentional exception to the uuid-PK convention.** Small static inventory tables with single-digit row counts that are never referenced by external systems do not benefit from uuid overhead. All other Phase 0 tables follow `uuid DEFAULT gen_random_uuid()`.

### tech_watch
Monitoring Meridian's own technology dependencies. The first intelligence source.

```sql
CREATE TABLE tech_watch (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technology          varchar(100) NOT NULL,    -- apache_age, zuplo, railway, anthropic_api, nodejs, postgresql
  event_type          varchar(50) NOT NULL,     -- release, deprecation, breaking_change, security_patch, status_incident, feature_launch
  title               text NOT NULL,
  details             text,
  source_url          text,
  impact_assessment   text,                     -- how this affects Meridian
  affects_components  text[],
  status              varchar(20) NOT NULL DEFAULT 'new', -- new, reviewed, actioned, dismissed
  detected_at         timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_techwatch_tech ON tech_watch(technology);
CREATE INDEX idx_techwatch_status ON tech_watch(status);
CREATE INDEX idx_techwatch_detected ON tech_watch(detected_at DESC);
```

---

## AGE Graph Schema

The AGE graph (Cypher) coexists with the relational tables above. Full schema specification: `docs/SCHEMA.md`.

Summary: 9 node types (Person, Company, Organization, Project, Event, Commitment, Decision, Location, Document), 13 edge types, 4 domain vectors. Schema-optional — AGE enforces nothing, conventions enforce everything.

### Creating the graph
```sql
SELECT create_graph('meridian');
```

### Cypher query pattern (via AGE SQL wrapper)
```sql
SELECT * FROM cypher('meridian', $$
  MATCH (p:Person)-[:WORKS_AT]->(c:Company)
  WHERE c.name = 'Acme Corp'
  RETURN p.name, p.email_addresses
$$) AS (name agtype, emails agtype);
```

### Graph operations always go through the API service
Never write directly to the graph from extraction code. The flow is:
1. Extraction → `staged_extractions` table (D24)
2. Human review via triage interface
3. Approved entities → API service → Cypher CREATE/MERGE to AGE

---

## Indexing Strategy

### Full-text search
The `content_tsv` column on `raw_items` is the primary FTS surface. Maintained via trigger:

```sql
CREATE FUNCTION update_content_tsv() RETURNS trigger AS $$
BEGIN
  NEW.content_tsv := to_tsvector('english', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_raw_items_tsv
  BEFORE INSERT OR UPDATE ON raw_items
  FOR EACH ROW EXECUTE FUNCTION update_content_tsv();
```

### JSONB indexes
GIN indexes on `extracted_json` (staged_extractions) and `event_data` (agent_events) for path queries:
```sql
-- Find all extractions containing a specific entity name
SELECT * FROM staged_extractions
WHERE extracted_json @> '{"nodes": [{"properties": {"name": "Acme Corp"}}]}';
```

### Partial indexes
Used where most queries filter on a specific value:
```sql
-- Most queries against sources only want enabled ones
CREATE INDEX idx_sources_enabled ON sources(enabled) WHERE enabled = true;

-- Only one system_context version is active
CREATE UNIQUE INDEX idx_context_active ON system_context(active) WHERE active = true;

-- Only one default model per task type
CREATE UNIQUE INDEX idx_preferences_default ON model_preferences(task_type) WHERE is_default = true;
```

---

## Seed Data

Seed data is stored as structured JSON at `.meridian/data/seed/meridian-seed-data.json` and loaded via `npx tsx src/scripts/seed.ts`. The seed script supports `--reseed` (or `RESEED=1`) for full truncate-and-reload during development.

Seed JSON field names map directly to DDL column names; where older entries retain legacy vocabulary the script's adapter functions tolerate both shapes. `system_context` (versioned document, D33) and `stack_components` (technology inventory, D34) are seeded by a separate script, `src/scripts/seed-002.ts`, because their shape is not per-row JSON.

Inserts use `ON CONFLICT DO NOTHING`, making reruns idempotent outside of `--reseed` mode.
