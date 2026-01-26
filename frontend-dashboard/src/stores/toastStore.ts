/**
 * Toast Store
 * Manages toast notifications
 */

import { create } from 'zustand';

// =============================================================================
// Types
// =============================================================================

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

// =============================================================================
// Helper Functions
// =============================================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// =============================================================================
// Store
// =============================================================================

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const id = generateId();
    const duration = toast.duration ?? 5000;
    
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id, duration }],
    }));

    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, duration);
    }

    return id;
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearToasts: () => {
    set({ toasts: [] });
  },
}));

// =============================================================================
// Convenience Functions
// =============================================================================

export const toast = {
  success: (title: string, description?: string, options?: Partial<Toast>) => {
    return useToastStore.getState().addToast({
      type: 'success',
      title,
      description,
      ...options,
    });
  },

  error: (title: string, description?: string, options?: Partial<Toast>) => {
    return useToastStore.getState().addToast({
      type: 'error',
      title,
      description,
      duration: 8000, // Errors stay longer
      ...options,
    });
  },

  warning: (title: string, description?: string, options?: Partial<Toast>) => {
    return useToastStore.getState().addToast({
      type: 'warning',
      title,
      description,
      ...options,
    });
  },

  info: (title: string, description?: string, options?: Partial<Toast>) => {
    return useToastStore.getState().addToast({
      type: 'info',
      title,
      description,
      ...options,
    });
  },

  dismiss: (id: string) => {
    useToastStore.getState().removeToast(id);
  },

  dismissAll: () => {
    useToastStore.getState().clearToasts();
  },
};
