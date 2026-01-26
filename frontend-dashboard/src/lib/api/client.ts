/**
 * API Client configuration
 * Axios instance with JWT interceptors and error handling
 */

import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { getStoredToken, logout } from '@/stores/authStore';

/**
 * API configuration
 */
export const API_CONFIG = {
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:1337',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
};

/**
 * API error response structure
 */
export interface ApiError {
  status: number;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Strapi error response structure
 */
interface StrapiErrorResponse {
  error?: {
    status?: number;
    name?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
  message?: string;
}

/**
 * Create the API client instance
 */
function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: API_CONFIG.baseURL,
    timeout: API_CONFIG.timeout,
    headers: API_CONFIG.headers,
  });

  // Request interceptor - add JWT token
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const token = getStoredToken();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error: AxiosError) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor - handle errors
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError<StrapiErrorResponse>) => {
      const apiError = parseApiError(error);
      
      // Handle 401 Unauthorized - token expired or invalid
      if (apiError.status === 401) {
        logout();
        // Optionally redirect to login
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
          window.location.href = '/auth/login';
        }
      }
      
      return Promise.reject(apiError);
    }
  );

  return client;
}

/**
 * Parse Axios error into ApiError
 */
function parseApiError(error: AxiosError<StrapiErrorResponse>): ApiError {
  if (error.response) {
    // Server responded with error
    const { status, data } = error.response;
    const message = 
      data?.error?.message || 
      data?.message || 
      getDefaultErrorMessage(status);
    
    return {
      status,
      message,
      details: data?.error?.details,
    };
  } else if (error.request) {
    // Request made but no response
    return {
      status: 0,
      message: 'Network error. Please check your connection.',
    };
  } else {
    // Request setup error
    return {
      status: 0,
      message: error.message || 'An unexpected error occurred.',
    };
  }
}

/**
 * Get default error message for status code
 */
function getDefaultErrorMessage(status: number): string {
  const messages: Record<number, string> = {
    400: 'Invalid request. Please check your input.',
    401: 'Your session has expired. Please log in again.',
    403: 'You do not have permission to perform this action.',
    404: 'The requested resource was not found.',
    409: 'A conflict occurred. The resource may already exist.',
    422: 'Validation failed. Please check your input.',
    429: 'Too many requests. Please try again later.',
    500: 'Server error. Please try again later.',
    502: 'Service temporarily unavailable.',
    503: 'Service temporarily unavailable.',
  };
  
  return messages[status] || 'An unexpected error occurred.';
}

/**
 * Main API client instance
 */
export const apiClient = createApiClient();

/**
 * Check if error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    'message' in error
  );
}

/**
 * Get error message from any error
 */
export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred.';
}
