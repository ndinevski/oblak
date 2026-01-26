/**
 * Quota Hooks
 * React Query hooks for quota operations
 */

import { useQuery } from '@tanstack/react-query';
import {
  getQuota,
  getQuotaUsage,
  getQuotaLimits,
  QuotaInfo,
  QuotaUsage,
  QuotaLimits,
} from '@/lib/api/quota';

// =============================================================================
// Query Keys
// =============================================================================

export const quotaKeys = {
  all: ['quota'] as const,
  info: () => [...quotaKeys.all, 'info'] as const,
  usage: () => [...quotaKeys.all, 'usage'] as const,
  limits: () => [...quotaKeys.all, 'limits'] as const,
};

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Get full quota information
 */
export function useQuota() {
  return useQuery<QuotaInfo>({
    queryKey: quotaKeys.info(),
    queryFn: getQuota,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Get current resource usage
 */
export function useQuotaUsage() {
  return useQuery<QuotaUsage>({
    queryKey: quotaKeys.usage(),
    queryFn: getQuotaUsage,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Get quota limits
 */
export function useQuotaLimits() {
  return useQuery<QuotaLimits>({
    queryKey: quotaKeys.limits(),
    queryFn: getQuotaLimits,
    staleTime: 5 * 60 * 1000, // 5 minutes (limits rarely change)
  });
}
