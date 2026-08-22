/**
 * Activity Hooks
 * React Query hooks for activity log operations
 */

import { useQuery } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import {
  getActivityLogs,
  getActivitySummary,
  ActivityFilters,
  ActivityLog,
  ActivitySummary,
  PaginatedResponse,
} from '@/lib/api/activity';

// =============================================================================
// Query Keys
// =============================================================================

export const activityKeys = {
  all: ['activity'] as const,
  lists: () => [...activityKeys.all, 'list'] as const,
  list: (filters: ActivityFilters) => [...activityKeys.lists(), filters] as const,
  details: () => [...activityKeys.all, 'detail'] as const,
  detail: (id: number) => [...activityKeys.details(), id] as const,
  summary: (days: number) => [...activityKeys.all, 'summary', days] as const,
};

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Get activity logs with filters
 */
export function useActivityLogs(filters: ActivityFilters = {}) {
  return useQuery<PaginatedResponse<ActivityLog>>({
    queryKey: activityKeys.list(filters),
    queryFn: () => getActivityLogs(filters),
  });
}


/**
 * Get activity summary
 */
export function useActivitySummary(days = 30) {
  return useQuery<ActivitySummary>({
    queryKey: activityKeys.summary(days),
    queryFn: () => getActivitySummary(days),
  });
}

// =============================================================================
// Filter State Hook
// =============================================================================

export interface UseActivityFiltersOptions {
  defaultPageSize?: number;
}

export function useActivityFilters(options: UseActivityFiltersOptions = {}) {
  const { defaultPageSize = 20 } = options;
  
  const [filters, setFilters] = useState<ActivityFilters>({
    page: 1,
    pageSize: defaultPageSize,
  });

  const setResourceType = useCallback((resourceType: string | undefined) => {
    setFilters(prev => ({ ...prev, resourceType, page: 1 }));
  }, []);

  const setAction = useCallback((action: string | undefined) => {
    setFilters(prev => ({ ...prev, action, page: 1 }));
  }, []);

  const setStatus = useCallback((status: string | undefined) => {
    setFilters(prev => ({ ...prev, status, page: 1 }));
  }, []);

  const setDateRange = useCallback((startDate: string | undefined, endDate: string | undefined) => {
    setFilters(prev => ({ ...prev, startDate, endDate, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setFilters(prev => ({ ...prev, page }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setFilters(prev => ({ ...prev, pageSize, page: 1 }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ page: 1, pageSize: defaultPageSize });
  }, [defaultPageSize]);

  const hasActiveFilters = !!(
    filters.resourceType ||
    filters.action ||
    filters.status ||
    filters.startDate ||
    filters.endDate
  );

  return {
    filters,
    setResourceType,
    setAction,
    setStatus,
    setDateRange,
    setPage,
    setPageSize,
    clearFilters,
    hasActiveFilters,
  };
}
