-- Copyright (c) 2026 Charles K. Johnson
-- SPDX-License-Identifier: BSL-1.1
-- Migration 006: audit layer — audit_events, credential_rotations, storage_targets

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: audit_events
-- Per-request attribution log. D43 (identity), D48 (observability cascade),
-- D54 (audit data feeds knowledge graph). ULID PKs — time-sortable by design.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE audit_events (
  id                   TEXT        PRIMARY KEY,
  trace_id             TEXT        NOT NULL,
  timestamp            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  caller_identity      TEXT        NOT NULL,
  caller_type          TEXT        NOT NULL CHECK (caller_type IN (
                                     'human_pat',
                                     'm2m_claude_code',
                                     'm2m_agent',
                                     'm2m_meridian',
                                     'anonymous'
                                   )),
  auth_method          TEXT        NOT NULL CHECK (auth_method IN (
                                     'clerk_pat',
                                     'clerk_m2m_jwt',
                                     'clerk_session',
                                     'gateway_secret_only'
                                   )),
  http_method          TEXT        NOT NULL CHECK (http_method IN (
                                     'GET','HEAD','POST','PUT',
                                     'PATCH','DELETE','OPTIONS'
                                   )),
  route                TEXT        NOT NULL,
  status_code          INTEGER     NOT NULL,
  duration_ms          INTEGER,
  request_body_hash    TEXT,
  response_summary     TEXT,
  machine_fingerprint  TEXT,
  topics               JSONB,
  entities_referenced  JSONB,
  decisions_referenced JSONB
);

CREATE INDEX idx_audit_events_trace_id         ON audit_events(trace_id);
CREATE INDEX idx_audit_events_caller_identity  ON audit_events(caller_identity);
CREATE INDEX idx_audit_events_timestamp        ON audit_events(timestamp);
CREATE INDEX idx_audit_events_http_method      ON audit_events(http_method);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: credential_rotations
-- Lifecycle tracking for PATs, M2M secrets, API keys. D40, D44, D74.
-- One row per credential, updated in place on rotation. DB-default UUID is
-- acceptable here — not a graph or pagination surface.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE credential_rotations (
  id                      TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  credential_name         TEXT        NOT NULL UNIQUE,
  credential_type         TEXT        NOT NULL CHECK (credential_type IN (
                                        'human_pat',
                                        'm2m_machine_secret',
                                        'backend_secret',
                                        'api_key'
                                      )),
  mint_date               DATE        NOT NULL,
  expiry_date             DATE,
  rotation_cadence_days   INTEGER,
  last_reminder_sent      TIMESTAMPTZ,
  rotation_confirmed_date DATE,
  status                  TEXT        NOT NULL DEFAULT 'active'
                                      CHECK (status IN (
                                        'active','rotated','revoked','expired'
                                      ))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: storage_targets
-- Local cold storage drive registry. D49 (local primary), D53 (sovereignty).
-- Updated by audit-export.ts on each run. DB-default UUID acceptable —
-- not a graph or pagination surface.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE storage_targets (
  id                  TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  drive_id            TEXT        NOT NULL UNIQUE,
  label               TEXT        NOT NULL,
  mount_path          TEXT        NOT NULL,
  last_seen           TIMESTAMPTZ,
  capacity_bytes      BIGINT,
  encryption_status   TEXT        NOT NULL DEFAULT 'unknown'
                                  CHECK (encryption_status IN (
                                    'encrypted','unencrypted','unknown'
                                  )),
  is_accessible       BOOLEAN     NOT NULL DEFAULT FALSE
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: credential_rotations bootstrap rows
-- Mirrors the current SECRETS.md pointer registry.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO credential_rotations
  (credential_name, credential_type, mint_date, expiry_date,
   rotation_cadence_days, status)
VALUES
  ('CLERK_HUMAN_PAT',  'human_pat',      '2026-04-21', '2026-05-21', 30, 'active'),
  ('BACKEND_SECRET',   'backend_secret', '2026-04-21', NULL,         90, 'active'),
  ('CLERK_SECRET_KEY', 'api_key',        '2026-04-19', NULL,         90, 'active');

-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO schema_migrations (version, applied_at)
VALUES (6, NOW());

COMMIT;
