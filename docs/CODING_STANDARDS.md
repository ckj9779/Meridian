<!-- Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE. -->

# Meridian — Coding Standards

> Read this for all code contributions. Covers TypeScript (API service, frontend), Python (ingestion pipeline), and SQL (migrations, queries).

## General Principles

1. **Explicit over implicit.** Type everything. Name things clearly. No magic strings.
2. **Fail loudly.** No silent catches. No swallowed exceptions. Errors are logged with context.
3. **No personal data in code.** Identifiers, email addresses, names — all come from the database or environment variables, never hardcoded.
4. **Every file starts with a copyright header.** See `docs/GITOPS.md` for format per language.
5. **One concern per file.** A file that does two things should be two files.

---

## TypeScript (API Service + Frontend)

### Compiler config
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

### Rules
- **No `any`.** Ever. If you think you need `any`, use `unknown` and narrow with type guards.
- **No `@ts-ignore`.** If unavoidable, use `@ts-expect-error` with a comment explaining why.
- **No non-null assertions (`!`).** Handle the null case explicitly.
- **No enum.** Use `as const` objects or union types. Enums have runtime behavior that obscures intent.

```typescript
// BAD
enum Status { Pending, Approved, Rejected }

// GOOD
const STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;
type Status = typeof STATUS[keyof typeof STATUS];
```

### Naming conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | `staged-extractions.ts`, `graph-traversal.ts` |
| Interfaces/Types | PascalCase | `StagedExtraction`, `GraphNode`, `ScanRunStatus` |
| Functions | camelCase | `getSourceById`, `runExtraction`, `validateSchema` |
| Constants | UPPER_SNAKE_CASE | `MAX_BATCH_SIZE`, `DEFAULT_MODEL` |
| Database columns in code | snake_case (matching DB) | `source_id`, `created_at`, `extraction_status` |
| Environment variables | UPPER_SNAKE_CASE | `DATABASE_URL`, `ZUPLO_API_KEY` |

### File structure pattern (API service)
```
src/
  routes/              # Express/Fastify route handlers
    sources.ts
    lenses.ts
    staging.ts
    graph.ts
  services/            # Business logic
    extraction.service.ts
    entity-resolution.service.ts
    briefing.service.ts
  middleware/           # Harness enforcement, auth, validation
    harness.ts
    auth.ts
    validate-schema.ts
  db/                  # Database access
    pool.ts            # Connection pool with AGE init
    queries/           # SQL/Cypher query builders
      sources.queries.ts
      graph.queries.ts
  types/               # Shared type definitions
    sources.types.ts
    extraction.types.ts
    graph.types.ts
  utils/               # Pure utility functions
  index.ts             # Entry point
```

### Error handling
```typescript
// BAD — silent catch
try {
  await db.query(sql);
} catch (e) {
  // silently ignored
}

// BAD — generic rethrow
try {
  await db.query(sql);
} catch (e) {
  throw e;
}

// GOOD — contextual error
try {
  await db.query(sql);
} catch (error) {
  throw new DatabaseError('Failed to insert staged extraction', {
    cause: error,
    context: { rawItemId, batchId },
  });
}
```

### Custom error classes
```typescript
class MeridianError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

class DatabaseError extends MeridianError {}
class ValidationError extends MeridianError {}
class HarnessViolationError extends MeridianError {}
class ExtractionError extends MeridianError {}
```

### API response shape
All API responses follow a consistent envelope:

```typescript
// Success
interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    per_page?: number;
  };
}

// Error
interface ApiError {
  ok: false;
  error: {
    code: string;           // machine-readable: 'VALIDATION_FAILED', 'NOT_FOUND'
    message: string;        // human-readable
    details?: unknown;      // optional context
  };
}

type ApiResponse<T> = ApiSuccess<T> | ApiError;
```

### Environment variables
Never access `process.env` directly in business logic. Load and validate at startup:

```typescript
// config.ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  ZUPLO_API_KEY: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
});

export const config = envSchema.parse(process.env);
```

---

## Python (Ingestion Pipeline)

### Version and tooling
- Python 3.11+
- Type hints on all function signatures (PEP 484)
- `mypy` for static type checking (strict mode)
- `ruff` for linting and formatting
- `pytest` for testing

### Rules
- **Type hints on everything.** Function parameters, return types, class attributes.
- **No bare `except`.** Always catch specific exception types.
- **Use `pathlib.Path`** instead of string manipulation for file paths.
- **Use `dataclasses` or `pydantic`** for structured data, not raw dicts.

### Naming conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files | snake_case | `email_parser.py`, `entity_resolver.py` |
| Classes | PascalCase | `EmailParser`, `ExtractionResult`, `EntityResolver` |
| Functions | snake_case | `parse_eml_file`, `extract_entities`, `resolve_person` |
| Constants | UPPER_SNAKE_CASE | `MAX_BATCH_SIZE`, `HAIKU_MODEL_ID` |
| Private | leading underscore | `_parse_headers`, `_normalize_name` |

### File structure (ingestion pipeline)
```
ingestion/
  adapters/              # Source-specific parsers
    m365_adapter.py      # .eml/.html pair reader
    gmail_adapter.py     # .mbox or Gmail API reader
    icloud_adapter.py    # IMAP reader
  extraction/
    prompt.py            # Extraction prompt builder
    validator.py         # JSON schema validation
    entity_resolver.py   # Entity resolution merge logic
  pipeline/
    orchestrator.py      # Batch processing orchestration
    staging.py           # Staging table write operations
    progress.py          # Progress tracking
  models/                # Data classes
    email.py             # ParsedEmail dataclass
    extraction.py        # ExtractionResult, NodeData, EdgeData
  utils/
    text.py              # HTML stripping, text normalization
    dates.py             # Relative date resolution
  config.py              # Environment and settings
  __init__.py
```

