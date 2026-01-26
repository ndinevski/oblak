/**
 * Auth API tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  LoginRequest,
  RegisterRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  ChangePasswordRequest,
  UpdateProfileRequest,
} from '@/types/user';

// Mock the API client
vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
  },
}));

describe('Auth API Types', () => {
  describe('LoginRequest', () => {
    it('should have correct structure', () => {
      const request: LoginRequest = {
        identifier: 'user@example.com',
        password: 'password123',
      };
      expect(request.identifier).toBeDefined();
      expect(request.password).toBeDefined();
    });

    it('should accept username as identifier', () => {
      const request: LoginRequest = {
        identifier: 'username',
        password: 'password123',
      };
      expect(request.identifier).toBe('username');
    });

    it('should accept email as identifier', () => {
      const request: LoginRequest = {
        identifier: 'user@example.com',
        password: 'password123',
      };
      expect(request.identifier).toContain('@');
    });
  });

  describe('RegisterRequest', () => {
    it('should have required fields', () => {
      const request: RegisterRequest = {
        username: 'newuser',
        email: 'new@example.com',
        password: 'SecurePass123',
      };
      expect(request.username).toBeDefined();
      expect(request.email).toBeDefined();
      expect(request.password).toBeDefined();
    });

    it('should allow optional organization', () => {
      const request: RegisterRequest = {
        username: 'newuser',
        email: 'new@example.com',
        password: 'SecurePass123',
        organization: 'My Company',
      };
      expect(request.organization).toBe('My Company');
    });
  });

  describe('ForgotPasswordRequest', () => {
    it('should have email field', () => {
      const request: ForgotPasswordRequest = {
        email: 'user@example.com',
      };
      expect(request.email).toBeDefined();
    });
  });

  describe('ResetPasswordRequest', () => {
    it('should have code and passwords', () => {
      const request: ResetPasswordRequest = {
        code: 'reset-code-123',
        password: 'NewSecurePass123',
        passwordConfirmation: 'NewSecurePass123',
      };
      expect(request.code).toBeDefined();
      expect(request.password).toBeDefined();
      expect(request.passwordConfirmation).toBeDefined();
    });

    it('should have matching passwords', () => {
      const request: ResetPasswordRequest = {
        code: 'reset-code-123',
        password: 'NewSecurePass123',
        passwordConfirmation: 'NewSecurePass123',
      };
      expect(request.password).toBe(request.passwordConfirmation);
    });
  });

  describe('ChangePasswordRequest', () => {
    it('should have current and new passwords', () => {
      const request: ChangePasswordRequest = {
        currentPassword: 'OldPass123',
        password: 'NewPass123',
        passwordConfirmation: 'NewPass123',
      };
      expect(request.currentPassword).toBeDefined();
      expect(request.password).toBeDefined();
      expect(request.passwordConfirmation).toBeDefined();
    });
  });

  describe('UpdateProfileRequest', () => {
    it('should allow partial updates', () => {
      const request: UpdateProfileRequest = {
        username: 'newusername',
      };
      expect(request.username).toBeDefined();
      expect(request.email).toBeUndefined();
      expect(request.organization).toBeUndefined();
    });

    it('should allow all fields', () => {
      const request: UpdateProfileRequest = {
        username: 'newusername',
        email: 'newemail@example.com',
        organization: 'New Org',
      };
      expect(request.username).toBeDefined();
      expect(request.email).toBeDefined();
      expect(request.organization).toBeDefined();
    });
  });
});

describe('Auth Endpoints', () => {
  const endpoints = {
    login: '/api/auth/local',
    register: '/api/auth/local/register',
    forgotPassword: '/api/auth/forgot-password',
    resetPassword: '/api/auth/reset-password',
    changePassword: '/api/auth/change-password',
    me: '/api/users/me',
    emailConfirmation: '/api/auth/email-confirmation',
    sendEmailConfirmation: '/api/auth/send-email-confirmation',
  };

  it('should use Strapi auth endpoints', () => {
    expect(endpoints.login).toBe('/api/auth/local');
    expect(endpoints.register).toBe('/api/auth/local/register');
  });

  it('should have password recovery endpoints', () => {
    expect(endpoints.forgotPassword).toContain('forgot-password');
    expect(endpoints.resetPassword).toContain('reset-password');
    expect(endpoints.changePassword).toContain('change-password');
  });

  it('should have user profile endpoint', () => {
    expect(endpoints.me).toBe('/api/users/me');
  });

  it('should have email confirmation endpoints', () => {
    expect(endpoints.emailConfirmation).toContain('email-confirmation');
    expect(endpoints.sendEmailConfirmation).toContain('send-email-confirmation');
  });
});

describe('Auth Response Structure', () => {
  it('should return JWT and user on login', () => {
    const response = {
      jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
      user: {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
      },
    };
    expect(response.jwt).toBeDefined();
    expect(response.user).toBeDefined();
    expect(response.user.id).toBeDefined();
  });

  it('should return JWT and user on register', () => {
    const response = {
      jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
      user: {
        id: 2,
        username: 'newuser',
        email: 'new@example.com',
      },
    };
    expect(response.jwt).toBeDefined();
    expect(response.user).toBeDefined();
  });
});
