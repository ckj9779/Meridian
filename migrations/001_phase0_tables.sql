-- Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.
-- Migration: 001_phase0_tables
-- Description: Phase 0 relational tables — project state and source registry.
-- Tables: decisions, issues, sessions, system_context, model_preferences,
--         tech_watch, sources (plus schema_migrations tracker row).
-- Ref:    SAD Section 7.1; docs/DATABASE.md; D30, D31, MER-17.
-- Date:   2026-04-14

BEGIN;

-- decisions ------------------------------------------------------------------
-- Architectural decisions. Queryable by session, component, layer, status.
-- Primary key is the human-readable ID (D01, D02, ...).
CREATE TABLE IF NOT EXISTS decisions (
  id                  varchar(10)  PRIMARY KEY,
  session_number      integer      NOT NULL,
  status              varchar(30)  NOT NULL,
  superseded_by       varchar(10),
  summary             text         NOT NULL,
  rationale           text         NOT NULL,
  components_affected text[],
  layers_affected     text[],
  created_at          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);

-- issues ---------------------------------------------------------------------
-- Project issue register with blocking relationships.
CREATE TABLE IF NOT EXISTS issues (
  id               varchar(20) PRIMARY KEY,
  session_opened   integer     NOT NULL,
  session_resolved integer,
  status           varchar(20) NOT NULL,
  severity         varchar(20) NOT NULL,
  component        varchar(100),
  summary          text        NOT NULL,
  resolution       text,
  blocked_by       text[],
  blocks           text[],
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issues_status    ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_severity  ON issues(severity);
CREATE INDEX IF NOT EXISTS idx_issues_component ON issues(component);

-- sessions -------------------------------------------------------------------
-- Development session metadata. Seeds with historical sessions 01-06.
CREATE TABLE IF NOT EXISTS sessions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_number     integer     NOT NULL UNIQUE,
  date               date        NOT NULL,
  theme              text        NOT NULL,
  decisions_made     text[],
  issues_resolved    text[],
  issues_opened      text[],
  artifacts_produced text[],
  deep_context_ref   text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- system_context -------------------------------------------------------------
-- Versioned operating context document. CLAUDE.md equivalent for agents.
-- Partial unique index ensures exactly one active version at a time.
CREATE TABLE IF NOT EXISTS system_context (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  version        integer     NOT NULL,
  content        text        NOT NULL,
  change_summary text,
  approved_by    varchar(100),
  active         boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_context_active
  ON system_context(active) WHERE active = true;

-- model_preferences ----------------------------------------------------------
-- User-selected model defaults per task type (D22).
-- Partial unique index ensures exactly one default per task_type.
CREATE TABLE IF NOT EXISTS model_preferences (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type  varchar(50) NOT NULL,
  provider   varchar(50) NOT NULL,
  model_id   varchar(100) NOT NULL,
  is_default boolean     NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_preferences_default
  ON model_preferences(task_type) WHERE is_default = true;

-- tech_watch -----------------------------------------------------------------
-- Monitoring Meridian's own technology dependencies.
CREATE TABLE IF NOT EXISTS tech_watch (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  technology         varchar(100) NOT NULL,
  event_type         varchar(50) NOT NULL,
  title              text        NOT NULL,
  details            text,
  source_url         text,
  impact_assessment  text,
  affects_components text[],
  status             varchar(20) NOT NULL DEFAULT 'new',
  detected_at        timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_techwatch_tech     ON tech_watch(technology);
CREATE INDEX IF NOT EXISTS idx_techwatch_status   ON tech_watch(status);
CREATE INDEX IF NOT EXISTS idx_techwatch_detected ON tech_watch(detected_at DESC);

-- sources --------------------------------------------------------------------
-- Intelligence source definitions. Empty in Phase 0 (MER-16 — not yet populated).
CREATE TABLE IF NOT EXISTS sources (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type            varchar(50) NOT NULL,
  name            varchar(255) NOT NULL,
  identifier      text        NOT NULL,
  description     text,
  frequency       varchar(20) NOT NULL,
  priority        varchar(20) NOT NULL,
  domains         text[]      NOT NULL,
  enabled         boolean     NOT NULL DEFAULT true,
  agent_notes     text,
  last_scanned_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sources_type    ON sources(type);
CREATE INDEX IF NOT EXISTS idx_sources_enabled ON sources(enabled) WHERE enabled = true;

-- Record this migration as applied.
INSERT INTO schema_migrations (version) VALUES (1)
  ON CONFLICT (version) DO NOTHING;

COMMIT;
