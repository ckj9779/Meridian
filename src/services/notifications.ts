// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import { Resend } from 'resend';
import pino from 'pino';
import { requestContext } from '../lib/request-context.js';

const log = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  mixin: () => {
    const ctx = requestContext.getStore();
    return ctx ? { traceId: ctx.traceId } : {};
  },
});

let resend: Resend | null = null;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  log.warn('RESEND_API_KEY not set — notifications will be suppressed');
}

export type AlertType =
  | 'AUTH_FAILURE_SPIKE'
  | 'UNKNOWN_CALLER'
  | 'WRITE_OUTSIDE_SESSION'
  | 'PAT_EXPIRY_APPROACHING'
  | 'MACHINE_SECRET_EXPIRY_APPROACHING'
  | 'COLD_STORAGE_UNMOUNTED'
  | 'COLD_STORAGE_CHECKSUM_MISMATCH';

export interface NotificationPayload {
  to: string;
  subject: string;
  body: string;
  alertType: AlertType;
}

const FROM = 'meridian@notifications.mydatasphere.dev';
const ALERT_TO = process.env.ALERT_TO_EMAIL ?? 'mobile@charleskjohnson.com';

export async function sendNotification(payload: NotificationPayload): Promise<void> {
  const { to, subject, body, alertType } = payload;
  const traceId = requestContext.getStore()?.traceId;

  if (!resend) {
    log.warn({ alertType, traceId }, 'Notification suppressed — RESEND_API_KEY not set');
    return;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      text: body,
    });

    if (error) {
      log.error({ alertType, traceId, error }, 'Notification send failed');
      return;
    }

    log.info({ alertType, traceId, emailId: data?.id }, 'Notification sent');
  } catch (err) {
    log.error({ alertType, traceId, err }, 'Notification send failed');
  }
}

interface AlertTemplate {
  subject: string;
  body: (context?: Record<string, string>) => string;
}

const ALERT_TEMPLATES: Record<AlertType, AlertTemplate> = {
  AUTH_FAILURE_SPIKE: {
    subject: 'Meridian — Auth failure spike detected',
    body: (ctx) =>
      `${ctx?.count ?? '?'} auth failures (401/403) in the last ${ctx?.window ?? '10 minutes'}.\n\nReview audit_events for details.`,
  },
  UNKNOWN_CALLER: {
    subject: 'Meridian — Unknown caller detected',
    body: (ctx) =>
      `${ctx?.count ?? '?'} request(s) from unidentified callers in the last ${ctx?.window ?? '10 minutes'}.\n\nReview audit_events for details.`,
  },
  WRITE_OUTSIDE_SESSION: {
    subject: 'Meridian — Write outside authenticated session',
    body: (ctx) =>
      `${ctx?.count ?? '?'} write operation(s) with no authentication in the last ${ctx?.window ?? '10 minutes'}.\n\nReview audit_events for details.`,
  },
  PAT_EXPIRY_APPROACHING: {
    subject: 'Meridian — PAT expiry approaching',
    body: (ctx) =>
      `Personal Access Token "${ctx?.name ?? 'CLERK_HUMAN_PAT'}" expires on ${ctx?.expiry_date ?? 'unknown'} (${ctx?.days_remaining ?? '?'} days remaining).\n\nRotate via the Clerk dashboard.`,
  },
  MACHINE_SECRET_EXPIRY_APPROACHING: {
    subject: 'Meridian — Machine secret expiry approaching',
    body: (ctx) =>
      `Machine secret "${ctx?.name ?? 'unknown'}" expires on ${ctx?.expiry_date ?? 'unknown'} (${ctx?.days_remaining ?? '?'} days remaining).\n\nRotate and update all dependent services.`,
  },
  COLD_STORAGE_UNMOUNTED: {
    subject: 'Meridian — Cold storage drive not accessible',
    body: (ctx) =>
      `Cold storage target "${ctx?.target ?? 'unknown'}" is not accessible at mount path "${ctx?.mount_path ?? 'unknown'}".\n\nMount the drive and retry the export.`,
  },
  COLD_STORAGE_CHECKSUM_MISMATCH: {
    subject: 'Meridian — Export checksum mismatch, rows NOT pruned',
    body: (ctx) =>
      `SHA-256 mismatch for export file "${ctx?.filename ?? 'unknown'}".\nExpected: ${ctx?.expected ?? '?'}\nActual:   ${ctx?.actual ?? '?'}\n\nRows were NOT pruned. Investigate the export file before retrying.`,
  },
};

export async function sendAlert(
  alertType: AlertType,
  context?: Record<string, string>,
): Promise<void> {
  const template = ALERT_TEMPLATES[alertType];
  await sendNotification({
    to: ALERT_TO,
    subject: template.subject,
    body: template.body(context),
    alertType,
  });
}
