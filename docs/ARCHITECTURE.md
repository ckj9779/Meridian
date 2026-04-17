<!-- Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE. -->

# Meridian — Architecture Reference

> Derived from SAD Sections 5–6. Read this when working on system-level design or cross-layer integration.

## System Overview

Meridian is a six-layer agentic operating system built on a single PostgreSQL instance. All data — graph topology, relational tables, full-text indexes, document content — resides in one database. Three retrieval lenses provide different access patterns over the same canonical data. Zuplo exposes all capabilities as MCP tools. Claude acts as the agent layer via native tool-use.

```
┌─────────────────────────────────────────────────────────────┐
│  DATA SOURCES                                               │
│  Email corpus (M365, Gmail, iCloud, Live)                   │
│  Intelligence sources (YouTube, RSS, Reddit, HN, X, Gov)    │
│  Future: Slack, Calendar, Meeting transcripts               │
└──────────────────────────┬──────────────────────────────────┘
                           │ raw content
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: CONTEXT                                           │
│  Knowledge graph (AGE) │ Operating context │ Source defs     │
└──────────────────────────┬──────────────────────────────────┘
                           │ graph context ↕ agent writes
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 2: MEMORY — PostgreSQL + AGE on Railway              │
│  Graph topology │ Relational tables │ Episodic logs │ FTS   │
│  15 tables: sources, scan_runs, raw_items,                  │
│  staged_extractions, briefings, agent_events, corrections,  │
│  escalations, mission_policies, model_preferences,          │
│  system_context, sessions, decisions, issues, tech_watch    │
└──────────────────────────┬──────────────────────────────────┘
                           │ retrieval queries
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3: SKILLS                                            │
│  Three lenses │ Source scanners │ Extraction │ External tools│
│  All exposed as MCP tools via Zuplo                         │
└──────────────────────────┬──────────────────────────────────┘
                           │ skill invocations pass through
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 4: HARNESS                                           │
│  Budget │ Domain scope │ Action gates │ Scope │ Time │ Esc. │
│  Middleware in API service. Wraps all agent-to-tool calls.   │
└──────────────────────────┬──────────────────────────────────┘
                           │ approved actions
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 5: ORCHESTRATION                                     │
│  Orchestrator-worker pattern │ Agents API primitives         │
│  Agent → Environment → Session → Events                     │
│  Parallel execution │ Async webhooks │ Checkpointing        │
└──────────────────────────┬──────────────────────────────────┘
                           │ results + briefings
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  ZUPLO — API Gateway (Edge)                                 │
│  MCP Server Handler │ Semantic caching │ Rate limiting       │
│  Model routing (user preference) │ Observability            │
└──────────────────────────┬──────────────────────────────────┘
                           │ interface calls
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  MERIDIAN INTERFACE — Next.js on Vercel                     │
│  F1: Conversational Triage │ F2: Insight Explorer           │
│  F3: Execution Layer │ Recommendations │ Agent Monitor      │
│  Model selection settings │ Cost dashboard                  │
└──────────────────────────┬──────────────────────────────────┘
                           │ human corrections + decisions
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 6: SELF-MAINTENANCE                                  │
│  Correction tracking → prompt refinement                    │
│  Graph hygiene → duplicate detection, decay alerts          │
│  Context self-update → operating context diff proposals     │
│  ↻ Feedback loops back to Layers 1–3                        │
└─────────────────────────────────────────────────────────────┘
```

## Component Map

| Component | Technology | Hosting | Role |
|-----------|-----------|---------|------|
| Canonical store | PostgreSQL 16 + Apache AGE | Railway | Graph (Cypher), relational (SQL), FTS (tsvector/GIN), document (jsonb) |
| API service | Node.js | Railway | Source CRUD, webhook receiver, lens endpoints, staging mgmt, graph writes |
| API gateway | Zuplo | Zuplo cloud (edge) | Auth, rate limiting, semantic caching, MCP exposure, model routing, observability |
| Agent execution | Anthropic Agents API | Anthropic managed | Agent definitions, sessions, environments, events, checkpointing |
| Frontend | Next.js | Vercel | Three-function interface, agent monitor, model settings, cost dashboard |
| Ingestion (email) | Python | Railway (or local) | .eml/.html parsing, extraction API calls, staging writes |
| LLM layer | Claude Haiku/Sonnet/Opus | Via Zuplo | Extraction, conversation, briefing, recommendations (model per D22) |

## Three Retrieval Lenses

All lenses query the same PostgreSQL+AGE instance. They are thin API routes, not separate stores.

