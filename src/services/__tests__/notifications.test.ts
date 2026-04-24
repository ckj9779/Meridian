// Copyright (c) 2026 Charles K. Johnson
// SPDX-License-Identifier: BSL-1.1

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('resend', () => ({
  Resend: vi.fn(),
}));

vi.mock('pino', () => ({
  default: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
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

  it('throws on initialisation when RESEND_API_KEY is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.resetModules();
    await expect(import('../notifications.js')).rejects.toThrow('RESEND_API_KEY');
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
});
