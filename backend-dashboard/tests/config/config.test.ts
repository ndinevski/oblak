/**
 * Configuration Tests
 * 
 * Tests for Strapi configuration files
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';

describe('Database Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset modules for fresh imports
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should default to postgres client', async () => {
    const env = (key: string, defaultValue?: any) => process.env[key] || defaultValue;
    const envWithInt = Object.assign(env, {
      int: (key: string, defaultValue: number) => parseInt(process.env[key] || '', 10) || defaultValue,
      bool: (key: string, defaultValue: boolean) => process.env[key] === 'true' || defaultValue,
      array: (key: string, defaultValue: string[]) => process.env[key]?.split(',') || defaultValue,
    });

    const databaseConfig = (await import('../../config/database')).default;
    const config = databaseConfig({ env: envWithInt });

    expect(config.connection.client).toBe('postgres');
  });

  it('should use environment variables for postgres connection', async () => {
    process.env.DATABASE_HOST = 'test-host';
    process.env.DATABASE_PORT = '5433';
    process.env.DATABASE_NAME = 'test-db';
    process.env.DATABASE_USERNAME = 'test-user';
    process.env.DATABASE_PASSWORD = 'test-pass';

    const env = (key: string, defaultValue?: any) => process.env[key] || defaultValue;
    const envWithInt = Object.assign(env, {
      int: (key: string, defaultValue: number) => parseInt(process.env[key] || '', 10) || defaultValue,
      bool: (key: string, defaultValue: boolean) => process.env[key] === 'true' || defaultValue,
      array: (key: string, defaultValue: string[]) => process.env[key]?.split(',') || defaultValue,
    });

    const databaseConfig = (await import('../../config/database')).default;
    const config = databaseConfig({ env: envWithInt });

    expect(config.connection.connection.host).toBe('test-host');
    expect(config.connection.connection.port).toBe(5433);
    expect(config.connection.connection.database).toBe('test-db');
    expect(config.connection.connection.user).toBe('test-user');
    expect(config.connection.connection.password).toBe('test-pass');
  });
});

describe('Server Configuration', () => {
  it('should have correct default values', async () => {
    // Clear APP_KEYS to test defaults
    const savedAppKeys = process.env.APP_KEYS;
    delete process.env.APP_KEYS;
    
    const env = (key: string, defaultValue?: any) => process.env[key] || defaultValue;
    const envWithInt = Object.assign(env, {
      int: (key: string, defaultValue: number) => parseInt(process.env[key] || '', 10) || defaultValue,
      bool: (key: string, defaultValue: boolean) => process.env[key] === 'true' || defaultValue,
      array: (key: string, defaultValue: string[]) => process.env[key]?.split(',') || defaultValue,
    });

    const serverConfig = (await import('../../config/server')).default;
    const config = serverConfig({ env: envWithInt });

    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(1337);
    expect(config.app.keys).toEqual(['key1', 'key2']);
    
    // Restore
    if (savedAppKeys) process.env.APP_KEYS = savedAppKeys;
  });
});

describe('Middlewares Configuration', () => {
  it('should include CORS middleware with correct origins', async () => {
    const env = (key: string, defaultValue?: any) => process.env[key] || defaultValue;
    const envWithInt = Object.assign(env, {
      int: (key: string, defaultValue: number) => parseInt(process.env[key] || '', 10) || defaultValue,
      bool: (key: string, defaultValue: boolean) => process.env[key] === 'true' || defaultValue,
      array: (key: string, defaultValue: string[]) => process.env[key]?.split(',') || defaultValue,
    });

    const middlewaresConfig = (await import('../../config/middlewares')).default;
    const middlewares = middlewaresConfig({ env: envWithInt });

    expect(Array.isArray(middlewares)).toBe(true);
    
    const corsMiddleware = middlewares.find(
      (m: any) => typeof m === 'object' && m.name === 'strapi::cors'
    );
    
    expect(corsMiddleware).toBeDefined();
    expect(corsMiddleware.config.enabled).toBe(true);
    expect(corsMiddleware.config.origin).toContain('http://localhost:3000');
    expect(corsMiddleware.config.origin).toContain('http://localhost:5173');
  });
});
