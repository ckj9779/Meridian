<!-- Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE. -->

# MERIDIAN GRAPH SCHEMA — V1

## Overview

Nine node types, thirteen edge types, four domain vectors. Schema-optional by design — AGE enforces nothing, conventions enforce everything. This document is the canonical reference for entity extraction prompts, ingestion pipeline validation, and lens query construction.

**Design principles:**
- Person is the hub. Every query ultimately traverses through or from a Person node.
- Domains are properties, not partitions. A single node can span Professional and Private simultaneously.
- Edges carry temporal context. Relationships change; the graph remembers when.
- Source provenance on every node. No fact exists without a traceable origin.
- Lean nodes, rich edges. Context lives in connections, not in fat property bags.

---

## Domain Vectors

Every node carries a `domains` property (string array) with one or more values:

| Domain | Scope | Examples |
|--------|-------|----------|
| Professional | W-2 employment, side ventures, career development, industry relationships | Coalfire, Meridian, AWS partnerships, conference contacts |
| Private | Family, friends, personal logistics, health, finances | Kids, mom, brother, household, medical appointments |
| Spiritual | Faith, study, worship community, pastoral relationships | Bible study, church, scripture references, prayer groups |
| Romantic | Dating, romantic relationships, intimate plans | Date venues, relationship history, availability planning |

**Cross-domain tagging:** A node tagged `["Professional", "Private"]` (like Project Meridian) surfaces in queries against either domain. The cross-domain query — "is Saturday available?" — ignores domain filters entirely and traverses all connections to the relevant time period.

**Domain is not access control (yet).** In v1, domains are queryable metadata. Access control at the Zuplo layer can filter by domain in future phases.

---

## Node Types

### Person

The central hub. Every human entity in the graph — colleagues, family, friends, romantic interests, pastors, contacts.

| Property | Type | Required | Notes |
|----------|------|----------|-------|
| name | string | yes | Primary display name as Chaz knows them |
| email_addresses | string[] | no | All known addresses — critical for entity resolution |
| phone_numbers | string[] | no | |
| domains | string[] | yes | Which life vectors this person appears in |
| relationship_summary | string | no | One-line context: "brother", "Coalfire colleague", "pastor" |
| first_contact_date | date | no | Earliest known interaction |
| notes | text | no | Free-form context not captured by properties |
| source_refs | string[] | no | Email IDs or document references that established this entity |

**Entity resolution challenge:** The same person may appear as "Mike", "Michael", "Michael Chen", "mchen@company.com" across 300K emails. The `email_addresses` array is the primary disambiguation key. Haiku's extraction prompt must normalize to a canonical Person node and merge variants.

---

### Company

Commercial entities — employers, clients, partners, vendors.

