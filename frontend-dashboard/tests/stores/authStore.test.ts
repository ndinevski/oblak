/**
 * Auth store tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  useAuthStore,
  useUser,
  useToken,
  useIsAuthenticated,
  useAuthLoading,
  useAuthError,
  getStoredToken,
  isAuthenticated,
  getCurrentUser,
  logout,
  AUTH_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
} from '@/stores/authStore';
import type { User } from '@/types/user';

// Mock user for testing
const mockUser: User = {
  id: 1,
  documentId: 'doc123',
  username: 'testuser',
  email: 'test@example.com',
  provider: 'local',
  confirmed: true,
  blocked: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  organization: 'Test Org',
  quotas: {
    maxFunctions: 10,
    maxVMs: 5,
    maxBuckets: 10,
    maxStorageGB: 50,
  },
  lastLoginAt: null,
};

const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';

describe('Auth Store', () => {
  beforeEach(() => {
    // Reset store state
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
    // Clear localStorage
    localStorage.clear();
  });

  describe('Initial State', () => {
    it('should have null user initially', () => {
      const { result } = renderHook(() => useAuthStore());
      expect(result.current.user).toBeNull();
    });

    it('should have null token initially', () => {
      const { result } = renderHook(() => useAuthStore());
      expect(result.current.token).toBeNull();
    });

    it('should not be authenticated initially', () => {
      const { result } = renderHook(() => useAuthStore());
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should not be loading initially', () => {
      const { result } = renderHook(() => useAuthStore());
      expect(result.current.isLoading).toBe(false);
    });

    it('should have no error initially', () => {
      const { result } = renderHook(() => useAuthStore());
      expect(result.current.error).toBeNull();
    });
  });

  describe('setUser', () => {
    it('should set user and mark as authenticated', () => {
      const { result } = renderHook(() => useAuthStore());
      
      act(() => {
        result.current.setUser(mockUser);
      });
      
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('should clear user and mark as unauthenticated', () => {
      const { result } = renderHook(() => useAuthStore());
      
      act(() => {
        result.current.setUser(mockUser);
        result.current.setUser(null);
      });
      
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('setToken', () => {
    it('should set token and store in localStorage', () => {
      const { result } = renderHook(() => useAuthStore());
      
      act(() => {
        result.current.setToken(mockToken);
      });
      
      expect(result.current.token).toBe(mockToken);
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(mockToken);
    });

    it('should clear token from localStorage when null', () => {
      const { result } = renderHook(() => useAuthStore());
      
      act(() => {
        result.current.setToken(mockToken);
        result.current.setToken(null);
      });
      
      expect(result.current.token).toBeNull();
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    });
  });

  describe('setAuth', () => {
    it('should set user and token together', () => {
      const { result } = renderHook(() => useAuthStore());
      
      act(() => {
        result.current.setAuth(mockUser, mockToken);
      });
      
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.token).toBe(mockToken);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('should store token in localStorage', () => {
      const { result } = renderHook(() => useAuthStore());
      
      act(() => {
        result.current.setAuth(mockUser, mockToken);
      });
      
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(mockToken);
    });

    it('should clear any previous error', () => {
      const { result } = renderHook(() => useAuthStore());
      
      act(() => {
        result.current.setError('Previous error');
        result.current.setAuth(mockUser, mockToken);
      });
      
      expect(result.current.error).toBeNull();
    });
  });

  describe('setLoading', () => {
    it('should set loading state', () => {
      const { result } = renderHook(() => useAuthStore());
      
      act(() => {
        result.current.setLoading(true);
      });
      
      expect(result.current.isLoading).toBe(true);
      
      act(() => {
        result.current.setLoading(false);
      });
      
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('setError', () => {
    it('should set error and clear loading', () => {
      const { result } = renderHook(() => useAuthStore());
      
      act(() => {
        result.current.setLoading(true);
        result.current.setError('Test error');
      });
      
      expect(result.current.error).toBe('Test error');
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('logout', () => {
    it('should clear all auth state', () => {
      const { result } = renderHook(() => useAuthStore());
      
      act(() => {
        result.current.setAuth(mockUser, mockToken);
        result.current.logout();
      });
      
      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should clear token from localStorage', () => {
      const { result } = renderHook(() => useAuthStore());
      
      act(() => {
        result.current.setAuth(mockUser, mockToken);
        result.current.logout();
      });
      
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    });
  });

  describe('clearError', () => {
    it('should clear error', () => {
      const { result } = renderHook(() => useAuthStore());
      
      act(() => {
        result.current.setError('Test error');
        result.current.clearError();
      });
      
      expect(result.current.error).toBeNull();
    });
  });
});

describe('Selector Hooks', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: mockUser,
      token: mockToken,
      isAuthenticated: true,
      isLoading: false,
      error: 'Test error',
    });
  });

  it('useUser should return user', () => {
    const { result } = renderHook(() => useUser());
    expect(result.current).toEqual(mockUser);
  });

  it('useToken should return token', () => {
    const { result } = renderHook(() => useToken());
    expect(result.current).toBe(mockToken);
  });

  it('useIsAuthenticated should return auth status', () => {
    const { result } = renderHook(() => useIsAuthenticated());
    expect(result.current).toBe(true);
  });

  it('useAuthLoading should return loading status', () => {
    const { result } = renderHook(() => useAuthLoading());
    expect(result.current).toBe(false);
  });

  it('useAuthError should return error', () => {
    const { result } = renderHook(() => useAuthError());
    expect(result.current).toBe('Test error');
  });
});

describe('Helper Functions', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  describe('getStoredToken', () => {
    it('should return token from localStorage', () => {
      localStorage.setItem(TOKEN_STORAGE_KEY, mockToken);
      expect(getStoredToken()).toBe(mockToken);
    });

    it('should return null when no token', () => {
      expect(getStoredToken()).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when authenticated', () => {
      useAuthStore.setState({ isAuthenticated: true });
      expect(isAuthenticated()).toBe(true);
    });

    it('should return false when not authenticated', () => {
      expect(isAuthenticated()).toBe(false);
    });
  });

  describe('getCurrentUser', () => {
    it('should return user from store', () => {
      useAuthStore.setState({ user: mockUser });
      expect(getCurrentUser()).toEqual(mockUser);
    });

    it('should return null when no user', () => {
      expect(getCurrentUser()).toBeNull();
    });
  });

  describe('logout', () => {
    it('should clear auth state', () => {
      useAuthStore.setState({
        user: mockUser,
        token: mockToken,
        isAuthenticated: true,
      });
      localStorage.setItem(TOKEN_STORAGE_KEY, mockToken);
      
      logout();
      
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    });
  });
});

describe('Storage Keys', () => {
  it('should have correct auth storage key', () => {
    expect(AUTH_STORAGE_KEY).toBe('oblak-auth');
  });

  it('should have correct token storage key', () => {
    expect(TOKEN_STORAGE_KEY).toBe('oblak-token');
  });
});
