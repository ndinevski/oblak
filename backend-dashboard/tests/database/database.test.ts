/**
 * Database Connection Tests
 * 
 * Tests for PostgreSQL database configuration and connection
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';

describe('Database Connection', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('PostgreSQL Configuration', () => {
    it('should use postgres as default client', async () => {
      delete process.env.DATABASE_CLIENT;
      
      const env = createEnvHelper();
      const databaseConfig = (await import('../../config/database')).default;
      const config = databaseConfig({ env });

      expect(config.connection.client).toBe('postgres');
    });

    it('should configure connection from environment variables', async () => {
      process.env.DATABASE_HOST = 'db.example.com';
      process.env.DATABASE_PORT = '5433';
      process.env.DATABASE_NAME = 'mydb';
      process.env.DATABASE_USERNAME = 'myuser';
      process.env.DATABASE_PASSWORD = 'mypass';

      const env = createEnvHelper();
      const databaseConfig = (await import('../../config/database')).default;
      const config = databaseConfig({ env });

      expect(config.connection.connection.host).toBe('db.example.com');
      expect(config.connection.connection.port).toBe(5433);
      expect(config.connection.connection.database).toBe('mydb');
      expect(config.connection.connection.user).toBe('myuser');
      expect(config.connection.connection.password).toBe('mypass');
    });

    it('should configure pool settings', async () => {
      process.env.DATABASE_POOL_MIN = '5';
      process.env.DATABASE_POOL_MAX = '20';

      const env = createEnvHelper();
      const databaseConfig = (await import('../../config/database')).default;
      const config = databaseConfig({ env });

      expect(config.connection.pool.min).toBe(5);
      expect(config.connection.pool.max).toBe(20);
    });

    it('should use default pool settings when not specified', async () => {
      delete process.env.DATABASE_POOL_MIN;
      delete process.env.DATABASE_POOL_MAX;

      const env = createEnvHelper();
      const databaseConfig = (await import('../../config/database')).default;
      const config = databaseConfig({ env });

      expect(config.connection.pool.min).toBe(2);
      expect(config.connection.pool.max).toBe(10);
    });

    it('should disable SSL by default', async () => {
      delete process.env.DATABASE_SSL;

      const env = createEnvHelper();
      const databaseConfig = (await import('../../config/database')).default;
      const config = databaseConfig({ env });

      expect(config.connection.connection.ssl).toBe(false);
    });

    it('should enable SSL when configured', async () => {
      process.env.DATABASE_SSL = 'true';

      const env = createEnvHelper();
      const databaseConfig = (await import('../../config/database')).default;
      const config = databaseConfig({ env });

      expect(config.connection.connection.ssl).toBeTruthy();
      expect(config.connection.connection.ssl.rejectUnauthorized).toBe(true);
    });

    it('should configure connection timeout', async () => {
      process.env.DATABASE_CONNECTION_TIMEOUT = '120000';

      const env = createEnvHelper();
      const databaseConfig = (await import('../../config/database')).default;
      const config = databaseConfig({ env });

      expect(config.connection.acquireConnectionTimeout).toBe(120000);
    });

    it('should use public schema by default', async () => {
      delete process.env.DATABASE_SCHEMA;

      const env = createEnvHelper();
      const databaseConfig = (await import('../../config/database')).default;
      const config = databaseConfig({ env });

      expect(config.connection.connection.schema).toBe('public');
    });
  });

  describe('Database URL Support', () => {
    it('should support DATABASE_URL connection string', async () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/dbname';

      const env = createEnvHelper();
      const databaseConfig = (await import('../../config/database')).default;
      const config = databaseConfig({ env });

      expect(config.connection.connection.connectionString).toBe('postgresql://user:pass@host:5432/dbname');
    });
  });
});

// Helper function to create env mock
function createEnvHelper() {
  const env = (key: string, defaultValue?: any) => process.env[key] || defaultValue;
  return Object.assign(env, {
    int: (key: string, defaultValue: number) => {
      const val = process.env[key];
      return val ? parseInt(val, 10) : defaultValue;
    },
    bool: (key: string, defaultValue: boolean) => {
      const val = process.env[key];
      if (val === 'true') return true;
      if (val === 'false') return false;
      return defaultValue;
    },
    array: (key: string, defaultValue: string[]) => {
      const val = process.env[key];
      return val ? val.split(',') : defaultValue;
    },
  });
}
