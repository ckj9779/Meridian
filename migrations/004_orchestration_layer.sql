-- Copyright (c) 2026 Charles K. Johnson. Licensed under BSL 1.1 — see LICENSE.
-- Migration: 004_orchestration_layer.sql
-- Purpose: Agent orchestration tables — missions, policies, sessions, metrics, promotion pathway
-- Decision refs: D24, D35, D43, D48, D59, D60, and harness layer (Session 05 Phase 7)
-- Phase: Designed Session 08, reconciled Sprint 08.5 (MER-33, MER-34, MER-47)

BEGIN;

-- ============================================================================
-- identities (D59 — must come first; all other tables FK to this)
-- ============================================================================
-- Registry of all actor identities per D43 Universal Attribution.
-- Identities are retired, never deleted — historical attribution remains queryable.
-- Classes: human, machine, agent, system (D43 taxonomy).

CREATE TABLE IF NOT EXISTS identities (
    id                SERIAL PRIMARY KEY,
    identity_string   TEXT        NOT NULL UNIQUE,
    class             TEXT        NOT NULL CHECK (class IN ('human','machine','agent','system')),
    description       TEXT,
    active            BOOLEAN     NOT NULL DEFAULT TRUE,
    registered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    retired_at        TIMESTAMPTZ NULL,
    retired_reason    TEXT        NULL
);

CREATE INDEX IF NOT EXISTS idx_identities_class  ON identities(class);
CREATE INDEX IF NOT EXISTS idx_identities_active ON identities(active) WHERE active = TRUE;

-- Seed bootstrap identities (D59). ON CONFLICT DO NOTHING for re-runnability.
INSERT INTO identities (identity_string, class, description) VALUES
    ('system:anonymous',                'system',  'Reserved identity for pre-authentication rejections (D59)'),
    ('machine:starshipone-claude-code', 'machine', 'Claude Code on StarshipOne WSL (D42)'),
    ('machine:meridian-api',            'machine', 'Meridian API service on Railway (D47)'),
    ('human:chaz-clerk-pat',            'human',   'Human identity — Clerk PAT authenticated (D40)')
ON CONFLICT (identity_string) DO NOTHING;

-- ============================================================================
-- agent_missions
-- ============================================================================
-- Defines what an agent does. One row per mission type.
-- A mission is the persistent definition; sessions are individual executions.
-- Examples: "youtube_intel_scanner", "tech_stack_monitor", "email_extraction_batch"

CREATE TABLE IF NOT EXISTS agent_missions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL UNIQUE,
    description     TEXT,
    mission_type    TEXT NOT NULL CHECK (mission_type IN (
                        'intel_scanner',
                        'extraction_worker',
                        'briefing_generator',
                        'triage_assistant',
                        'maintenance',
                        'development',
                        'custom'
                    )),
    runtime         TEXT NOT NULL DEFAULT 'managed_agent' CHECK (runtime IN (
                        'managed_agent',
                        'routine'
                    )),
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                        'draft',
                        'active',
                        'paused',
                        'promoted',
                        'demoted',
                        'retired'
                    )),

    -- Managed Agent configuration (populated when runtime = 'managed_agent')
    managed_agent_id    TEXT,              -- Anthropic agent ID from /v1/agents
    environment_id      TEXT,              -- Anthropic environment ID from /v1/environments

    -- Routine configuration (populated when runtime = 'routine')
    routine_id          TEXT,              -- Claude Code routine ID
    routine_trigger_url TEXT,              -- /fire endpoint URL for API-triggered routines

    -- Common configuration
    system_prompt       TEXT,              -- The agent's system prompt / routine prompt
    model               TEXT NOT NULL DEFAULT 'claude-haiku-4-5',
    tools               JSONB DEFAULT '[]'::jsonb,     -- MCP tools, connectors, skills
    sources             UUID[] DEFAULT '{}',           -- FK references to sources table
    allowed_domains     TEXT[] DEFAULT '{}',            -- Domain scope from harness (D35)
    schedule_cron       TEXT,              -- Cron expression for scheduled missions (NULL = on-demand)
    trigger_type        TEXT CHECK (trigger_type IN (
                            'scheduled',
                            'api',
                            'github_event',
                            'webhook',
                            'manual'
                        )),

    -- Promotion tracking
    promoted_from       UUID REFERENCES agent_missions(id),  -- If runtime=routine, the managed_agent mission it was promoted from
    promoted_at         TIMESTAMPTZ,
    demoted_at          TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- D43/D59 attribution columns
    actor_identity_id   INTEGER     NOT NULL REFERENCES identities(id),
    endpoint            TEXT        NULL,
    environment         TEXT        NOT NULL DEFAULT 'production',
    host                TEXT        NULL,
    ip_address          INET        NULL,
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_time_ns       BIGINT      NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_missions_status ON agent_missions(status);
CREATE INDEX IF NOT EXISTS idx_agent_missions_runtime ON agent_missions(runtime);
CREATE INDEX IF NOT EXISTS idx_agent_missions_type ON agent_missions(mission_type);

