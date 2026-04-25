// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

/**
 * Bootstrap alert checks. D51 (5 inbox-posture alert types).
 *
 * Each check function queries audit_events or credential_rotations,
 * evaluates the alert condition, and calls sendAlert() if met.
 * Functions never throw — errors are caught and logged.
 *
 * Column note: audit_events uses 'timestamp' (not 'occurred_at') and
 * 'route' (not 'endpoint'). caller_identity stores 'anonymous' (not
 * 'system:anonymous'). auth_method stores 'gateway_secret_only' (not 'none').
 * These match migration 006 and audit.ts — not the D51 spec shorthand.
 */

import pino from 'pino';
import { pool } from '../config/database.js';
import { sendAlert } from './notifications.js';

const log = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});

const MS_PER_DAY = 86_400_000;

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / MS_PER_DAY);
}

export async function checkAuthFailureSpike(): Promise<void> {
  try {
    const result = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE status_code IN (401, 403)
         AND timestamp > NOW() - INTERVAL '10 minutes'`,
    );
    const count = Number(result.rows[0]?.count ?? 0);
    if (count >= 3) {
      await sendAlert('AUTH_FAILURE_SPIKE', { count: String(count), window: '10 minutes' });
      log.warn({ count }, 'checkAuthFailureSpike: alert fired');
    } else {
      log.debug({ count }, 'checkAuthFailureSpike: not fired');
    }
  } catch (err) {
    log.error({ err }, 'checkAuthFailureSpike failed');
  }
}

export async function checkUnknownCaller(): Promise<void> {
  try {
    const result = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE caller_identity = 'anonymous'
         AND timestamp > NOW() - INTERVAL '10 minutes'`,
    );
    const count = Number(result.rows[0]?.count ?? 0);
    if (count >= 1) {
      await sendAlert('UNKNOWN_CALLER', { count: String(count), window: '10 minutes' });
      log.warn({ count }, 'checkUnknownCaller: alert fired');
    } else {
      log.debug({ count }, 'checkUnknownCaller: not fired');
    }
  } catch (err) {
    log.error({ err }, 'checkUnknownCaller failed');
  }
}

export async function checkWriteOutsideSession(): Promise<void> {
  try {
    const result = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE http_method IN ('POST', 'PUT', 'PATCH', 'DELETE')
         AND auth_method = 'gateway_secret_only'
         AND timestamp > NOW() - INTERVAL '10 minutes'`,
    );
    const count = Number(result.rows[0]?.count ?? 0);
    if (count >= 1) {
      await sendAlert('WRITE_OUTSIDE_SESSION', { count: String(count), window: '10 minutes' });
      log.warn({ count }, 'checkWriteOutsideSession: alert fired');
    } else {
      log.debug({ count }, 'checkWriteOutsideSession: not fired');
    }
  } catch (err) {
    log.error({ err }, 'checkWriteOutsideSession failed');
  }
}

export async function checkPatExpiry(): Promise<void> {
  try {
    const result = await pool.query<{ credential_name: string; expiry_date: Date }>(
      `SELECT credential_name, expiry_date FROM credential_rotations
       WHERE credential_name = 'CLERK_HUMAN_PAT'
         AND expiry_date IS NOT NULL
         AND expiry_date <= CURRENT_DATE + INTERVAL '5 days'`,
    );
    for (const row of result.rows) {
      const days = daysUntil(row.expiry_date);
      await sendAlert('PAT_EXPIRY_APPROACHING', {
        name: row.credential_name,
        expiry_date: row.expiry_date.toISOString().split('T')[0] ?? '',
        days_remaining: String(days),
      });
      log.warn({ credential: row.credential_name, days }, 'checkPatExpiry: alert fired');
    }
    if (result.rows.length === 0) {
      log.debug('checkPatExpiry: not fired');
    }
  } catch (err) {
    log.error({ err }, 'checkPatExpiry failed');
  }
}

export async function checkMachineSecretExpiry(): Promise<void> {
  try {
    const result = await pool.query<{ credential_name: string; expiry_date: Date }>(
      `SELECT credential_name, expiry_date FROM credential_rotations
       WHERE credential_type = 'm2m_machine_secret'
         AND expiry_date IS NOT NULL
         AND expiry_date <= CURRENT_DATE + INTERVAL '10 days'`,
    );
    for (const row of result.rows) {
      const days = daysUntil(row.expiry_date);
      await sendAlert('MACHINE_SECRET_EXPIRY_APPROACHING', {
        name: row.credential_name,
        expiry_date: row.expiry_date.toISOString().split('T')[0] ?? '',
        days_remaining: String(days),
      });
      log.warn({ credential: row.credential_name, days }, 'checkMachineSecretExpiry: alert fired');
    }
    if (result.rows.length === 0) {
      log.debug('checkMachineSecretExpiry: not fired');
    }
  } catch (err) {
    log.error({ err }, 'checkMachineSecretExpiry failed');
  }
}

export async function runAllAlertChecks(): Promise<void> {
  await checkAuthFailureSpike();
  await checkUnknownCaller();
  await checkWriteOutsideSession();
  await checkPatExpiry();
  await checkMachineSecretExpiry();
}
