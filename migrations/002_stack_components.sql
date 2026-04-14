-- Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.
-- Migration: 002_stack_components
-- Description: New technology inventory table (D34). Splits the "what's in
--              the stack" concern away from `tech_watch`, which remains the
--              event log (releases / deprecations / breaking changes) fed
--              by the Phase 1 monitoring agent.
-- Ref:         D34; resolves INS-013 from .meridian/insights/2026-04-14_phase0-scaffold.md
-- Date:        2026-04-14

BEGIN;

CREATE TABLE IF NOT EXISTS stack_components (
  id         serial       PRIMARY KEY,
  component  varchar(100) NOT NULL UNIQUE,
  technology varchar(200) NOT NULL,
  version    varchar(50),
  status     varchar(50)  NOT NULL DEFAULT 'planned',
  phase      smallint,
  notes      text,
  created_at timestamptz  NOT NULL DEFAULT now(),
  updated_at timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stack_components_status ON stack_components(status);
CREATE INDEX IF NOT EXISTS idx_stack_components_phase  ON stack_components(phase);

INSERT INTO schema_migrations (version) VALUES (2)
  ON CONFLICT (version) DO NOTHING;

COMMIT;
