// Copyright (c) 2026 Charles K. Johnson
// SPDX-License-Identifier: BSL-1.1

import { Resend } from 'resend';
import pino from 'pino';
import { requestContext } from '../lib/request-context.js';

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY environment variable is required');
}

const resend = new Resend(process.env.RESEND_API_KEY);

const log = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  mixin: () => {
    const ctx = requestContext.getStore();
    return ctx ? { traceId: ctx.traceId } : {};
  },
});

export type AlertType =
  | 'AUTH_FAILURE_SPIKE'
  | 'UNKNOWN_CALLER'
  | 'WRITE_OUTSIDE_SESSION'
  | 'PAT_EXPIRY_APPROACHING'
  | 'MACHINE_SECRET_EXPIRY_APPROACHING';

export interface NotificationPayload {
  to: string;
  subject: string;
  body: string;
  alertType: AlertType;
}

const FROM = 'meridian@notifications.mydatasphere.dev';

export async function sendNotification(payload: NotificationPayload): Promise<void> {
  const { to, subject, body, alertType } = payload;
  const traceId = requestContext.getStore()?.traceId;

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

    log.info({ alertType, traceId, emailId: data.id }, 'Notification sent');
  } catch (err) {
    log.error({ alertType, traceId, err }, 'Notification send failed');
  }
}
