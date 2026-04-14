<!-- Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE. -->

# MERIDIAN ENTITY EXTRACTION PROMPT — V1

## Overview

This document defines the system prompt and JSON output schema for the entity extraction step of the Meridian ingestion pipeline. The prompt is model-agnostic — it works with any LLM that can produce structured JSON (Claude Haiku, Opus, Gemini, etc.). Model selection is a routing decision at the Zuplo gateway layer, not a prompt concern.

**Input:** A single email with metadata (from, to, cc, date, subject, message_id) and body text.
**Output:** Structured JSON containing extracted nodes and edges conforming to the Meridian Graph Schema V1.

---

## System Prompt

```
You are an entity extraction system for a personal knowledge graph. Your job is to read an email and extract structured entities (people, companies, organizations, projects, events, commitments, decisions, locations, documents) and the relationships between them.

The knowledge graph owner is Chaz. All extraction is from Chaz's perspective — relationships, domains, and context are interpreted through how they relate to Chaz's life.

## Output Format

Respond with ONLY valid JSON. No preamble, no markdown fences, no explanation. The JSON must conform exactly to the schema below.

## Domain Classification

Every entity must be tagged with one or more domains. Classify based on context:

- Professional: W-2 employment, business ventures, career, industry relationships, work projects, conferences, clients, partners
- Private: Family, friends, personal logistics, health, finances, kids, household, non-work relationships
- Spiritual: Faith, Bible study, church, worship, scripture, prayer groups, pastoral relationships
- Romantic: Dating, romantic relationships, date plans, romantic venues

An entity can belong to multiple domains. A person who is both a work colleague and a personal friend gets ["Professional", "Private"]. When uncertain, tag the most likely domain and set "needs_review": true.

## Entity Resolution Rules

These rules are critical for graph consistency across 300K+ emails:

1. PEOPLE: Use email address as the primary key. If you see "Mike <mike@acme.com>" and later "Michael Chen <mike@acme.com>", these are the same person. Use the most complete name form as the canonical name. Collect all name variants and email addresses.

2. COMPANIES: Normalize names — strip Inc, LLC, Corp, Ltd, Co. Map common abbreviations: "AWS" = "Amazon Web Services", "GCP" = "Google Cloud Platform", "MS" = "Microsoft". Use the most commonly recognized form as canonical name, store others in aliases.

3. ORGANIZATIONS: Non-commercial entities — churches, clubs, nonprofits, community groups, professional associations. If it has revenue as its primary purpose, it's a Company. If it exists for community, faith, advocacy, or association, it's an Organization.

4. AMBIGUITY: When uncertain whether two references are the same entity, create separate nodes and set "needs_review": true on both. Merging later is easier than splitting incorrectly merged nodes.

5. IMPLICIT ENTITIES: Extract entities that are referenced but not directly named. "I'll be at the Denver office Tuesday" implies a Location (Denver office) and an Event (Tuesday visit) even though neither is formally stated.

## What to Extract

Extract ONLY what is directly stated or strongly implied in the email. Do not infer or speculate. Specifically:

- People: Anyone mentioned by name, email address, or clear reference ("my brother", "the pastor")
- Companies: Any commercial entity mentioned
- Organizations: Any non-commercial entity mentioned (churches, groups, clubs)
- Projects: Named initiatives, work streams, or ventures discussed
- Events: Meetings, trips, appointments, calls, dates, services mentioned with a time reference
- Commitments: Recurring obligations mentioned ("our weekly standup", "Thursday Bible study")
- Decisions: Explicit decisions stated in the email ("we decided to...", "the plan is to...")
- Locations: Physical places mentioned (cities, offices, restaurants, venues)
- Documents: Files, contracts, reports, or other artifacts referenced

## What NOT to Extract

- Generic pleasantries ("Hope you're doing well")
- Email signature blocks (unless they contain new information like a title change or new phone number)
- Forwarded content that Chaz did not write (extract only if Chaz comments on it)
- Speculative or hypothetical entities ("we might want to consider...")
- Duplicate information already captured in email metadata (don't create a Person node for the sender if they're already in the "from" field — but DO extract them as a node)

## Edge Extraction

For every node you extract, identify its relationships to other nodes in this email. Use the typed edge types from the schema:

- WORKS_AT: Person → Company (with title if mentioned)
- MEMBER_OF: Person → Organization (with role if mentioned)
- WORKS_ON: Person → Project (with role if mentioned)
- PARTICIPATED_IN: Person → Event
- COMMITTED_TO: Person → Commitment
- DECIDED: Person → Decision
- OCCURRED_AT: Event → Location
- BASED_IN: Company/Organization → Location
- PART_OF: Project → Company/Organization
- KNOWS: Person → Person (with context: colleague, friend, family, dating, etc.)
- FAMILY: Person → Person (with relationship: brother, mother, child, etc.)
- REFERENCES: any node → Document
- RELATES_TO: any → any (use sparingly, only when no typed edge fits; include context)

## Confidence and Review Flags

For each node, assess extraction confidence:
- high: Entity is explicitly named and unambiguous
- medium: Entity is referenced but name/identity is somewhat ambiguous
- low: Entity is implied but not directly stated

Set "needs_review": true when:
- Two name variants might be the same person but you're unsure
- A company/organization classification is unclear
- Domain assignment is ambiguous
- A relationship type is inferred rather than stated
```

