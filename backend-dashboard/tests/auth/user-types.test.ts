/**
 * User types and validation tests
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_USER_QUOTAS,
  validatePassword,
  validateEmail,
  validateUsername,
  isQuotaExceeded,
  getRemainingQuota,
  type UserQuotas,
  type UserResourceUsage,
} from '../../src/types/user';

describe('User Types', () => {
  describe('DEFAULT_USER_QUOTAS', () => {
    it('should have maxFunctions quota', () => {
      expect(DEFAULT_USER_QUOTAS.maxFunctions).toBe(10);
    });

    it('should have maxVMs quota', () => {
      expect(DEFAULT_USER_QUOTAS.maxVMs).toBe(5);
    });

    it('should have maxBuckets quota', () => {
      expect(DEFAULT_USER_QUOTAS.maxBuckets).toBe(10);
    });

    it('should have maxStorageGB quota', () => {
      expect(DEFAULT_USER_QUOTAS.maxStorageGB).toBe(50);
    });
  });
});

describe('Password Validation', () => {
  it('should accept valid password', () => {
    const result = validatePassword('SecurePass123');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject password shorter than 8 characters', () => {
    const result = validatePassword('Short1');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must be at least 8 characters long');
  });

  it('should reject password longer than 128 characters', () => {
    const result = validatePassword('A1' + 'a'.repeat(128));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must be at most 128 characters long');
  });

  it('should reject password without uppercase letter', () => {
    const result = validatePassword('lowercase123');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one uppercase letter');
  });

  it('should reject password without lowercase letter', () => {
    const result = validatePassword('UPPERCASE123');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one lowercase letter');
  });

  it('should reject password without number', () => {
    const result = validatePassword('NoNumbersHere');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one number');
  });

  it('should return multiple errors for multiple violations', () => {
    const result = validatePassword('weak');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe('Email Validation', () => {
  it('should accept valid email', () => {
    expect(validateEmail('user@example.com')).toBe(true);
  });

  it('should accept email with subdomain', () => {
    expect(validateEmail('user@mail.example.com')).toBe(true);
  });

  it('should accept email with plus sign', () => {
    expect(validateEmail('user+tag@example.com')).toBe(true);
  });

  it('should reject email without @', () => {
    expect(validateEmail('userexample.com')).toBe(false);
  });

  it('should reject email without domain', () => {
    expect(validateEmail('user@')).toBe(false);
  });

  it('should reject email without TLD', () => {
    expect(validateEmail('user@example')).toBe(false);
  });

  it('should reject email with spaces', () => {
    expect(validateEmail('user @example.com')).toBe(false);
  });
});

describe('Username Validation', () => {
  it('should accept valid username', () => {
    const result = validateUsername('john_doe');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept username with numbers', () => {
    const result = validateUsername('user123');
    expect(result.valid).toBe(true);
  });

  it('should reject username shorter than 3 characters', () => {
    const result = validateUsername('ab');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Username must be at least 3 characters long');
  });

  it('should reject username longer than 30 characters', () => {
    const result = validateUsername('a'.repeat(31));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Username must be at most 30 characters long');
  });

  it('should reject username with special characters', () => {
    const result = validateUsername('user@name');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Username can only contain letters, numbers, and underscores');
  });

  it('should reject username with spaces', () => {
    const result = validateUsername('user name');
    expect(result.valid).toBe(false);
  });

  it('should reject username with hyphen', () => {
    const result = validateUsername('user-name');
    expect(result.valid).toBe(false);
  });
});

describe('Quota Functions', () => {
  const quotas: UserQuotas = {
    maxFunctions: 10,
    maxVMs: 5,
    maxBuckets: 10,
    maxStorageGB: 50,
  };

  describe('isQuotaExceeded', () => {
    it('should return false when under quota', () => {
      const usage: UserResourceUsage = {
        functionsCount: 5,
        vmsCount: 2,
        bucketsCount: 3,
        storageUsedGB: 10,
      };

      expect(isQuotaExceeded(quotas, usage, 'maxFunctions')).toBe(false);
      expect(isQuotaExceeded(quotas, usage, 'maxVMs')).toBe(false);
      expect(isQuotaExceeded(quotas, usage, 'maxBuckets')).toBe(false);
      expect(isQuotaExceeded(quotas, usage, 'maxStorageGB')).toBe(false);
    });

    it('should return true when at quota limit', () => {
      const usage: UserResourceUsage = {
        functionsCount: 10,
        vmsCount: 5,
        bucketsCount: 10,
        storageUsedGB: 50,
      };

      expect(isQuotaExceeded(quotas, usage, 'maxFunctions')).toBe(true);
      expect(isQuotaExceeded(quotas, usage, 'maxVMs')).toBe(true);
      expect(isQuotaExceeded(quotas, usage, 'maxBuckets')).toBe(true);
      expect(isQuotaExceeded(quotas, usage, 'maxStorageGB')).toBe(true);
    });

    it('should return true when over quota', () => {
      const usage: UserResourceUsage = {
        functionsCount: 15,
        vmsCount: 10,
        bucketsCount: 20,
        storageUsedGB: 100,
      };

      expect(isQuotaExceeded(quotas, usage, 'maxFunctions')).toBe(true);
    });
  });

  describe('getRemainingQuota', () => {
    it('should return remaining quota when under limit', () => {
      const usage: UserResourceUsage = {
        functionsCount: 3,
        vmsCount: 2,
        bucketsCount: 5,
        storageUsedGB: 20,
      };

      expect(getRemainingQuota(quotas, usage, 'maxFunctions')).toBe(7);
      expect(getRemainingQuota(quotas, usage, 'maxVMs')).toBe(3);
      expect(getRemainingQuota(quotas, usage, 'maxBuckets')).toBe(5);
      expect(getRemainingQuota(quotas, usage, 'maxStorageGB')).toBe(30);
    });

    it('should return 0 when at quota limit', () => {
      const usage: UserResourceUsage = {
        functionsCount: 10,
        vmsCount: 5,
        bucketsCount: 10,
        storageUsedGB: 50,
      };

      expect(getRemainingQuota(quotas, usage, 'maxFunctions')).toBe(0);
    });

    it('should return 0 when over quota (not negative)', () => {
      const usage: UserResourceUsage = {
        functionsCount: 15,
        vmsCount: 10,
        bucketsCount: 20,
        storageUsedGB: 100,
      };

      expect(getRemainingQuota(quotas, usage, 'maxFunctions')).toBe(0);
      expect(getRemainingQuota(quotas, usage, 'maxVMs')).toBe(0);
    });
  });
});
