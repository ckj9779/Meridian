// Copyright (c) 2026 ckj9779. Licensed under BSL 1.1. See LICENSE.

import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../config/database.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../notifications.js', () => ({
  sendAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('pino', () => ({
  default: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  })),
}));

import { pool } from '../../config/database.js';
import { sendAlert } from '../notifications.js';
import {
  checkAuthFailureSpike,
  checkMachineSecretExpiry,
  checkPatExpiry,
  checkUnknownCaller,
  checkWriteOutsideSession,
  runAllAlertChecks,
} from '../alerts.js';

const mockPool = pool as unknown as { query: ReturnType<typeof vi.fn> };
const mockSendAlert = sendAlert as ReturnType<typeof vi.fn>;

describe('alerts service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkAuthFailureSpike', () => {
    it('fires alert when count >= 3', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }] });
      await checkAuthFailureSpike();
      expect(mockSendAlert).toHaveBeenCalledWith(
        'AUTH_FAILURE_SPIKE',
        expect.objectContaining({ count: '5', window: '10 minutes' }),
      );
    });

    it('does NOT fire when count < 3', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '2' }] });
      await checkAuthFailureSpike();
      expect(mockSendAlert).not.toHaveBeenCalled();
    });

    it('does NOT fire when count is 0', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      await checkAuthFailureSpike();
      expect(mockSendAlert).not.toHaveBeenCalled();
    });
  });

  describe('checkUnknownCaller', () => {
    it('fires alert when count >= 1', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '3' }] });
      await checkUnknownCaller();
      expect(mockSendAlert).toHaveBeenCalledWith(
        'UNKNOWN_CALLER',
        expect.objectContaining({ count: '3' }),
      );
    });

    it('does NOT fire when count is 0', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      await checkUnknownCaller();
      expect(mockSendAlert).not.toHaveBeenCalled();
    });
  });

  describe('checkWriteOutsideSession', () => {
    it('fires alert when count >= 1', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      await checkWriteOutsideSession();
      expect(mockSendAlert).toHaveBeenCalledWith(
        'WRITE_OUTSIDE_SESSION',
        expect.objectContaining({ count: '1' }),
      );
    });

    it('does NOT fire when count is 0', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      await checkWriteOutsideSession();
      expect(mockSendAlert).not.toHaveBeenCalled();
    });
  });

  describe('checkPatExpiry', () => {
    it('fires alert when expiry_date is within 5 days', async () => {
      const soonDate = new Date(Date.now() + 3 * 86_400_000); // 3 days from now
      mockPool.query.mockResolvedValueOnce({
        rows: [{ credential_name: 'CLERK_HUMAN_PAT', expiry_date: soonDate }],
      });
      await checkPatExpiry();
      expect(mockSendAlert).toHaveBeenCalledWith(
        'PAT_EXPIRY_APPROACHING',
        expect.objectContaining({ name: 'CLERK_HUMAN_PAT' }),
      );
    });

    it('does NOT fire when no rows returned (expiry_date > today + 5 days)', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await checkPatExpiry();
      expect(mockSendAlert).not.toHaveBeenCalled();
    });
  });

  describe('checkMachineSecretExpiry', () => {
    it('fires alert when a machine secret expires within 10 days', async () => {
      const soonDate = new Date(Date.now() + 7 * 86_400_000);
      mockPool.query.mockResolvedValueOnce({
        rows: [{ credential_name: 'BACKEND_SECRET', expiry_date: soonDate }],
      });
      await checkMachineSecretExpiry();
      expect(mockSendAlert).toHaveBeenCalledWith(
        'MACHINE_SECRET_EXPIRY_APPROACHING',
        expect.objectContaining({ name: 'BACKEND_SECRET' }),
      );
    });

    it('does NOT fire when no rows returned', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await checkMachineSecretExpiry();
      expect(mockSendAlert).not.toHaveBeenCalled();
    });
  });

  describe('runAllAlertChecks', () => {
    it('completes even if one check throws', async () => {
      // First call (checkAuthFailureSpike) throws; remaining return empty
      mockPool.query
        .mockRejectedValueOnce(new Error('DB connection lost'))
        .mockResolvedValue({ rows: [] });

      await expect(runAllAlertChecks()).resolves.toBeUndefined();
    });

    it('runs all 5 checks sequentially', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      await runAllAlertChecks();
      // 5 checks, 1 query each
      expect(mockPool.query).toHaveBeenCalledTimes(5);
    });
  });
});
