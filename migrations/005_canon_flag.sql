-- Copyright (c) 2026 Charles K. Johnson. Licensed under BSL 1.1 — see LICENSE.
-- Migration: 005_canon_flag.sql
-- D70 — Canon boolean flag on decisions table.
-- MER-51.
-- NOT APPLIED TO RAILWAY in Sprint 08.5. Apply in Sprint 10a alongside 004.

BEGIN;

ALTER TABLE decisions
  ADD COLUMN IF NOT EXISTS canon BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_decisions_canon ON decisions(canon) WHERE canon = TRUE;

INSERT INTO schema_migrations (version, applied_at) VALUES (005, NOW());

COMMIT;