---

## JSON Output Schema

```json
{
  "email_ref": {
    "message_id": "string — original email message ID",
    "date": "ISO 8601 datetime",
    "subject": "string"
  },
  "nodes": [
    {
      "ref_id": "string — temporary ID for edge references within this extraction (e.g. 'person_1', 'company_1')",
      "label": "Person | Company | Organization | Project | Event | Commitment | Decision | Location | Document",
      "properties": {
        "name": "string (required for all except Decision)",
        "summary": "string (required for Decision, instead of name)",
        "domains": ["Professional", "Private", "Spiritual", "Romantic"],
        "source_refs": ["email message_id"],
        "...": "additional properties per node type — see schema"
      },
      "confidence": "high | medium | low",
      "needs_review": false,
      "review_reason": "string — why this needs review, if applicable"
    }
  ],
  "edges": [
    {
      "type": "WORKS_AT | MEMBER_OF | WORKS_ON | PARTICIPATED_IN | COMMITTED_TO | DECIDED | OCCURRED_AT | BASED_IN | PART_OF | KNOWS | FAMILY | REFERENCES | RELATES_TO",
      "from_ref": "string — ref_id of source node",
      "to_ref": "string — ref_id of target node",
      "properties": {
        "...": "edge-specific properties per schema (title, role, context, etc.)"
      },
      "confidence": "high | medium | low"
    }
  ],
  "extraction_notes": "string — optional notes about ambiguities, edge cases, or observations the extraction model wants to flag for the pipeline"
}
```

---

## Property Reference by Node Type

Quick reference for the extraction model. Only populate properties that are present in the email — omit properties with no data rather than setting null.

### Person
```json
{
  "name": "string — most complete name form",
  "email_addresses": ["all known addresses from this email"],
  "phone_numbers": ["if visible"],
  "domains": ["Professional"],
  "relationship_summary": "one-line context",
  "notes": "any additional context"
}
```

### Company
```json
{
  "name": "canonical name (normalized)",
  "aliases": ["alternate names, abbreviations"],
  "industry": "if apparent",
  "domains": ["Professional"]
}
```

### Organization
```json
{
  "name": "string",
  "org_type": "church | club | association | community | nonprofit",
  "domains": ["Spiritual"]
}
```

### Project
```json
{
  "name": "string",
  "status": "active | completed | paused | abandoned | planned",
  "domains": ["Professional"],
  "description": "brief if mentioned"
}
```

### Event
```json
{
  "name": "descriptive name",
  "event_type": "meeting | trip | date | service | appointment | milestone | call",
  "date": "ISO 8601 if extractable",
  "end_date": "ISO 8601 if multi-day",
  "domains": ["Professional"]
}
```

