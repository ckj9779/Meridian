// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('resend', () => ({
  Resend: vi.fn(),
}));

vi.mock('pino', () => ({
  default: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  })),
}));

describe('notifications service', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('RESEND_API_KEY', 're_test_key_123');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('calls resend.emails.send with correct from/to/subject/text', async () => {
    const mockSend = vi.fn().mockResolvedValue({ data: { id: 'email_abc' }, error: null });
    const { Resend } = await import('resend');
    vi.mocked(Resend).mockImplementation(class { emails = { send: mockSend }; } as never);

    const { sendNotification } = await import('../notifications.js');

    await sendNotification({
      to: 'test@example.com',
      subject: 'Test subject',
      body: 'Test body',
      alertType: 'AUTH_FAILURE_SPIKE',
    });

    expect(mockSend).toHaveBeenCalledWith({
      from: 'meridian@notifications.mydatasphere.dev',
      to: 'test@example.com',
      subject: 'Test subject',
      text: 'Test body',
    });
  });

  it('suppresses notification when RESEND_API_KEY is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.resetModules();
    // Module must load without throwing; sendNotification resolves silently
    const { sendNotification } = await import('../notifications.js');
    await expect(
      sendNotification({
        to: 'test@example.com',
        subject: 'Subject',
        body: 'Body',
        alertType: 'AUTH_FAILURE_SPIKE',
      }),
    ).resolves.toBeUndefined();
  });

  it('catches Resend API error and does not throw', async () => {
    const mockSend = vi.fn().mockRejectedValue(new Error('Network failure'));
    const { Resend } = await import('resend');
    vi.mocked(Resend).mockImplementation(class { emails = { send: mockSend }; } as never);

    const { sendNotification } = await import('../notifications.js');

    await expect(
      sendNotification({
        to: 'test@example.com',
        subject: 'Subject',
        body: 'Body',
        alertType: 'UNKNOWN_CALLER',
      }),
    ).resolves.toBeUndefined();
  });

  it('sendAlert resolves with correct subject for COLD_STORAGE_UNMOUNTED', async () => {
    const mockSend = vi.fn().mockResolvedValue({ data: { id: 'email_xyz' }, error: null });
    const { Resend } = await import('resend');
    vi.mocked(Resend).mockImplementation(class { emails = { send: mockSend }; } as never);

    const { sendAlert } = await import('../notifications.js');
    await sendAlert('COLD_STORAGE_UNMOUNTED', { target: 'backup-drive', mount_path: '/mnt/backup' });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Meridian — Cold storage drive not accessible',
      }),
    );
  });
});