### Graph traversal lens
- Executes Cypher queries against AGE.
- Entry: node identifier → walks outward through connected nodes.
- Supports: variable-depth traversal (1–3 hops), domain filtering, temporal filtering, path queries.
- Use case: "What's my full history with [Company]?" — starts at Company node, traverses Person, Project, Event, Decision.

### Full-text search lens
- Executes tsvector/tsquery with GIN indexes.
- Searches: raw email content (raw_items.content_tsv), node properties.
- Supports: phrase matching, proximity, boolean operators. No vector embeddings.
- Use case: "Find emails mentioning compliance boundary changes."

### Compiled views lens
- Generates LLM-authored summaries of graph subsets on demand or on schedule.
- Flow: identify subgraph → serialize content → send to Haiku → cache result.
- Cache invalidation: when any node in the summarized subgraph updates.
- Use case: "Brief me on the Acme Corp assessment." — compiles relevant subgraph into a narrative.

## Three Interface Functions

Functions are not separate modes — they inform each other. F3 is always available from F1 and F2.

### Function 1: Conversational Triage
Natural language review of staged extractions. Claude presents findings, asks questions, user provides corrections that cascade across the graph. Entity-centric, batch-first (D23). Conversational, not clinical (D20).

### Function 2: Insight Explorer
Graph as a conversational partner. Claude narrates, surfaces patterns, responds to cross-domain queries. Graph visualization updates reactively. Safe exploration space. Morning briefings surface here.

### Function 3: Execution Layer
Always-available write capability. Triggered from F1 (triage corrections), F2 (exploration reveals action), or directly (manual graph edits). All writes go through Zuplo to the graph write pipeline.

### Recommendations Engine
Haiku periodically analyzes the graph and surfaces actionable observations as conversation starters. Links to F1 (needs input), F2 (needs exploration), or F3 (needs action).

## Harness Constraints

Every agent-to-tool call passes through the harness middleware:

| Constraint | Enforcement | Failure mode |
|-----------|-------------|-------------|
| Budget | Token/cost ceiling per session from mission_policies | Agent stops, reports what completed vs remaining |
| Domain scope | Auth token carries allowed domains, API rejects out-of-scope queries | Request rejected, escalation logged |
| Action gates | Read=free, stage_write=free, graph_write=human approval, external_send=hard gate | Action blocked, queued for human review |
| Scope | Mission defines allowed sources and graph subsets | Deviation flagged, session paused |
| Time | Session timeout with checkpointing | Timed-out session resumes from checkpoint on next run |
| Escalation | Low confidence, contradictory data, authority boundary | Item written to escalations table for human review |

## Data Flows

Six primary flows (detailed in SAD Section 8):

1. **Email ingestion:** Email files → raw_items → extraction → staged_extractions → human review → AGE graph
2. **Intelligence scanning:** Source definitions → scanner agents → raw_items → extraction → graph check → relevance scoring → briefings
3. **Triage:** staged_extractions → conversational review → corrections recorded → approved entities to graph
4. **Query/exploration:** User question → Claude calls lenses via MCP → iterative retrieval → narrative response
5. **Briefing generation:** Graph data + scan results → scoring by graph distance → structured briefing
6. **Self-maintenance:** Corrections + events + graph state → pattern detection → proposed updates → human approval

## Key Integration Points

### Zuplo Gateway (D06, scope clarified by D72)

**D06 scope clarification (per D72, Session 11):** Zuplo's responsibility is the unified
HTTP gateway — authentication, rate limiting, trace-ID injection, and policy pipeline for
control-plane traffic to Meridian. MCP (Model Context Protocol) hosting is explicitly
**not** Zuplo's responsibility. Meridian's MCP server lives in its own codebase
(`meridian-mcp`, MER-60, deployed per D72 Variant A in Sprint 14). This scope narrowing
supersedes the Session 02 framing that Zuplo might host MCP via its Server Handler
feature (MER-22, now resolved as won't-do).

Zuplo remains the unified entry point for all control-plane HTTP traffic: API queries,
webhook receivers, and future Clerk-authenticated frontend requests. Edge/mobile surface
traffic (D68) is architecturally reserved but not yet routed through Zuplo.

### AGE Connection Requirement
Every new database connection must execute:
```sql
LOAD 'age';
SET search_path = ag_catalog, "$user", public;
```
Handle this in connection pool initialization. Failure produces: `ERROR: unhandled cipher(cstring) function call error`.

### Model Routing
Frontend passes selected model as request parameter. Zuplo reads parameter, routes to provider. Defaults from model_preferences table. Per-task overrides supported. Zuplo executes routing but does not decide it (D22).