### Commitment
```json
{
  "name": "descriptive name",
  "recurrence": "weekly | biweekly | monthly | custom",
  "day_of_week": "monday | tuesday | etc.",
  "time_of_day": "7:00 PM",
  "domains": ["Spiritual"],
  "active": true
}
```

### Decision
```json
{
  "summary": "what was decided",
  "rationale": "why, if stated",
  "date": "ISO 8601",
  "domains": ["Professional"],
  "status": "active"
}
```

### Location
```json
{
  "name": "place name",
  "location_type": "city | venue | restaurant | office | home | church | park",
  "city": "if a venue within a city",
  "state": "if mentioned",
  "domains": ["Professional"]
}
```

### Document
```json
{
  "title": "document name or description",
  "doc_type": "email_thread | file | note | scripture | study_guide | contract",
  "date": "ISO 8601 if known",
  "domains": ["Professional"],
  "summary": "brief summary if content is visible"
}
```

---

## Example Input / Output

### Input Email

```
From: Sarah Chen <schen@coalfire.com>
To: Chaz <chaz@coalfire.com>
CC: Mike Rodriguez <mrodriguez@coalfire.com>
Date: 2025-09-15T14:30:00Z
Subject: FedRAMP assessment — AWS scope change
Message-ID: <abc123@coalfire.com>

Hey Chaz,

Quick update on the FedRAMP assessment for Acme Corp. I spoke with their CISO, 
James Park (jpark@acmecorp.com), and they want to expand the scope to include 
their new AWS GovCloud deployment.

Mike and I met with the AWS team at their Arlington office last Tuesday to 
discuss the boundary changes. We decided to proceed with the expanded scope 
but push the timeline back two weeks.

Can you update the project plan and let James know about the revised dates? 
Also, don't forget we have our weekly FedRAMP standup tomorrow at 10am.

Thanks,
Sarah
```

### Expected Output

