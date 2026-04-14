// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

/**
 * Shared type definitions for Phase 0 relational tables.
 *
 * Field names match database column names (snake_case) per
 * `docs/CODING_STANDARDS.md:67`. PascalCase interface names per `:64`.
 *
 * Column definitions are sourced from `docs/DATABASE.md`.
 */

export const DECISION_STATUS = {
  ACTIVE: 'active',
  SUPERSEDED: 'superseded',
  REVERSED: 'reversed',
  PENDING_VALIDATION: 'pending_validation',
} as const;
export type DecisionStatus = (typeof DECISION_STATUS)[keyof typeof DECISION_STATUS];

export interface Decision {
  id: string; // D01, D02, ...
  session_number: number;
  status: DecisionStatus;
  superseded_by: string | null;
  summary: string;
  rationale: string;
  components_affected: string[] | null;
  layers_affected: string[] | null;
  created_at: Date;
}

export const ISSUE_STATUS = {
  OPEN: 'open',
  RESOLVED: 'resolved',
  SUPERSEDED: 'superseded',
  DEFERRED: 'deferred',
} as const;
export type IssueStatus = (typeof ISSUE_STATUS)[keyof typeof ISSUE_STATUS];

export const ISSUE_SEVERITY = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;
export type IssueSeverity = (typeof ISSUE_SEVERITY)[keyof typeof ISSUE_SEVERITY];

export interface Issue {
  id: string; // MER-01, CAG-02, ...
  session_opened: number;
  session_resolved: number | null;
  status: IssueStatus;
  severity: IssueSeverity;
  component: string | null;
  summary: string;
  resolution: string | null;
  blocked_by: string[] | null;
  blocks: string[] | null;
  created_at: Date;
  updated_at: Date;
}

export interface Session {
  id: string; // uuid
  session_number: number;
  date: string; // ISO date (YYYY-MM-DD)
  theme: string;
  decisions_made: string[] | null;
  issues_resolved: string[] | null;
  issues_opened: string[] | null;
  artifacts_produced: string[] | null;
  deep_context_ref: string | null;
  created_at: Date;
}

export interface SystemContext {
  id: string; // uuid
  version: number;
  content: string;
  change_summary: string | null;
  approved_by: string | null;
  active: boolean;
  created_at: Date;
}

export interface ModelPreference {
  id: string; // uuid
  task_type: string;
  provider: string;
  model_id: string;
  is_default: boolean;
  updated_at: Date;
}

export const TECH_WATCH_STATUS = {
  NEW: 'new',
  REVIEWED: 'reviewed',
  ACTIONED: 'actioned',
  DISMISSED: 'dismissed',
} as const;
export type TechWatchStatus = (typeof TECH_WATCH_STATUS)[keyof typeof TECH_WATCH_STATUS];

export interface TechWatch {
  id: string; // uuid
  technology: string;
  event_type: string;
  title: string;
  details: string | null;
  source_url: string | null;
  impact_assessment: string | null;
  affects_components: string[] | null;
  status: TechWatchStatus;
  detected_at: Date;
  created_at: Date;
}

export interface Source {
  id: string; // uuid
  type: string;
  name: string;
  identifier: string;
  description: string | null;
  frequency: string;
  priority: string;
  domains: string[];
  enabled: boolean;
  agent_notes: string | null;
  last_scanned_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Response envelope shape — matches `docs/CODING_STANDARDS.md:148-171`.
 */
export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    per_page?: number;
  };
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
