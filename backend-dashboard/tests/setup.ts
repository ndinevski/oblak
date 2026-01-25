/**
 * Vitest test setup file
 * Runs before all tests
 */

import { beforeAll, afterAll } from 'vitest';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_CLIENT = 'postgres';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ADMIN_JWT_SECRET = 'test-admin-jwt-secret';
process.env.API_TOKEN_SALT = 'test-api-token-salt';
process.env.APP_KEYS = 'test-key-1,test-key-2';

beforeAll(() => {
  // Global setup
});

afterAll(() => {
  // Global cleanup
});
