<!-- Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE. -->

# Meridian — Operations Runbook

> Operational procedures for Meridian. Read this for cold storage management, alert configuration, and routine maintenance tasks.

---

## Cold Storage Export

### How it works

`src/scripts/audit-export.ts` is a standalone Node.js script that exports eligible `audit_events` rows to a gzipped JSONL file on a registered local drive, then prunes those rows from the database.

**Retention thresholds (applied at runtime):**

| `caller_type` | Retention |
|---------------|-----------|
| `m2m_agent`, `m2m_meridian` | 30 days |
| All other values (`human_pat`, `m2m_claude_code`, `anonymous`, etc.) | 7 days |

Rows older than the applicable threshold are exported and pruned on each run.

**Export format:** One JSONL.gz file per run. Each line is a single `audit_events` row serialized as JSON. The gzip layer uses Node.js built-in `zlib.createGzip()`. No third-party compression dependency.

**SHA-256 prune gate:** After writing the file, the script computes SHA-256 of the output file, writes it to a sibling manifest, then re-verifies the digest before executing the `DELETE`. If the digests do not match, the script alerts and exits with code 1 — **no rows are pruned**.

### Directory structure

```
<COLD_STORAGE_PATH>/
  YYYY-MM-DD/
    audit-YYYY-MM-DDTHH-mm-ssZ.jsonl.gz
    audit-YYYY-MM-DDTHH-mm-ssZ.manifest.json
```

The date folder uses UTC. The timestamp in the filename uses UTC with colons replaced by hyphens (Windows-compatible).

### Manifest schema

```json
{
  "exported_at": "<ISO timestamp>",
  "row_count": 1234,
  "filename": "audit-2026-04-24T10-30-00Z.jsonl.gz",
  "sha256": "<hex digest>",
  "retention_cutoffs": {
    "standard_days": 7,
    "agent_days": 30
  }
}
```

### How to run

```bash
npx tsx src/scripts/audit-export.ts
```

Set `DATABASE_URL` and (optionally) `COLD_STORAGE_PATH` before running. The script loads `.env.local` automatically via dotenv.

### Environment variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `COLD_STORAGE_PATH` | Output directory override (absolute path) | No — falls back to `storage_targets` table |
| `RESEND_API_KEY` | Resend API key for alert emails | No — alerts suppressed if absent |
| `ALERT_TO_EMAIL` | Alert recipient address | No — defaults to `mobile@charleskjohnson.com` |

### Output directory resolution

1. `COLD_STORAGE_PATH` environment variable (if set)
2. `mount_path` from the first row in `storage_targets` ordered by `id ASC`
3. If neither is available, script sends `COLD_STORAGE_UNMOUNTED` alert and exits 1

### `storage_targets` table

The `storage_targets` table is a registry of registered local drives. On each export run, the script probes `mount_path` via `fs.existsSync()` and updates `is_accessible` and `last_seen`.

**Schema:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (UUID) | Primary key |
| `drive_id` | TEXT | Unique drive identifier (e.g. serial number or label) |
| `label` | TEXT | Human-readable drive name |
| `mount_path` | TEXT | Absolute path to mount point |
| `last_seen` | TIMESTAMPTZ | Last time the script confirmed drive was accessible |
| `capacity_bytes` | BIGINT | Drive capacity (optional) |
| `encryption_status` | TEXT | `encrypted` / `unencrypted` / `unknown` |
| `is_accessible` | BOOLEAN | Updated by export script on each run |

**Register a new drive:**

```sql
INSERT INTO storage_targets (drive_id, label, mount_path, encryption_status)
VALUES ('WD-ABC123', 'Primary cold storage', '/mnt/cold-storage', 'encrypted');
```

### Alert behavior

| Condition | Alert sent | Exit code | Rows pruned? |
|-----------|-----------|-----------|--------------|
| Drive not accessible | `COLD_STORAGE_UNMOUNTED` | 1 | No |
| No `storage_targets` row | `COLD_STORAGE_UNMOUNTED` | 1 | No |
| SHA-256 mismatch after write | `COLD_STORAGE_CHECKSUM_MISMATCH` | 1 | No |
| Zero rows eligible | None | 0 | N/A |
| Success | None | 0 | Yes |

---

## Alert Types

Bootstrap alerts are defined in `src/services/alerts.ts` and fire via `src/services/notifications.ts` (Resend). All alerts email `ALERT_TO_EMAIL` (default: `mobile@charleskjohnson.com`).

| Alert | Trigger condition | Relevant function |
|-------|------------------|-------------------|
| `AUTH_FAILURE_SPIKE` | ≥ 3 HTTP 401/403 responses in 10 min | `checkAuthFailureSpike()` |
| `UNKNOWN_CALLER` | ≥ 1 request from `anonymous` caller in 10 min | `checkUnknownCaller()` |
| `WRITE_OUTSIDE_SESSION` | ≥ 1 write (POST/PUT/PATCH/DELETE) with `gateway_secret_only` auth in 10 min | `checkWriteOutsideSession()` |
| `PAT_EXPIRY_APPROACHING` | `CLERK_HUMAN_PAT` expires within 5 days | `checkPatExpiry()` |
| `MACHINE_SECRET_EXPIRY_APPROACHING` | Any `m2m_machine_secret` expires within 10 days | `checkMachineSecretExpiry()` |
| `COLD_STORAGE_UNMOUNTED` | Drive not accessible at export time | (audit-export.ts) |
| `COLD_STORAGE_CHECKSUM_MISMATCH` | SHA-256 mismatch after file write | (audit-export.ts) |

To run all five bootstrap alert checks:

```typescript
import { runAllAlertChecks } from './src/services/alerts.js';
await runAllAlertChecks();
```

---

## Scheduled Export (Future)

The export script is currently run manually. A scheduled job (cron, Railway scheduled service, or Meridian autonomous agent) will call it nightly in a future sprint. The script is designed to be idempotent: running it twice on the same day produces two timestamped files; the second run finds zero eligible rows after the first pruned them.