### Type hint examples
```python
from dataclasses import dataclass
from pathlib import Path
from datetime import datetime

@dataclass
class ParsedEmail:
    message_id: str
    date: datetime
    subject: str
    from_address: str
    from_name: str | None
    to_addresses: list[str]
    cc_addresses: list[str]
    body_text: str
    source_path: Path

def parse_eml_file(eml_path: Path, html_path: Path | None = None) -> ParsedEmail:
    """Parse an .eml file and optional paired .html body into structured data."""
    ...

def extract_entities(email: ParsedEmail, model: str = "claude-haiku-4.5") -> ExtractionResult:
    """Run entity extraction against parsed email content."""
    ...
```

### Error handling
```python
# BAD
try:
    result = parse_eml_file(path)
except:
    pass

# GOOD
try:
    result = parse_eml_file(path)
except FileNotFoundError:
    logger.error("EML file not found: %s", path)
    raise
except UnicodeDecodeError as e:
    logger.warning("Encoding error in %s, attempting fallback: %s", path, e)
    result = parse_eml_file(path, encoding="latin-1")
```

---

## SQL (Migrations + Queries)

### Style
- Keywords: UPPERCASE (`SELECT`, `CREATE TABLE`, `WHERE`, `NOT NULL`)
- Identifiers: snake_case, lowercase (`staged_extractions`, `source_id`)
- Indent: 2 spaces
- One column per line in CREATE TABLE
- Align column types for readability

### Query patterns

**Parameterized queries only. Never string interpolation.**

```typescript
// BAD — SQL injection risk
const sql = `SELECT * FROM sources WHERE type = '${type}'`;

// GOOD — parameterized
const sql = 'SELECT * FROM sources WHERE type = $1 AND enabled = true';
const result = await pool.query(sql, [type]);
```

**Cypher queries use the AGE SQL wrapper:**
```typescript
const cypher = `
  SELECT * FROM cypher('meridian', $$
    MATCH (p:Person)-[:WORKS_AT]->(c:Company {name: $company_name})
    RETURN p.name, p.email_addresses
  $$, $1) AS (name agtype, emails agtype)
`;
const result = await pool.query(cypher, [JSON.stringify({ company_name: name })]);
```

### Migration file rules
- Copyright header on line 1
- Wrap in `BEGIN; ... COMMIT;`
- Use `IF NOT EXISTS` / `IF EXISTS` for idempotency
- Comment every non-obvious decision
- Reference SAD section or decision ID

---

## Dependency Management

### Node.js (API service + frontend)
- Lock file (`package-lock.json`) is committed.
- Pin exact versions for production dependencies.
- Use `npm audit` before merging dependency updates.
- Prefer well-maintained packages with active security response.

### Python (ingestion)
- `requirements.txt` with pinned versions for reproducibility.
- Separate `requirements-dev.txt` for test/lint tooling.
- Use `pip-audit` before merging dependency updates.

### Dependency addition criteria
Before adding a new dependency, check:
1. Is it actively maintained? (Last commit within 6 months)
2. Does it have known vulnerabilities? (`npm audit` / `pip-audit`)
3. Is the license compatible with BSL 1.1?
4. Can we achieve the same result with existing dependencies or stdlib?
5. Does it align with P9 (boring technology for foundations)?

---

## Logging

### Structure
All logs are structured JSON in production:

```typescript
import { logger } from './utils/logger';

logger.info('Extraction complete', {
  rawItemId: item.id,
  nodesExtracted: result.nodes.length,
  edgesExtracted: result.edges.length,
  modelUsed: 'claude-haiku-4.5',
  tokensUsed: result.usage.totalTokens,
  durationMs: elapsed,
});
```

### Levels
| Level | Use for |
|-------|---------|
| `error` | Unrecoverable failures. Requires investigation. |
| `warn` | Recoverable issues. Degraded behavior. Retry succeeded. |
| `info` | Normal operations. Extraction complete, scan started, entity merged. |
| `debug` | Diagnostic detail. SQL queries, API payloads. Off in production. |

### Sensitive data in logs
- **Never log:** Email content, person names, relationship details, graph entity properties with personal context.
- **OK to log:** Entity counts, node types, IDs (uuid), status changes, token counts, costs, model identifiers, timing.

---

## Testing Patterns (Preview)

Full testing strategy will be documented in `docs/TESTING.md`. Initial conventions:

### API service (TypeScript)
- Unit tests: business logic in `services/`. Mock database calls.
- Integration tests: route handlers with test database. Seed, test, teardown.
- Framework: `vitest` (or `jest` — TBD with owner preference).
- Test files: co-located as `*.test.ts` next to source files.

### Ingestion pipeline (Python)
- Unit tests: parsing, validation, entity resolution logic.
- Integration tests: full pipeline with synthetic .eml/.html fixtures.
- Framework: `pytest`.
- Test data: synthetic/fabricated emails only. Never real corpus data in tests.
- Test files: `tests/` directory mirroring `ingestion/` structure.

### Fixtures
- All test fixtures use fabricated data — synthetic names, fake email addresses, invented companies.
- Fixtures are committed to the repo in `tests/fixtures/`.
- Never reference real people, companies, or personal details in test data.