```json
{
  "email_ref": {
    "message_id": "abc123@coalfire.com",
    "date": "2025-09-15T14:30:00Z",
    "subject": "FedRAMP assessment — AWS scope change"
  },
  "nodes": [
    {
      "ref_id": "person_1",
      "label": "Person",
      "properties": {
        "name": "Sarah Chen",
        "email_addresses": ["schen@coalfire.com"],
        "domains": ["Professional"],
        "relationship_summary": "Coalfire colleague",
        "source_refs": ["abc123@coalfire.com"]
      },
      "confidence": "high",
      "needs_review": false
    },
    {
      "ref_id": "person_2",
      "label": "Person",
      "properties": {
        "name": "Mike Rodriguez",
        "email_addresses": ["mrodriguez@coalfire.com"],
        "domains": ["Professional"],
        "relationship_summary": "Coalfire colleague",
        "source_refs": ["abc123@coalfire.com"]
      },
      "confidence": "high",
      "needs_review": false
    },
    {
      "ref_id": "person_3",
      "label": "Person",
      "properties": {
        "name": "James Park",
        "email_addresses": ["jpark@acmecorp.com"],
        "domains": ["Professional"],
        "relationship_summary": "CISO at Acme Corp",
        "source_refs": ["abc123@coalfire.com"]
      },
      "confidence": "high",
      "needs_review": false
    },
    {
      "ref_id": "person_4",
      "label": "Person",
      "properties": {
        "name": "Chaz",
        "domains": ["Professional"],
        "source_refs": ["abc123@coalfire.com"]
      },
      "confidence": "high",
      "needs_review": false
    },
    {
      "ref_id": "company_1",
      "label": "Company",
      "properties": {
        "name": "Coalfire",
        "domains": ["Professional"],
        "source_refs": ["abc123@coalfire.com"]
      },
      "confidence": "high",
      "needs_review": false
    },
    {
      "ref_id": "company_2",
      "label": "Company",
      "properties": {
        "name": "Acme Corp",
        "domains": ["Professional"],
        "source_refs": ["abc123@coalfire.com"]
      },
      "confidence": "high",
      "needs_review": false
    },
    {
      "ref_id": "company_3",
      "label": "Company",
      "properties": {
        "name": "Amazon Web Services",
        "aliases": ["AWS"],
        "industry": "cloud computing",
        "domains": ["Professional"],
        "source_refs": ["abc123@coalfire.com"]
      },
      "confidence": "high",
      "needs_review": false
    },
    {
      "ref_id": "project_1",
      "label": "Project",
      "properties": {
        "name": "FedRAMP Assessment — Acme Corp",
        "status": "active",
        "domains": ["Professional"],
        "description": "FedRAMP assessment for Acme Corp, expanded to include AWS GovCloud",
        "source_refs": ["abc123@coalfire.com"]
      },
      "confidence": "high",
      "needs_review": false
    },
    {
      "ref_id": "event_1",
      "label": "Event",
      "properties": {
        "name": "AWS meeting — Arlington office",
        "event_type": "meeting",
        "date": "2025-09-09",
        "domains": ["Professional"],
        "notes": "Discussed FedRAMP boundary changes for Acme Corp scope expansion",
        "source_refs": ["abc123@coalfire.com"]
      },
      "confidence": "medium",
      "needs_review": false,
      "review_reason": "Date inferred: 'last Tuesday' relative to email date 2025-09-15"
    },
    {
      "ref_id": "event_2",
      "label": "Event",
      "properties": {
        "name": "Weekly FedRAMP standup",
        "event_type": "meeting",
        "date": "2025-09-16T10:00:00Z",
        "domains": ["Professional"],
        "source_refs": ["abc123@coalfire.com"]
      },
      "confidence": "medium",
      "needs_review": false,
      "review_reason": "Date inferred: 'tomorrow' relative to email date"
    },
    {
      "ref_id": "commitment_1",
      "label": "Commitment",
      "properties": {
        "name": "Weekly FedRAMP standup",
        "recurrence": "weekly",
        "time_of_day": "10:00 AM",
        "domains": ["Professional"],
        "active": true,
        "source_refs": ["abc123@coalfire.com"]
      },
      "confidence": "high",
      "needs_review": false
    },
    {
      "ref_id": "decision_1",
      "label": "Decision",
      "properties": {
        "summary": "Proceed with expanded FedRAMP scope for Acme Corp including AWS GovCloud, push timeline back two weeks",
        "date": "2025-09-09",
        "domains": ["Professional"],
        "status": "active",
        "source_refs": ["abc123@coalfire.com"]
      },
      "confidence": "high",
      "needs_review": false
    },
    {
      "ref_id": "location_1",
      "label": "Location",
      "properties": {
        "name": "AWS Arlington office",
        "location_type": "office",
        "city": "Arlington",
        "domains": ["Professional"],
        "source_refs": ["abc123@coalfire.com"]
      },
      "confidence": "high",
      "needs_review": false
    }
  ],
  "edges": [
    { "type": "WORKS_AT", "from_ref": "person_1", "to_ref": "company_1", "properties": {}, "confidence": "high" },
    { "type": "WORKS_AT", "from_ref": "person_2", "to_ref": "company_1", "properties": {}, "confidence": "high" },
    { "type": "WORKS_AT", "from_ref": "person_4", "to_ref": "company_1", "properties": {}, "confidence": "high" },
    { "type": "WORKS_AT", "from_ref": "person_3", "to_ref": "company_2", "properties": { "title": "CISO" }, "confidence": "high" },
    { "type": "WORKS_ON", "from_ref": "person_1", "to_ref": "project_1", "properties": {}, "confidence": "high" },
    { "type": "WORKS_ON", "from_ref": "person_2", "to_ref": "project_1", "properties": {}, "confidence": "high" },
    { "type": "WORKS_ON", "from_ref": "person_4", "to_ref": "project_1", "properties": {}, "confidence": "high" },
    { "type": "WORKS_ON", "from_ref": "person_3", "to_ref": "project_1", "properties": {}, "confidence": "medium" },
    { "type": "PARTICIPATED_IN", "from_ref": "person_1", "to_ref": "event_1", "properties": { "role": "attendee" }, "confidence": "high" },
    { "type": "PARTICIPATED_IN", "from_ref": "person_2", "to_ref": "event_1", "properties": { "role": "attendee" }, "confidence": "high" },
    { "type": "OCCURRED_AT", "from_ref": "event_1", "to_ref": "location_1", "properties": {}, "confidence": "high" },
    { "type": "DECIDED", "from_ref": "person_1", "to_ref": "decision_1", "properties": {}, "confidence": "medium" },
    { "type": "DECIDED", "from_ref": "person_2", "to_ref": "decision_1", "properties": {}, "confidence": "medium" },
    { "type": "COMMITTED_TO", "from_ref": "person_1", "to_ref": "commitment_1", "properties": {}, "confidence": "high" },
    { "type": "COMMITTED_TO", "from_ref": "person_4", "to_ref": "commitment_1", "properties": {}, "confidence": "high" },
    { "type": "PART_OF", "from_ref": "project_1", "to_ref": "company_1", "properties": {}, "confidence": "high" },
    { "type": "BASED_IN", "from_ref": "company_3", "to_ref": "location_1", "properties": {}, "confidence": "medium" },
    { "type": "KNOWS", "from_ref": "person_4", "to_ref": "person_1", "properties": { "context": "colleague", "domains": ["Professional"] }, "confidence": "high" },
    { "type": "KNOWS", "from_ref": "person_4", "to_ref": "person_2", "properties": { "context": "colleague", "domains": ["Professional"] }, "confidence": "high" },
    { "type": "KNOWS", "from_ref": "person_4", "to_ref": "person_3", "properties": { "context": "colleague", "domains": ["Professional"] }, "confidence": "medium" }
  ],
  "extraction_notes": "Relative dates resolved against email date 2025-09-15: 'last Tuesday' = 2025-09-09, 'tomorrow' = 2025-09-16. AWS GovCloud treated as part of AWS (Company), not a separate entity. Commitment extracted from 'weekly FedRAMP standup' in addition to the specific Event instance."
}
```

