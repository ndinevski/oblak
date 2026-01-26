import { useQuery } from '@tanstack/react-query';
import type { ActivityItem } from '@/components/dashboard';

/**
 * Dashboard summary data from API
 */
export interface DashboardSummary {
  functions: {
    total: number;
    active: number;
    trend?: number;
  };
  virtualMachines: {
    total: number;
    running: number;
    trend?: number;
  };
  storage: {
    totalBuckets: number;
    usedGB: number;
    maxGB: number;
    trend?: number;
  };
  quotas: {
    functions: { used: number; max: number };
    vms: { used: number; max: number };
    buckets: { used: number; max: number };
    storage: { used: number; max: number; unit: string };
    vcpus: { used: number; max: number };
    memory: { used: number; max: number; unit: string };
  };
}

/**
 * Fetch dashboard summary from API
 */
async function fetchDashboardSummary(): Promise<DashboardSummary> {
  // TODO: Replace with actual API call when backend endpoint is ready
  // const response = await apiClient.get('/api/dashboard/summary');
  // return response.data;
  
  // Mock data for now
  return {
    functions: { total: 0, active: 0 },
    virtualMachines: { total: 0, running: 0 },
    storage: { totalBuckets: 0, usedGB: 0, maxGB: 50 },
    quotas: {
      functions: { used: 0, max: 10 },
      vms: { used: 0, max: 5 },
      buckets: { used: 0, max: 10 },
      storage: { used: 0, max: 50, unit: 'GB' },
      vcpus: { used: 0, max: 16 },
      memory: { used: 0, max: 32, unit: 'GB' },
    },
  };
}

/**
 * Fetch recent activities from API
 */
async function fetchRecentActivities(): Promise<ActivityItem[]> {
  // TODO: Replace with actual API call when backend endpoint is ready
  // const response = await apiClient.get('/api/activity-logs', {
  //   params: { sort: 'createdAt:desc', pagination: { limit: 10 } }
  // });
  // return response.data.data;
  
  // Return empty array for now
  return [];
}

/**
 * Query keys for dashboard data
 */
export const dashboardKeys = {
  all: ['dashboard'] as const,
  summary: () => [...dashboardKeys.all, 'summary'] as const,
  activities: () => [...dashboardKeys.all, 'activities'] as const,
};

/**
 * Hook to fetch dashboard summary data
 */
export function useDashboardSummary() {
  return useQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: fetchDashboardSummary,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch recent activities
 */
export function useRecentActivities(limit = 5) {
  return useQuery({
    queryKey: [...dashboardKeys.activities(), limit],
    queryFn: fetchRecentActivities,
    staleTime: 1000 * 60, // 1 minute
  });
}

export default {
  useDashboardSummary,
  useRecentActivities,
};
