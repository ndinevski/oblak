/**
 * Authentication API service
 * Handles all auth-related API calls
 */

import { apiClient } from './client';
import type {
  User,
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  ChangePasswordRequest,
  UpdateProfileRequest,
} from '@/types/user';

/**
 * Auth API endpoints
 */
const AUTH_ENDPOINTS = {
  login: '/api/auth/local',
  register: '/api/auth/local/register',
  forgotPassword: '/api/auth/forgot-password',
  resetPassword: '/api/auth/reset-password',
  changePassword: '/api/auth/change-password',
  me: '/api/users/me',
} as const;

/**
 * Login with email/username and password
 */
export async function login(credentials: LoginRequest): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>(AUTH_ENDPOINTS.login, credentials);
  return response.data;
}

/**
 * Register a new user
 */
export async function register(data: RegisterRequest): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>(AUTH_ENDPOINTS.register, data);
  return response.data;
}

/**
 * Request password reset email
 */
export async function forgotPassword(data: ForgotPasswordRequest): Promise<{ ok: boolean }> {
  const response = await apiClient.post<{ ok: boolean }>(AUTH_ENDPOINTS.forgotPassword, data);
  return response.data;
}

/**
 * Reset password with code from email
 */
export async function resetPassword(data: ResetPasswordRequest): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>(AUTH_ENDPOINTS.resetPassword, data);
  return response.data;
}

/**
 * Change password for logged-in user
 */
export async function changePassword(data: ChangePasswordRequest): Promise<User> {
  const response = await apiClient.post<User>(AUTH_ENDPOINTS.changePassword, data);
  return response.data;
}

/**
 * Get current user profile
 */
export async function getMe(): Promise<User> {
  const response = await apiClient.get<User>(AUTH_ENDPOINTS.me, {
    params: {
      populate: ['role'],
    },
  });
  return response.data;
}

/**
 * Update current user profile
 */
export async function updateProfile(data: UpdateProfileRequest): Promise<User> {
  const response = await apiClient.put<User>(AUTH_ENDPOINTS.me, data);
  return response.data;
}

/**
 * Email confirmation (for accounts that require email verification)
 */
export async function confirmEmail(confirmationToken: string): Promise<AuthResponse> {
  const response = await apiClient.get<AuthResponse>('/api/auth/email-confirmation', {
    params: { confirmation: confirmationToken },
  });
  return response.data;
}

/**
 * Resend confirmation email
 */
export async function resendConfirmation(email: string): Promise<{ ok: boolean }> {
  const response = await apiClient.post<{ ok: boolean }>('/api/auth/send-email-confirmation', {
    email,
  });
  return response.data;
}
