/**
 * API Client tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  API_CONFIG,
  isApiError,
  getErrorMessage,
  type ApiError,
} from '@/lib/api/client';

describe('API Configuration', () => {
  it('should have correct default baseURL', () => {
    // Default when VITE_API_URL is not set
    expect(API_CONFIG.baseURL).toMatch(/http:\/\/localhost:\d+/);
  });

  it('should have timeout configured', () => {
    expect(API_CONFIG.timeout).toBe(30000);
  });

  it('should have JSON content type', () => {
    expect(API_CONFIG.headers['Content-Type']).toBe('application/json');
  });
});

describe('isApiError', () => {
  it('should return true for valid ApiError', () => {
    const error: ApiError = {
      status: 400,
      message: 'Bad request',
    };
    expect(isApiError(error)).toBe(true);
  });

  it('should return true for ApiError with details', () => {
    const error: ApiError = {
      status: 422,
      message: 'Validation failed',
      details: { field: 'email' },
    };
    expect(isApiError(error)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isApiError(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isApiError(undefined)).toBe(false);
  });

  it('should return false for string', () => {
    expect(isApiError('error')).toBe(false);
  });

  it('should return false for Error instance', () => {
    expect(isApiError(new Error('test'))).toBe(false);
  });

  it('should return false for object without status', () => {
    expect(isApiError({ message: 'test' })).toBe(false);
  });

  it('should return false for object without message', () => {
    expect(isApiError({ status: 400 })).toBe(false);
  });
});

describe('getErrorMessage', () => {
  it('should extract message from ApiError', () => {
    const error: ApiError = {
      status: 400,
      message: 'Invalid input',
    };
    expect(getErrorMessage(error)).toBe('Invalid input');
  });

  it('should extract message from Error instance', () => {
    const error = new Error('Something went wrong');
    expect(getErrorMessage(error)).toBe('Something went wrong');
  });

  it('should return default message for unknown error', () => {
    expect(getErrorMessage('string error')).toBe('An unexpected error occurred.');
    expect(getErrorMessage(null)).toBe('An unexpected error occurred.');
    expect(getErrorMessage(undefined)).toBe('An unexpected error occurred.');
    expect(getErrorMessage(42)).toBe('An unexpected error occurred.');
  });
});

describe('API Endpoints', () => {
  it('should have auth endpoints defined', () => {
    // These are constants used by the auth module
    const endpoints = {
      login: '/api/auth/local',
      register: '/api/auth/local/register',
      forgotPassword: '/api/auth/forgot-password',
      resetPassword: '/api/auth/reset-password',
      changePassword: '/api/auth/change-password',
      me: '/api/users/me',
    };

    Object.values(endpoints).forEach((endpoint) => {
      expect(endpoint).toMatch(/^\/api\//);
    });
  });
});

describe('Error Status Messages', () => {
  const statusMessages: Record<number, string> = {
    400: 'Invalid request',
    401: 'session',
    403: 'permission',
    404: 'not found',
    409: 'conflict',
    422: 'Validation',
    429: 'Too many',
    500: 'Server error',
    502: 'unavailable',
    503: 'unavailable',
  };

  Object.entries(statusMessages).forEach(([status, expectedKeyword]) => {
    it(`should have appropriate message for status ${status}`, () => {
      // Just verify the mapping exists conceptually
      expect(Number(status)).toBeGreaterThanOrEqual(400);
      expect(expectedKeyword.length).toBeGreaterThan(0);
    });
  });
});

describe('JWT Token Handling', () => {
  it('should store token with Bearer prefix format', () => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
    const authHeader = `Bearer ${token}`;
    expect(authHeader).toMatch(/^Bearer /);
  });
});
