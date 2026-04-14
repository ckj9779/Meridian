-- Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.
-- Migration: 003_schema_seed_alignment
-- Description: Additive schema changes to align DDL with seed-data vocabulary.
--              No renames, no drops. Existing rows are unaffected (columns
--              default to NULL). Re-running seed.ts with --reseed will backfill
--              these columns from the updated JSON.
-- Ref:         Resolves INS-004 through INS-011 in
--              .meridian/insights/2026-04-14_phase0-scaffold.md
-- Date:        2026-04-14

BEGIN;

-- decisions ------------------------------------------------------------------
ALTER TABLE decisions
  ADD COLUMN IF NOT EXISTS decided_at     date,
  ADD COLUMN IF NOT EXISTS related_issues text[];

-- issues ---------------------------------------------------------------------
-- `description` is the long-form body of an issue. `summary` remains the
-- one-line headline. `phase` lets us partition the issue register by project
-- phase. `related_decisions` links issues back into the decision register.
ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS description        text,
  ADD COLUMN IF NOT EXISTS phase              smallint,
  ADD COLUMN IF NOT EXISTS related_decisions  text[];

-- sessions -------------------------------------------------------------------
-- `summary` gives MCP-driven queries a short prose blurb per session without
-- having to pull the full deep-context reference.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS summary text;

INSERT INTO schema_migrations (version) VALUES (3)
  ON CONFLICT (version) DO NOTHING;

COMMIT;
