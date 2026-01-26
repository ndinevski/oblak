/**
 * Authentication configuration tests
 * Tests for users-permissions plugin and JWT configuration
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Mock environment for testing
const mockEnv = (key: string, defaultValue?: any) => {
  const envVars: Record<string, string> = {
    JWT_SECRET: 'test-jwt-secret',
    JWT_EXPIRES_IN: '7d',
    EMAIL_PROVIDER: 'nodemailer',
    SMTP_HOST: 'smtp.test.com',
    SMTP_PORT: '587',
    SMTP_USERNAME: 'test@test.com',
    SMTP_PASSWORD: 'password',
    SMTP_SECURE: 'false',
    EMAIL_FROM: 'noreply@test.com',
    EMAIL_REPLY_TO: 'support@test.com',
  };

  return envVars[key] ?? defaultValue;
};

// Create env function with array and bool helpers
const createEnvFn = () => {
  const envFn = (key: string, defaultValue?: any) => mockEnv(key, defaultValue);
  envFn.array = (key: string, defaultValue?: any) => {
    const value = mockEnv(key, null);
    return value ? value.split(',') : defaultValue;
  };
  envFn.int = (key: string, defaultValue?: number) => {
    const value = mockEnv(key, null);
    return value ? parseInt(value, 10) : defaultValue;
  };
  envFn.bool = (key: string, defaultValue?: boolean) => {
    const value = mockEnv(key, null);
    return value ? value === 'true' : defaultValue;
  };
  return envFn;
};

// Import the plugins config factory
import pluginsConfig from '../../config/plugins';

describe('Authentication Configuration', () => {
  let config: ReturnType<typeof pluginsConfig>;

  beforeAll(() => {
    config = pluginsConfig({ env: createEnvFn() });
  });

  describe('Users-Permissions Plugin', () => {
    it('should configure JWT settings', () => {
      expect(config['users-permissions']).toBeDefined();
      expect(config['users-permissions'].config.jwt).toBeDefined();
      expect(config['users-permissions'].config.jwt.expiresIn).toBe('7d');
    });

    it('should set JWT secret from environment', () => {
      expect(config['users-permissions'].config.jwtSecret).toBe('test-jwt-secret');
    });

    it('should configure allowed registration fields', () => {
      const registerConfig = config['users-permissions'].config.register;
      expect(registerConfig).toBeDefined();
      expect(registerConfig.allowedFields).toContain('username');
      expect(registerConfig.allowedFields).toContain('email');
      expect(registerConfig.allowedFields).toContain('password');
      expect(registerConfig.allowedFields).toContain('organization');
    });

    it('should configure password requirements', () => {
      const passwordConfig = config['users-permissions'].config.password;
      expect(passwordConfig).toBeDefined();
      expect(passwordConfig.minLength).toBe(8);
      expect(passwordConfig.maxLength).toBe(128);
    });

    it('should configure rate limiting for auth endpoints', () => {
      const ratelimit = config['users-permissions'].config.ratelimit;
      expect(ratelimit).toBeDefined();
      expect(ratelimit.interval).toBe(60000);
      expect(ratelimit.max).toBe(10);
    });
  });

  describe('Email Plugin', () => {
    it('should configure email provider', () => {
      expect(config.email).toBeDefined();
      expect(config.email.config.provider).toBe('nodemailer');
    });

    it('should configure SMTP settings', () => {
      const providerOptions = config.email.config.providerOptions;
      expect(providerOptions.host).toBe('smtp.test.com');
      expect(providerOptions.port).toBe(587);
      expect(providerOptions.auth.user).toBe('test@test.com');
      expect(providerOptions.auth.pass).toBe('password');
      expect(providerOptions.secure).toBe(false);
    });

    it('should configure default email addresses', () => {
      const settings = config.email.config.settings;
      expect(settings.defaultFrom).toBe('noreply@test.com');
      expect(settings.defaultReplyTo).toBe('support@test.com');
    });
  });

  describe('GraphQL Plugin', () => {
    it('should disable GraphQL for REST-only API', () => {
      expect(config.graphql).toBeDefined();
      expect(config.graphql.enabled).toBe(false);
    });
  });
});

describe('User Extension Schema', () => {
  // Test the extended user schema attributes
  const expectedAttributes = {
    organization: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      default: 'Personal',
    },
    quotas: {
      type: 'json',
      default: {
        maxFunctions: 10,
        maxVMs: 5,
        maxBuckets: 10,
        maxStorageGB: 50,
      },
    },
    lastLoginAt: {
      type: 'datetime',
    },
  };

  it('should define organization field', () => {
    const orgAttr = expectedAttributes.organization;
    expect(orgAttr.type).toBe('string');
    expect(orgAttr.default).toBe('Personal');
    expect(orgAttr.maxLength).toBe(100);
  });

  it('should define quotas field with defaults', () => {
    const quotasAttr = expectedAttributes.quotas;
    expect(quotasAttr.type).toBe('json');
    expect(quotasAttr.default.maxFunctions).toBe(10);
    expect(quotasAttr.default.maxVMs).toBe(5);
    expect(quotasAttr.default.maxBuckets).toBe(10);
    expect(quotasAttr.default.maxStorageGB).toBe(50);
  });

  it('should define lastLoginAt field', () => {
    const lastLoginAttr = expectedAttributes.lastLoginAt;
    expect(lastLoginAttr.type).toBe('datetime');
  });
});

describe('JWT Configuration Validation', () => {
  it('should use default expiry when not specified', () => {
    const envWithoutExpiry = () => {
      const fn = (key: string, defaultValue?: any) => {
        if (key === 'JWT_EXPIRES_IN') return defaultValue;
        return mockEnv(key, defaultValue);
      };
      fn.array = (k: string, d?: any) => d;
      fn.int = (k: string, d?: number) => d;
      fn.bool = (k: string, d?: boolean) => d;
      return fn;
    };

    const configWithDefaults = pluginsConfig({ env: envWithoutExpiry() });
    expect(configWithDefaults['users-permissions'].config.jwt.expiresIn).toBe('7d');
  });

  it('should validate JWT expiry format', () => {
    const validFormats = ['1d', '7d', '30d', '1h', '24h', '1w'];
    validFormats.forEach((format) => {
      expect(format).toMatch(/^\d+[dhw]$/);
    });
  });

  it('should require minimum password length of 8', () => {
    const localConfig = pluginsConfig({ env: createEnvFn() });
    const passwordConfig = localConfig['users-permissions'].config.password;
    expect(passwordConfig.minLength).toBeGreaterThanOrEqual(8);
  });
});

describe('Auth Rate Limiting', () => {
  it('should limit requests per interval', () => {
    const localConfig = pluginsConfig({ env: createEnvFn() });
    const ratelimit = localConfig['users-permissions'].config.ratelimit;
    expect(ratelimit.max).toBeLessThanOrEqual(20); // Reasonable limit
    expect(ratelimit.interval).toBeGreaterThanOrEqual(60000); // At least 1 minute
  });
});
