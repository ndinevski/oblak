/**
 * useToast Hook
 * Convenience hook for showing toast notifications
 */

import { useToastStore, ToastType } from '@/stores/toastStore';

interface ToastOptions {
  title: string;
  description?: string;
  duration?: number;
  variant?: ToastType | 'default' | 'destructive';
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function useToast() {
  const { addToast, removeToast, toasts } = useToastStore();

  const toast = (options: ToastOptions) => {
    // Map variant to type
    let type: ToastType = 'info';
    if (options.variant === 'destructive' || options.variant === 'error') {
      type = 'error';
    } else if (options.variant === 'success') {
      type = 'success';
    } else if (options.variant === 'warning') {
      type = 'warning';
    }

    return addToast({
      type,
      title: options.title,
      description: options.description,
      duration: options.duration,
      action: options.action,
    });
  };

  return {
    toast,
    dismiss: removeToast,
    toasts,
  };
}

export type { ToastOptions };