| Property | Type | Required | Notes |
|----------|------|----------|-------|
| name | string | yes | Canonical company name |
| aliases | string[] | no | Alternate names, abbreviations ("AWS" / "Amazon Web Services") |
| industry | string | no | |
| domains | string[] | yes | Usually Professional, but not always (kid's school = Private) |
| notes | text | no | |
| source_refs | string[] | no | |

---

### Organization

Non-commercial entities — churches, clubs, community groups, professional associations, nonprofits.

| Property | Type | Required | Notes |
|----------|------|----------|-------|
| name | string | yes | |
| org_type | string | no | church, club, association, community, nonprofit |
| domains | string[] | yes | Church = Spiritual, kids' sports league = Private |
| notes | text | no | |
| source_refs | string[] | no | |

**Why separate from Company:** The distinction matters for domain tagging and query semantics. "Show me all my professional relationships" should return Company connections, not church membership. The org_type property enables queries like "find all my Spiritual organizations."

---

### Project

Bounded initiatives, work streams, ventures — anything with a start, an objective, and participants.

| Property | Type | Required | Notes |
|----------|------|----------|-------|
| name | string | yes | |
| status | string | no | active, completed, paused, abandoned, planned |
| domains | string[] | yes | Meridian = ["Professional", "Private"] |
| description | text | no | |
| start_date | date | no | |
| end_date | date | no | |
| source_refs | string[] | no | |

**Scope:** Includes professional projects (Perkin, Coalmine, FedRAMP engagements), personal projects (Meridian, home renovation), and any other bounded initiative worth tracking.

---

### Event

Discrete occurrences — meetings, trips, dates, services, appointments, milestones.

| Property | Type | Required | Notes |
|----------|------|----------|-------|
| name | string | yes | Descriptive: "San Francisco trip with [person]", "Q3 review" |
| event_type | string | no | meeting, trip, date, service, appointment, milestone, call |
| date | datetime | yes | Start date/time |
| end_date | datetime | no | For multi-day events or events with duration |
| domains | string[] | yes | A date = Romantic, church service = Spiritual |
| notes | text | no | |
| source_refs | string[] | no | |

**Key query enabler:** "Who did I go to San Francisco with in 2023?" traverses: Location(San Francisco) ←OCCURRED_AT← Event(2023) ←PARTICIPATED_IN← Person(s). The Event node is the bridge between people, places, and time.

---

### Commitment

Recurring obligations — standing meetings, custody schedules, Bible study groups, gym routines, date nights.

| Property | Type | Required | Notes |
|----------|------|----------|-------|
| name | string | yes | "Thursday Bible Study", "Kids weekend custody" |
| recurrence | string | yes | weekly, biweekly, monthly, custom |
| day_of_week | string | no | monday, tuesday, etc. |
| time_of_day | string | no | "7:00 PM", "morning" |
| domains | string[] | yes | |
| active | boolean | yes | Is this commitment currently active? |
| start_date | date | no | When did this commitment begin? |
| end_date | date | no | When did/will it end? |
| notes | text | no | Custody details, group members, etc. |
| source_refs | string[] | no | |

**Availability engine:** "Is Saturday available for a date?" requires scanning all active Commitments whose recurrence includes Saturday, all Events scheduled for that Saturday, and any cross-domain conflicts. Commitment nodes make recurring obligations first-class queryable entities rather than implicit patterns buried in calendar data.

---

### Decision

Captured decisions with rationale — important enough to remember why, not just what.

| Property | Type | Required | Notes |
|----------|------|----------|-------|
| summary | string | yes | What was decided |
| rationale | text | no | Why — constraints, trade-offs, alternatives rejected |
| date | date | yes | When the decision was made |
| domains | string[] | yes | |
| status | string | no | active, superseded, reversed |
| superseded_by | string | no | Reference to the Decision that replaced this one |
| source_refs | string[] | no | |

**Why this is a node, not a property:** Decisions connect to people (who decided), projects (what it affected), events (when it happened), and other decisions (what it superseded). Those connections are the value — "what decisions have I made about FedRAMP, and which are still active?" is a graph traversal, not a property lookup.

---

### Location

Physical places — cities, venues, offices, restaurants, churches, homes.

| Property | Type | Required | Notes |
|----------|------|----------|-------|
| name | string | yes | "San Francisco", "Coalfire Denver office", "First Baptist" |
| location_type | string | no | city, venue, restaurant, office, home, church, park |
| address | string | no | |
| city | string | no | For venues within a city |
| state | string | no | |
| country | string | no | |
| coordinates | string | no | "lat,lng" for map integration (future) |
| domains | string[] | yes | Office = Professional, church = Spiritual |
| notes | text | no | |
| source_refs | string[] | no | |

**Granularity:** A city and a specific venue within it are separate Location nodes. "San Francisco" is a Location. "Tartine Bakery, San Francisco" is a different Location with a LOCATED_IN edge to the city node. This enables both "everywhere I've been in SF" (traverse from city) and "what happened at Tartine" (traverse from venue).

---

### Document

Source materials referenced in the graph — significant email threads, files, Bible study guides, contracts, notes. Not every email becomes a Document node; only those worth referencing as standalone artifacts.

| Property | Type | Required | Notes |
|----------|------|----------|-------|
| title | string | yes | |
| doc_type | string | no | email_thread, file, note, scripture, study_guide, contract |
| date | date | no | |
| domains | string[] | yes | |
| content_ref | string | no | Pointer to PostgreSQL row with full content |
| summary | text | no | Haiku-generated summary |
| source_refs | string[] | no | |

**Relationship to email corpus:** The ~300K emails live in PostgreSQL tables with tsvector indexing (full-text search lens). Document nodes in the graph represent promoted artifacts — an email thread important enough to be a first-class graph entity, a Bible study guide that multiple Events reference, a contract that connects a Person to a Company. The `content_ref` property links back to the PostgreSQL row for full content retrieval.

**Spiritual domain use:** Scripture references, study materials, sermon notes. A Document node with `doc_type: "scripture"` and `domains: ["Spiritual"]` connects to Organization (which church), Person (who was in the study group), and Event (which session).

---

## Edge Types

All edges are directional in AGE. Cypher supports bidirectional traversal (`-[r]-` without arrow) so directionality is a convention for semantic clarity, not a query constraint.

### Person → Entity Edges

| Edge Type | From | To | Properties | Notes |
|-----------|------|----|------------|-------|
| WORKS_AT | Person | Company | title (string), start_date (date), end_date (date), current (boolean) | Temporal — a person can have multiple WORKS_AT edges to the same company for different periods |
| MEMBER_OF | Person | Organization | role (string), start_date (date), active (boolean) | Role captures "member", "leader", "pastor", "deacon", etc. |
| LOCATED_IN | Person | Location | type (string), current (boolean) | Type: "lives", "works", "grew_up". Enables "where does [person] live?" |

### Person → Activity Edges

| Edge Type | From | To | Properties | Notes |
|-----------|------|----|------------|-------|
| WORKS_ON | Person | Project | role (string), start_date (date) | Role: "owner", "contributor", "advisor", "sponsor" |
| PARTICIPATED_IN | Person | Event | role (string) | Role: "attendee", "organizer", "host", "speaker" |
| COMMITTED_TO | Person | Commitment | role (string) | Role: "participant", "leader", "organizer" |
| DECIDED | Person | Decision | — | Who made or participated in the decision |

### Person → Person Edges

| Edge Type | From | To | Properties | Notes |
|-----------|------|----|------------|-------|
| KNOWS | Person | Person | context (string), domains (string[]), since (date) | Context: "colleague", "friend", "dating", "mentor". Domains on the edge, not just nodes, because two people might be Professional colleagues AND Private friends |
| FAMILY | Person | Person | relationship (string) | Relationship: "brother", "mother", "child", "ex-spouse". Bidirectional by convention — create one edge, traverse both ways |

### Cross-Node Edges

| Edge Type | From | To | Properties | Notes |
|-----------|------|----|------------|-------|
| OCCURRED_AT | Event | Location | — | Where did this event happen? |
| BASED_IN | Company/Org | Location | — | Where is this entity headquartered/located? |
| PART_OF | Project | Company/Org | — | Which entity sponsors or owns this project? |
| REFERENCES | any | Document | — | Links any node to a source document |
| RELATES_TO | any | any | context (string) | Catch-all for meaningful connections that don't fit typed edges. The context property describes the nature. Use sparingly — if you're using RELATES_TO frequently, a new typed edge is warranted. |

---

## Schema Conventions

### Property Naming
- All property names: `snake_case`
- All node labels: `PascalCase` (Person, Company, Organization)
- All edge types: `UPPER_SNAKE_CASE` (WORKS_AT, PARTICIPATED_IN)

### Required vs Optional
- Every node requires `name` (or `summary` for Decision) and `domains`
- Event requires `date`
- Commitment requires `recurrence` and `active`
- Everything else is optional — the graph tolerates sparse nodes

### Source Provenance
- `source_refs` on nodes: array of identifiers pointing to the email(s) or document(s) that established the entity
- Format TBD based on email corpus access method (Gmail message ID, .mbox offset, etc.)
- If a fact can't be traced to a source, it should be flagged for human review

### Temporal Modeling
- Edges carry `start_date` and `end_date` where relationships are temporal
- `current` boolean on WORKS_AT and LOCATED_IN for fast "who works where now" queries
- Commitment `active` boolean for fast "what's on my schedule" queries
- No separate Time Period nodes in v1 — time is a property, not an entity

### Multi-Value Domains
- `domains` is always an array, never a single value
- A node with `domains: ["Professional", "Private"]` surfaces in queries against either domain
- Cross-domain queries ignore the domain filter entirely

### Entity Resolution Rules (for Haiku extraction prompt)
- Same email address = same Person node (primary key for deduplication)
- Same company name after normalization = same Company node
- Normalization: strip Inc/LLC/Corp, handle common abbreviations (AWS = Amazon Web Services)
- When uncertain, create separate nodes — merging later is easier than splitting
- Flag ambiguous entities with a `needs_review: true` property

---

## Example Cypher Queries

### "Who did I go to San Francisco with in 2023?"
```cypher
MATCH (p:Person)-[:PARTICIPATED_IN]->(e:Event)-[:OCCURRED_AT]->(l:Location)
WHERE l.name = 'San Francisco'
AND e.date >= '2023-01-01' AND e.date < '2024-01-01'
RETURN p.name, e.name, e.date
```

### "Is Saturday available?" (cross-domain scan)
```cypher
// Check commitments
MATCH (c:Commitment)
WHERE c.active = true AND c.day_of_week = 'saturday'
RETURN 'commitment' AS type, c.name, c.domains

UNION ALL

// Check events
MATCH (e:Event)
WHERE e.date >= '2026-04-18' AND e.date < '2026-04-19'
RETURN 'event' AS type, e.name, e.domains
```

### "What's my full history with AWS?"
```cypher
MATCH path = (me:Person {name: 'Chaz'})-[*1..3]-(n)
WHERE n.name CONTAINS 'AWS' OR n.name CONTAINS 'Amazon Web Services'
OR EXISTS {
  MATCH (n)-[*1..2]-(aws:Company)
  WHERE aws.name CONTAINS 'AWS' OR aws.name CONTAINS 'Amazon Web Services'
}
RETURN path
```

### "Show me everything in my Spiritual domain"
```cypher
MATCH (n)
WHERE 'Spiritual' IN n.domains
RETURN labels(n) AS type, n.name, n.domains
ORDER BY n.name
```

---

## Schema Evolution Notes

This is v1. Expected additions as data is ingested:

- **Scripture node** — if Bible study references become frequent enough to warrant first-class treatment beyond Document
- **Goal node** — personal objectives with progress tracking, connected to Projects and Decisions
- **Health node** — medical appointments, conditions, providers (Private domain)
- **Financial node** — investments, expenses, budgets (Private/Professional domain)
- **INTRODUCED_BY edge** — Person→Person→Person, tracking how relationships formed
- **SUCCEEDED_BY edge** — Decision→Decision, more explicit than the superseded_by property

Adding any of these requires: (1) update this schema document, (2) update the Haiku extraction prompt, (3) update lens queries that should surface the new type. No database migration, no downtime, no schema DDL.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1 | 2026-04-12 | Initial schema — 9 node types, 13 edge types, 4 domain vectors |