---

## Pipeline Integration Notes

### Pre-Processing (before calling extraction model)
1. Parse email metadata into structured fields (from, to, cc, date, subject, message_id)
2. Strip HTML formatting, retain plain text
3. Remove quoted reply chains — extract only the newest message in a thread (unless the thread contains decisions or context not repeated in the latest message)
4. Inject the email date into the system prompt so relative dates ("last Tuesday", "tomorrow", "next week") can be resolved

### Post-Processing (after extraction model returns)
1. **Validate JSON** — if model returns invalid JSON, retry once with a shorter prompt
2. **Schema validation** — verify required properties present, label values match enum, domains values match enum
3. **Entity resolution merge** — check extracted Person nodes against existing graph for email address matches; merge rather than create duplicate nodes
4. **Company normalization** — run alias matching against existing Company nodes in graph
5. **Confidence filtering** — nodes with confidence "low" go to a review queue, not directly to graph
6. **Graph write** — convert validated JSON into AGE Cypher CREATE/MERGE statements

### Batching Strategy
- Process emails chronologically (oldest first) so entity resolution builds on established nodes
- Batch in groups of 50-100 emails per extraction call for models with large context windows
- For single-email extraction (Haiku), parallelize across multiple concurrent calls
- Track extraction progress: email_id → extraction_status (pending, extracted, validated, loaded, failed)

### Cost Estimation
- Haiku at ~$0.25/M input tokens, ~$1.25/M output tokens
- Average email: ~500 input tokens, ~800 output tokens extracted
- 300K emails: ~150M input tokens ($37.50) + ~240M output tokens ($300) ≈ **$340 total at Haiku rates**
- Opus would be ~20x that — use Haiku for bulk, Opus for review queue items

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1 | 2026-04-12 | Initial extraction prompt — 9 node types, 13 edge types, relative date resolution, entity resolution rules, example I/O |
