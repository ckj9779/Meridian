// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

/**
 * Standalone cold-storage export script. D49 (local cold storage), D53 (sovereignty).
 *
 * Usage: npx tsx src/scripts/audit-export.ts
 *
 * Retention thresholds:
 *   - caller_type IN ('m2m_agent', 'm2m_meridian'): 30 days
 *   - all other caller types: 7 days
 *
 * Exit codes:
 *   0 — success (including zero rows eligible)
 *   1 — storage target not accessible, checksum mismatch, or unhandled error
 */

import { createGzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';
import { config as loadDotenv } from 'dotenv';
import { pool } from '../config/database.js';
import { sendAlert } from '../services/notifications.js';

loadDotenv({ path: '.env.local' });

const log = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});

const STANDARD_RETENTION_DAYS = 7;
const AGENT_RETENTION_DAYS = 30;
const BATCH_SIZE = 1000;
const AGENT_CALLER_TYPES = ['m2m_agent', 'm2m_meridian'];

function utcDateFolder(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

function exportFilename(date: Date): string {
  // Replace colons (invalid on Windows) with hyphens
  const ts = date.toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
  return `audit-${ts}.jsonl.gz`;
}

async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function resolveOutputDir(): Promise<string | null> {
  // 1. Env var override
  if (process.env.COLD_STORAGE_PATH) {
    return process.env.COLD_STORAGE_PATH;
  }

  // 2. storage_targets table — first row by id
  const result = await pool.query<{
    id: string;
    label: string;
    mount_path: string;
    is_accessible: boolean;
  }>(
    `SELECT id, label, mount_path, is_accessible
     FROM storage_targets
     ORDER BY id ASC
     LIMIT 1`,
  );

  const row = result.rows[0];
  if (!row) {
    log.error('No storage_targets row found — cannot resolve output directory');
    await sendAlert('COLD_STORAGE_UNMOUNTED', {
      target: 'unknown',
      mount_path: 'unknown',
    });
    return null;
  }

  // Probe mount path
  const accessible = existsSync(row.mount_path);
  await pool.query(
    `UPDATE storage_targets SET is_accessible = $1, last_seen = NOW() WHERE id = $2`,
    [accessible, row.id],
  );

  if (!accessible) {
    log.error(
      { label: row.label, mount_path: row.mount_path },
      'Storage target not accessible',
    );
    await sendAlert('COLD_STORAGE_UNMOUNTED', {
      target: row.label,
      mount_path: row.mount_path,
    });
    return null;
  }

  return row.mount_path;
}

async function main(): Promise<void> {
  const runDate = new Date();
  log.info('audit-export: run started');

  const outputBase = await resolveOutputDir();
  if (!outputBase) {
    process.exit(1);
  }

  // Compute retention cutoffs
  const standardCutoff = new Date(runDate.getTime() - STANDARD_RETENTION_DAYS * 86400_000);
  const agentCutoff = new Date(runDate.getTime() - AGENT_RETENTION_DAYS * 86400_000);

  // Paginate query — collect rows and IDs without loading everything at once
  const exportedIds: string[] = [];
  let offset = 0;
  let totalRows = 0;

  // Prepare gzip write stream
  const dateFolder = utcDateFolder(runDate);
  const filename = exportFilename(runDate);
  const outputDir = join(outputBase, dateFolder);
  const outputPath = join(outputDir, filename);
  const manifestPath = join(outputDir, filename.replace('.jsonl.gz', '.manifest.json'));

  // Check first whether any rows qualify before creating files
  const countResult = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM audit_events
     WHERE (caller_type = ANY($1) AND timestamp < $2)
        OR (caller_type <> ALL($1) AND timestamp < $3)`,
    [AGENT_CALLER_TYPES, agentCutoff, standardCutoff],
  );
  totalRows = Number(countResult.rows[0]?.count ?? 0);

  if (totalRows === 0) {
    log.info('audit-export: no rows eligible for export');
    await pool.end();
    process.exit(0);
  }

  log.info({ rowCount: totalRows, outputPath }, 'audit-export: rows eligible, writing file');

  mkdirSync(outputDir, { recursive: true });

  const gzip = createGzip();
  const fileStream = createWriteStream(outputPath);
  gzip.pipe(fileStream);

  let rowCount = 0;

  while (true) {
    const result = await pool.query(
      `SELECT * FROM audit_events
       WHERE (caller_type = ANY($1) AND timestamp < $2)
          OR (caller_type <> ALL($1) AND timestamp < $3)
       ORDER BY timestamp ASC
       LIMIT $4 OFFSET $5`,
      [AGENT_CALLER_TYPES, agentCutoff, standardCutoff, BATCH_SIZE, offset],
    );

    if (result.rows.length === 0) break;

    for (const row of result.rows) {
      exportedIds.push(row.id as string);
      gzip.write(JSON.stringify(row) + '\n');
      rowCount++;
    }

    log.debug({ filename, batchOffset: offset, batchSize: result.rows.length }, 'audit-export: batch written');

    if (result.rows.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  gzip.end();
  await new Promise<void>((resolve, reject) => {
    fileStream.on('finish', resolve);
    fileStream.on('error', reject);
  });

  log.info({ filename, rowCount }, 'audit-export: file written');

  // Compute SHA-256 of the written file
  const sha256 = await computeFileSha256(outputPath);
  log.info({ filename, sha256 }, 'audit-export: SHA-256 computed');

  // Write manifest
  const manifest = {
    exported_at: runDate.toISOString(),
    row_count: rowCount,
    filename,
    sha256,
    retention_cutoffs: {
      standard_days: STANDARD_RETENTION_DAYS,
      agent_days: AGENT_RETENTION_DAYS,
    },
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  log.info({ filename, manifestPath }, 'audit-export: manifest written');

  // Verify: recompute SHA-256 and compare
  const verifiedSha256 = await computeFileSha256(outputPath);
  if (verifiedSha256 !== sha256) {
    log.error(
      { filename, expected: sha256, actual: verifiedSha256 },
      'audit-export: SHA-256 mismatch — rows NOT pruned',
    );
    await sendAlert('COLD_STORAGE_CHECKSUM_MISMATCH', {
      filename,
      expected: sha256,
      actual: verifiedSha256,
    });
    await pool.end();
    process.exit(1);
  }

  log.info({ filename }, 'audit-export: SHA-256 verified');

  // Prune — parameterized bulk delete
  await pool.query(
    `DELETE FROM audit_events WHERE id = ANY($1::text[])`,
    [exportedIds],
  );
  log.info({ filename, rowsPruned: exportedIds.length }, 'audit-export: rows pruned');

  await pool.end();
  log.info('audit-export: complete');
}

main().catch((err: unknown) => {
  log.error({ err }, 'audit-export: unhandled error');
  pool.end().catch(() => undefined).finally(() => process.exit(1));
});
