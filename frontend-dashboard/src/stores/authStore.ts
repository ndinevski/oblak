/**
 * Authentication store using Zustand
 * Manages user authentication state with persistence
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@/types/user';

/**
 * Auth state interface
 */
export interface AuthState {
  // State
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setAuth: (user: User, token: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
  clearError: () => void;
}

/**
 * Storage key for persisted auth state
 */
export const AUTH_STORAGE_KEY = 'oblak-auth';

/**
 * Token storage key (separate for API client)
 */
export const TOKEN_STORAGE_KEY = 'oblak-token';

/**
 * Auth store with persistence
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // Initial state
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      
      // Actions
      setUser: (user) => set({ 
        user, 
        isAuthenticated: user !== null 
      }),
      
      setToken: (token) => {
        // Also store token in localStorage for API client access
        if (token) {
          localStorage.setItem(TOKEN_STORAGE_KEY, token);
        } else {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
        }
        set({ token });
      },
      
      setAuth: (user, token) => {
        // Store token separately for API client
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
        set({ 
          user, 
          token, 
          isAuthenticated: true, 
          error: null 
        });
      },
      
      setLoading: (isLoading) => set({ isLoading }),
      
      setError: (error) => set({ error, isLoading: false }),
      
      logout: () => {
        // Clear token from localStorage
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        set({ 
          user: null, 
          token: null, 
          isAuthenticated: false, 
          error: null 
        });
      },
      
      clearError: () => set({ error: null }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Only persist these fields
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
      // Rehydrate token on load
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          localStorage.setItem(TOKEN_STORAGE_KEY, state.token);
        }
      },
    }
  )
);

/**
 * Get current token (for API client use outside React)
 */
export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

/**
 * Check if user is authenticated (for route guards)
 */
export function isAuthenticated(): boolean {
  return useAuthStore.getState().isAuthenticated;
}

/**
 * Get current user (for use outside React)
 */
export function getCurrentUser(): User | null {
  return useAuthStore.getState().user;
}

/**
 * Logout function (for use outside React)
 */
export function logout(): void {
  useAuthStore.getState().logout();
}

/**
 * Selector hooks for optimized re-renders
 */
export const useUser = () => useAuthStore((state) => state.user);
export const useToken = () => useAuthStore((state) => state.token);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useAuthLoading = () => useAuthStore((state) => state.isLoading);
export const useAuthError = () => useAuthStore((state) => state.error);
