/**
 * User types for Oblak Dashboard
 * Extended user model with custom attributes
 */

/**
 * Resource quotas for a user
 */
export interface UserQuotas {
  /** Maximum number of functions user can create */
  maxFunctions: number;
  /** Maximum number of VMs user can create */
  maxVMs: number;
  /** Maximum number of storage buckets user can create */
  maxBuckets: number;
  /** Maximum total storage in GB */
  maxStorageGB: number;
}

/**
 * Default quotas for new users
 */
export const DEFAULT_USER_QUOTAS: UserQuotas = {
  maxFunctions: 10,
  maxVMs: 5,
  maxBuckets: 10,
  maxStorageGB: 50,
};

/**
 * User roles in the system
 */
export type UserRole = 'authenticated' | 'admin' | 'public';

/**
 * User model as returned by Strapi
 */
export interface User {
  id: number;
  documentId: string;
  username: string;
  email: string;
  provider: string;
  confirmed: boolean;
  blocked: boolean;
  createdAt: string;
  updatedAt: string;
  
  // Custom fields
  organization: string;
  quotas: UserQuotas;
  lastLoginAt: string | null;
  
  // Role relation
  role?: {
    id: number;
    name: string;
    type: UserRole;
  };
}

/**
 * Minimal user info for display
 */
export interface UserInfo {
  id: number;
  username: string;
  email: string;
  organization: string;
}

/**
 * User resource usage
 */
export interface UserResourceUsage {
  functionsCount: number;
  vmsCount: number;
  bucketsCount: number;
  storageUsedGB: number;
}

/**
 * User with resource usage info
 */
export interface UserWithUsage extends User {
  usage: UserResourceUsage;
}

/**
 * Login request payload
 */
export interface LoginRequest {
  identifier: string; // username or email
  password: string;
}

/**
 * Register request payload
 */
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  organization?: string;
}

/**
 * Auth response from Strapi
 */
export interface AuthResponse {
  jwt: string;
  user: User;
}

/**
 * Password reset request
 */
export interface ForgotPasswordRequest {
  email: string;
}

/**
 * Password reset confirmation
 */
export interface ResetPasswordRequest {
  code: string;
  password: string;
  passwordConfirmation: string;
}

/**
 * Change password request
 */
export interface ChangePasswordRequest {
  currentPassword: string;
  password: string;
  passwordConfirmation: string;
}

/**
 * Update user profile request
 */
export interface UpdateProfileRequest {
  username?: string;
  email?: string;
  organization?: string;
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  if (password.length > 128) {
    errors.push('Password must be at most 128 characters long');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate username
 */
export function validateUsername(username: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (username.length < 3) {
    errors.push('Username must be at least 3 characters long');
  }
  if (username.length > 30) {
    errors.push('Username must be at most 30 characters long');
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errors.push('Username can only contain letters, numbers, and underscores');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if user has exceeded a quota
 */
export function isQuotaExceeded(
  quotas: UserQuotas,
  usage: UserResourceUsage,
  resource: keyof UserQuotas
): boolean {
  const quotaMap: Record<keyof UserQuotas, keyof UserResourceUsage> = {
    maxFunctions: 'functionsCount',
    maxVMs: 'vmsCount',
    maxBuckets: 'bucketsCount',
    maxStorageGB: 'storageUsedGB',
  };
  
  const usageKey = quotaMap[resource];
  return usage[usageKey] >= quotas[resource];
}

/**
 * Get remaining quota for a resource
 */
export function getRemainingQuota(
  quotas: UserQuotas,
  usage: UserResourceUsage,
  resource: keyof UserQuotas
): number {
  const quotaMap: Record<keyof UserQuotas, keyof UserResourceUsage> = {
    maxFunctions: 'functionsCount',
    maxVMs: 'vmsCount',
    maxBuckets: 'bucketsCount',
    maxStorageGB: 'storageUsedGB',
  };
  
  const usageKey = quotaMap[resource];
  return Math.max(0, quotas[resource] - usage[usageKey]);
}
