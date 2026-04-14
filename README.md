<!-- Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE. -->

# Meridian

**Personal knowledge graph and intelligence platform.**

Meridian is a unified knowledge architecture that ingests personal data sources (email, intelligence feeds, documents) into a canonical knowledge graph, then exposes that graph through multiple retrieval lenses — graph traversal, compiled views, and full-text search — orchestrated by an agentic reasoning layer.

## Architecture

"One store, many lenses." All data flows through a single ingestion pipeline into a canonical knowledge graph (PostgreSQL + Apache AGE). Three retrieval lenses provide different access patterns over the same source of truth. An agent reasoning layer selects and combines lenses based on query semantics.

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Canonical store | PostgreSQL + Apache AGE | Graph topology, content storage, full-text search |
| API gateway | Zuplo | Auth, rate limiting, semantic caching, MCP exposure |
| Ingestion | Claude Haiku | Entity extraction, resolution, normalization |
| Agent layer | Claude (Sonnet/Opus) | Reasoning loop, lens orchestration via MCP |
| Frontend | Next.js on Vercel | Conversational triage, insight explorer, execution |

## Status

Phase 0 — Foundation. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full system design.

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Six-layer system architecture |
| [DATABASE.md](docs/DATABASE.md) | PostgreSQL schema and conventions |
| [SCHEMA.md](docs/SCHEMA.md) | Knowledge graph schema (AGE/Cypher) |
| [EXTRACTION.md](docs/EXTRACTION.md) | Entity extraction prompt and pipeline |
| [CODING_STANDARDS.md](docs/CODING_STANDARDS.md) | Code style and conventions |
| [GITOPS.md](docs/GITOPS.md) | Git workflow, branching, signing |

## License

Business Source License 1.1 — see [LICENSE](LICENSE).

Copyright (c) 2026 Charles K. Johnson. All rights reserved.