-- ============================================================================
-- mission_policies
-- ============================================================================
-- Harness constraints per mission. One row per mission.
-- Layer 4 (Harness) enforcement rules: budget, domain, action, scope, time, escalation.
-- Referenced at runtime by Fastify middleware on every agent-to-tool call.

CREATE TABLE IF NOT EXISTS mission_policies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id      UUID NOT NULL UNIQUE REFERENCES agent_missions(id) ON DELETE CASCADE,

    -- Budget constraints
    max_tokens_per_session      INTEGER,                -- Token ceiling per session
    max_cost_per_session_usd    NUMERIC(10,4),          -- Dollar ceiling per session
    max_sessions_per_day        INTEGER DEFAULT 1,      -- Daily session cap
    max_cost_per_day_usd        NUMERIC(10,4),          -- Daily dollar ceiling

    -- Domain scope (harness-enforced, complements allowed_domains on mission)
    domain_scope    TEXT[] NOT NULL DEFAULT '{}',        -- Allowed domain vectors for graph queries
    -- Empty = all domains accessible (cross-domain). Populated = strict filter.

    -- Action gates (D24: human-in-the-loop is architectural)
    action_gates    JSONB NOT NULL DEFAULT '{
        "read": "free",
        "stage_write": "free",
        "graph_write": "human_approval",
        "external_send": "hard_gate"
    }'::jsonb,

    -- Scope constraints
    allowed_sources     UUID[] DEFAULT '{}',            -- Source IDs this mission can scan
    allowed_graph_labels TEXT[] DEFAULT '{}',            -- Node labels this mission can query (empty = all)

    -- Time constraints
    session_timeout_minutes     INTEGER DEFAULT 30,     -- Max session duration before auto-checkpoint
    checkpoint_interval_minutes INTEGER DEFAULT 10,     -- Checkpoint frequency within a session

    -- Escalation rules
    escalation_triggers JSONB NOT NULL DEFAULT '{
        "low_confidence_threshold": 0.6,
        "contradictory_data": true,
        "authority_boundary_crossed": true,
        "budget_exceeded": true
    }'::jsonb,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- D43/D59 attribution columns
    actor_identity_id   INTEGER     NOT NULL REFERENCES identities(id),
    endpoint            TEXT        NULL,
    environment         TEXT        NOT NULL DEFAULT 'production',
    host                TEXT        NULL,
    ip_address          INET        NULL,
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_time_ns       BIGINT      NULL
);

-- ============================================================================
-- agent_sessions
-- ============================================================================
-- One row per execution instance of a mission.
-- Captures execution telemetry for metrics rollup and promotion evaluation.
-- Maps to Managed Agents "session" primitive or Routine "run".

CREATE TABLE IF NOT EXISTS agent_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id      UUID NOT NULL REFERENCES agent_missions(id),

    -- Execution identity
    runtime         TEXT NOT NULL CHECK (runtime IN ('managed_agent', 'routine')),
    external_session_id TEXT,              -- Anthropic session ID or Routine run ID
    session_url     TEXT,                  -- URL to view session in claude.ai

    -- Trigger context
    trigger_type    TEXT NOT NULL CHECK (trigger_type IN (
                        'scheduled',
                        'api',
                        'github_event',
                        'webhook',
                        'manual'
                    )),
    trigger_payload JSONB,                 -- The event/payload that triggered this session

    -- Execution results
    status          TEXT NOT NULL DEFAULT 'running' CHECK (status IN (
                        'running',
                        'completed',
                        'failed',
                        'timeout',
                        'escalated',
                        'cancelled'
                    )),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    duration_seconds INTEGER,              -- Computed on completion

    -- Telemetry
    tokens_input    INTEGER DEFAULT 0,
    tokens_output   INTEGER DEFAULT 0,
    cost_usd        NUMERIC(10,6) DEFAULT 0,
    tool_calls      INTEGER DEFAULT 0,
    errors          INTEGER DEFAULT 0,

    -- Human interaction tracking (critical for promotion evaluation)
    human_interventions INTEGER DEFAULT 0, -- Mid-session human inputs or corrections
    escalations         INTEGER DEFAULT 0, -- Harness-triggered escalations
    graph_writes_requested  INTEGER DEFAULT 0,
    graph_writes_approved   INTEGER DEFAULT 0,
    graph_writes_rejected   INTEGER DEFAULT 0,

    -- Outcome
    result_summary  TEXT,                  -- Agent's own summary of what it accomplished
    artifacts       JSONB DEFAULT '[]'::jsonb, -- References to produced artifacts (PRs, briefings, staged entities)

    -- Error details (when status = 'failed' or 'timeout')
    error_type      TEXT,
    error_message   TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- D43/D59 attribution columns
    actor_identity_id   INTEGER     NOT NULL REFERENCES identities(id),
    endpoint            TEXT        NULL,
    environment         TEXT        NOT NULL DEFAULT 'production',
    host                TEXT        NULL,
    ip_address          INET        NULL,
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_time_ns       BIGINT      NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_mission ON agent_sessions(mission_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_started ON agent_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_mission_started ON agent_sessions(mission_id, started_at);

-- ============================================================================
-- agent_events
-- ============================================================================
-- Full audit log of every agent action within a session.
-- Episodic memory (Layer 2). Persisted from Managed Agent event stream or Routine session log.
-- Granular — one row per tool call, message, or state change.

CREATE TABLE IF NOT EXISTS agent_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
    mission_id      UUID NOT NULL REFERENCES agent_missions(id),

    event_type      TEXT NOT NULL CHECK (event_type IN (
                        'user_message',
                        'agent_message',
                        'tool_use',
                        'tool_result',
                        'escalation',
                        'checkpoint',
                        'error',
                        'status_change',
                        'harness_block',
                        'human_intervention',
                        'stage_entry',
                        'stage_exit',
                        'stage_failure',
                        'stage_retry'
                    )),
    event_data      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- Event-type-specific payload
    sequence_num    INTEGER NOT NULL,       -- Ordering within the session

    -- D43/D59 attribution columns (occurred_at already exists above — not duplicated)
    actor_identity_id   INTEGER     NOT NULL REFERENCES identities(id),
    endpoint            TEXT        NULL,
    environment         TEXT        NOT NULL DEFAULT 'production',
    host                TEXT        NULL,
    ip_address          INET        NULL,
    event_time_ns       BIGINT      NULL,

    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_events_session ON agent_events(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_events_session_seq ON agent_events(session_id, sequence_num);
CREATE INDEX IF NOT EXISTS idx_agent_events_type ON agent_events(event_type);
CREATE INDEX IF NOT EXISTS idx_agent_events_mission ON agent_events(mission_id);

-- ============================================================================
-- mission_metrics_daily
-- ============================================================================
-- Daily rollup of session metrics per mission.
-- Computed by a scheduled maintenance task (or Routine) from agent_sessions.
-- Drives the 30-day promotion evaluation window.

CREATE TABLE IF NOT EXISTS mission_metrics_daily (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id      UUID NOT NULL REFERENCES agent_missions(id),
    metric_date     DATE NOT NULL,

    -- Session counts
    sessions_total          INTEGER NOT NULL DEFAULT 0,
    sessions_completed      INTEGER NOT NULL DEFAULT 0,
    sessions_failed         INTEGER NOT NULL DEFAULT 0,
    sessions_timeout        INTEGER NOT NULL DEFAULT 0,
    sessions_escalated      INTEGER NOT NULL DEFAULT 0,
    sessions_cancelled      INTEGER NOT NULL DEFAULT 0,

    -- Derived rates (computed on insert for query convenience)
    completion_rate         NUMERIC(5,4),   -- sessions_completed / sessions_total
    failure_rate            NUMERIC(5,4),
    escalation_rate         NUMERIC(5,4),

    -- Human interaction
    human_interventions_total   INTEGER NOT NULL DEFAULT 0,
    human_intervention_rate     NUMERIC(5,4),   -- sessions with interventions / sessions_total

    -- Duration
    avg_duration_seconds    INTEGER,
    p90_duration_seconds    INTEGER,
    max_duration_seconds    INTEGER,

    -- Cost
    total_tokens_input      INTEGER NOT NULL DEFAULT 0,
    total_tokens_output     INTEGER NOT NULL DEFAULT 0,
    total_cost_usd          NUMERIC(10,4) NOT NULL DEFAULT 0,
    avg_cost_per_session_usd NUMERIC(10,6),

    -- Graph writes (D24 tracking)
    graph_writes_requested  INTEGER NOT NULL DEFAULT 0,
    graph_writes_approved   INTEGER NOT NULL DEFAULT 0,

    -- Policy changes (for "consistent scope" promotion criterion)
    policy_changes          INTEGER NOT NULL DEFAULT 0,  -- mission_policies edits on this date

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- D43/D59 attribution columns
    actor_identity_id   INTEGER     NOT NULL REFERENCES identities(id),
    endpoint            TEXT        NULL,
    environment         TEXT        NOT NULL DEFAULT 'production',
    host                TEXT        NULL,
    ip_address          INET        NULL,
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_time_ns       BIGINT      NULL,

    UNIQUE(mission_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_mission_metrics_mission_date ON mission_metrics_daily(mission_id, metric_date);

-- ============================================================================
-- promotion_thresholds
-- ============================================================================
-- Configurable promotion criteria per mission type.
-- User can adjust thresholds from the Meridian interface (Function 3).
-- Defaults match D35 specification. One row per mission_type + optional per-mission override.

CREATE TABLE IF NOT EXISTS promotion_thresholds (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Scope: mission_type applies to all missions of that type.
    -- mission_id overrides for a specific mission (more specific wins).
    mission_type    TEXT CHECK (mission_type IN (
                        'intel_scanner',
                        'extraction_worker',
                        'briefing_generator',
                        'triage_assistant',
                        'maintenance',
                        'development',
                        'custom'
                    )),
    mission_id      UUID REFERENCES agent_missions(id),

    -- Evaluation window
    evaluation_window_days  INTEGER NOT NULL DEFAULT 30,

    -- Threshold criteria (all must be met for promotion recommendation)
    min_completion_rate         NUMERIC(5,4) NOT NULL DEFAULT 0.9500,  -- ≥ 95%
    max_human_intervention_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0500,  -- ≤ 5%
    max_p90_duration_seconds    INTEGER NOT NULL DEFAULT 1800,          -- ≤ 30 minutes
    min_sessions_in_window      INTEGER NOT NULL DEFAULT 10,            -- Minimum sample size
    max_policy_changes          INTEGER NOT NULL DEFAULT 0,             -- Zero policy changes in window
    require_no_graph_write_approvals BOOLEAN NOT NULL DEFAULT TRUE,     -- No D24 approval gates

    -- Estimated cost savings (displayed in promotion recommendation)
    estimated_cost_reduction_pct NUMERIC(5,2) DEFAULT 40.00,           -- Estimated % cost savings

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- D43/D59 attribution columns
    actor_identity_id   INTEGER     NOT NULL REFERENCES identities(id),
    endpoint            TEXT        NULL,
    environment         TEXT        NOT NULL DEFAULT 'production',
    host                TEXT        NULL,
    ip_address          INET        NULL,
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_time_ns       BIGINT      NULL,

    -- At least one scope must be set
    CHECK (mission_type IS NOT NULL OR mission_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_promotion_thresholds_type ON promotion_thresholds(mission_type);
CREATE INDEX IF NOT EXISTS idx_promotion_thresholds_mission ON promotion_thresholds(mission_id);

-- ============================================================================
-- observability_readiness (D60)
-- ============================================================================
-- D60 — Sibling observability_readiness table for D48 promotion evaluation.
-- Permissive defaults here; Sprint 10a populates real readiness rows when
-- audit layer is operational. Promotion evaluation code (Sprint 11+) must
-- join against this table — no behavior-only promotion.

CREATE TABLE IF NOT EXISTS observability_readiness (
    id                   SERIAL PRIMARY KEY,
    mission_type         TEXT        NOT NULL,
    tier                 SMALLINT    NOT NULL CHECK (tier BETWEEN 0 AND 4),
    audit_stream_ready   BOOLEAN     NOT NULL DEFAULT FALSE,
    trace_propagation_ok BOOLEAN     NOT NULL DEFAULT FALSE,
    alert_wiring_ok      BOOLEAN     NOT NULL DEFAULT FALSE,
    retention_policy_ok  BOOLEAN     NOT NULL DEFAULT FALSE,
    last_verified_at     TIMESTAMPTZ NULL,
    notes                TEXT,
    actor_identity_id    INTEGER     NOT NULL REFERENCES identities(id),
    occurred_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (mission_type, tier)
);

CREATE INDEX IF NOT EXISTS idx_obs_readiness_mission_type ON observability_readiness(mission_type);

-- ============================================================================
-- promotion_evaluations
-- ============================================================================
-- 30-day evaluation snapshots. Generated by the recommendations engine.
-- Presented to the user in Function 1 (Conversational Triage) as promotion candidates.
-- User action recorded: approved, deferred, dismissed.

CREATE TABLE IF NOT EXISTS promotion_evaluations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id      UUID NOT NULL REFERENCES agent_missions(id),
    threshold_id    UUID NOT NULL REFERENCES promotion_thresholds(id),

    -- Evaluation window
    window_start    DATE NOT NULL,
    window_end      DATE NOT NULL,

    -- Computed metrics over the window (snapshot from mission_metrics_daily)
    total_sessions          INTEGER NOT NULL,
    completion_rate         NUMERIC(5,4) NOT NULL,
    human_intervention_rate NUMERIC(5,4) NOT NULL,
    p90_duration_seconds    INTEGER NOT NULL,
    policy_changes          INTEGER NOT NULL,
    graph_write_approvals   INTEGER NOT NULL,
    avg_cost_per_session_usd NUMERIC(10,6) NOT NULL,
    total_cost_usd          NUMERIC(10,4) NOT NULL,

    -- Threshold comparison (which criteria passed/failed)
    criteria_results    JSONB NOT NULL,
    -- Example: {
    --   "completion_rate": {"value": 0.9667, "threshold": 0.9500, "passed": true},
    --   "human_intervention_rate": {"value": 0.0333, "threshold": 0.0500, "passed": true},
    --   "p90_duration_seconds": {"value": 720, "threshold": 1800, "passed": true},
    --   "policy_changes": {"value": 0, "threshold": 0, "passed": true},
    --   "graph_write_approvals": {"value": 0, "threshold": 0, "passed": true},
    --   "min_sessions": {"value": 58, "threshold": 10, "passed": true}
    -- }

    -- Overall result
    all_criteria_met    BOOLEAN NOT NULL,
    estimated_monthly_savings_usd NUMERIC(10,4),

    -- Proposed routine configuration (preview for user review)
    proposed_routine_config JSONB,
    -- Contains: prompt, repos, connectors, trigger schedule, environment

    -- User disposition
    disposition     TEXT NOT NULL DEFAULT 'pending' CHECK (disposition IN (
                        'pending',
                        'approved',
                        'deferred',
                        'dismissed'
                    )),
    disposition_at      TIMESTAMPTZ,
    disposition_notes   TEXT,              -- User's reason for deferral or dismissal

    -- Execution result (after approval)
    routine_created     BOOLEAN DEFAULT FALSE,
    routine_id          TEXT,              -- The routine ID created on approval
    rollback_available  BOOLEAN DEFAULT TRUE,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- D43/D59 attribution columns
    actor_identity_id   INTEGER     NOT NULL REFERENCES identities(id),
    endpoint            TEXT        NULL,
    environment         TEXT        NOT NULL DEFAULT 'production',
    host                TEXT        NULL,
    ip_address          INET        NULL,
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_time_ns       BIGINT      NULL
);

CREATE INDEX IF NOT EXISTS idx_promotion_evaluations_mission ON promotion_evaluations(mission_id);
CREATE INDEX IF NOT EXISTS idx_promotion_evaluations_disposition ON promotion_evaluations(disposition);
CREATE INDEX IF NOT EXISTS idx_promotion_evaluations_pending ON promotion_evaluations(disposition) WHERE disposition = 'pending';

-- ============================================================================
-- escalations (Harness Layer 4)
-- ============================================================================
-- Actions blocked by the harness that require human review.
-- Written by Fastify middleware when an agent action hits a gate.
-- Presented in Function 1 (Conversational Triage) alongside extraction triage.

CREATE TABLE IF NOT EXISTS escalations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES agent_sessions(id),
    mission_id      UUID NOT NULL REFERENCES agent_missions(id),

    escalation_type TEXT NOT NULL CHECK (escalation_type IN (
                        'budget_exceeded',
                        'domain_violation',
                        'graph_write_approval',
                        'external_send_gate',
                        'low_confidence',
                        'contradictory_data',
                        'authority_boundary',
                        'scope_deviation',
                        'timeout_checkpoint'
                    )),

    -- What the agent was trying to do
    blocked_action  JSONB NOT NULL,        -- The action payload that was blocked
    agent_reasoning TEXT,                  -- Agent's explanation of why it wanted to take this action
    confidence      NUMERIC(3,2),          -- Agent's confidence in the blocked action

    -- Context
    context         JSONB,                 -- Surrounding session context relevant to the decision

    -- Resolution
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                        'pending',
                        'approved',
                        'rejected',
                        'modified',
                        'expired'
                    )),
    resolved_at     TIMESTAMPTZ,
    resolved_by     TEXT,                  -- 'user' or 'system' (for auto-expiry)
    resolution_notes TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- D43/D59 attribution columns
    actor_identity_id   INTEGER     NOT NULL REFERENCES identities(id),
    endpoint            TEXT        NULL,
    environment         TEXT        NOT NULL DEFAULT 'production',
    host                TEXT        NULL,
    ip_address          INET        NULL,
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_time_ns       BIGINT      NULL
);

CREATE INDEX IF NOT EXISTS idx_escalations_session ON escalations(session_id);
CREATE INDEX IF NOT EXISTS idx_escalations_mission ON escalations(mission_id);
CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations(status);
CREATE INDEX IF NOT EXISTS idx_escalations_pending ON escalations(status) WHERE status = 'pending';

-- ============================================================================
-- Default promotion thresholds (seed data)
-- ============================================================================
-- One row per mission type with D35 defaults.
-- User adjusts from the Meridian interface.
-- actor_identity_id references machine:meridian-api (D47) as the seeding actor.

INSERT INTO promotion_thresholds (mission_type, evaluation_window_days, min_completion_rate, max_human_intervention_rate, max_p90_duration_seconds, min_sessions_in_window, max_policy_changes, require_no_graph_write_approvals, estimated_cost_reduction_pct, actor_identity_id)
VALUES
    ('intel_scanner',       30, 0.9500, 0.0500, 1800, 20, 0, TRUE,  40.00, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('extraction_worker',   30, 0.9500, 0.0500, 3600, 10, 0, TRUE,  30.00, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('briefing_generator',  30, 0.9500, 0.0500, 1800, 15, 0, TRUE,  40.00, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('triage_assistant',    30, 0.9500, 0.0500, 1800, 10, 0, FALSE, 25.00, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('maintenance',         30, 0.9500, 0.0500, 900,  20, 0, TRUE,  50.00, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('development',         30, 0.9000, 0.1000, 3600, 5,  0, FALSE, 20.00, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('custom',              30, 0.9500, 0.0500, 1800, 10, 0, TRUE,  35.00, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api'));

-- ============================================================================
-- Default observability readiness (seed data — D60)
-- ============================================================================
-- 7 mission types × 5 tiers (0–4) = 35 rows. All booleans default FALSE.
-- Sprint 10a populates real readiness when audit layer is operational.
-- actor_identity_id references machine:meridian-api (D47) as the seeding actor.

INSERT INTO observability_readiness (mission_type, tier, actor_identity_id) VALUES
    ('intel_scanner',       0, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('intel_scanner',       1, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('intel_scanner',       2, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('intel_scanner',       3, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('intel_scanner',       4, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('extraction_worker',   0, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('extraction_worker',   1, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('extraction_worker',   2, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('extraction_worker',   3, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('extraction_worker',   4, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('briefing_generator',  0, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('briefing_generator',  1, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('briefing_generator',  2, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('briefing_generator',  3, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('briefing_generator',  4, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('triage_assistant',    0, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('triage_assistant',    1, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('triage_assistant',    2, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('triage_assistant',    3, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('triage_assistant',    4, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('maintenance',         0, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('maintenance',         1, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('maintenance',         2, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('maintenance',         3, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('maintenance',         4, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('development',         0, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('development',         1, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('development',         2, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('development',         3, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('development',         4, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('custom',              0, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('custom',              1, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('custom',              2, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('custom',              3, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api')),
    ('custom',              4, (SELECT id FROM identities WHERE identity_string = 'machine:meridian-api'))
ON CONFLICT (mission_type, tier) DO NOTHING;

-- ============================================================================
-- Schema migration record
-- ============================================================================
INSERT INTO schema_migrations (version, applied_at) VALUES ('004', NOW());

COMMIT;
