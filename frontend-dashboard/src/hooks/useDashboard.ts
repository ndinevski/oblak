import { useQuery } from '@tanstack/react-query';
import type { ActivityItem } from '@/components/dashboard';
import { getQuota } from '@/lib/api/quota';
import { functionsApi } from '@/lib/api/functions';
import { listVMs } from '@/lib/api/vms';
import { listBuckets } from '@/lib/api/storage';
import { getActivityLogs } from '@/lib/api/activity';

/**
 * Dashboard summary data from API
 */
export interface DashboardSummary {
  functions: {
    total: number | null;
    active: number | null;
    trend?: number;
  };
  virtualMachines: {
    total: number | null;
    running: number | null;
    trend?: number;
  };
  storage: {
    totalBuckets: number | null;
    usedGB: number | null;
    maxGB: number | null;
    trend?: number;
  };
  quotas: {
    functions: { used: number | null; max: number | null };
    vms: { used: number | null; max: number | null };
    buckets: { used: number | null; max: number | null };
    storage: { used: number | null; max: number | null; unit: string };
    vcpus: { used: number | null; max: number | null };
    memory: { used: number | null; max: number | null; unit: string };
  };
}

/**
 * Fetch dashboard summary from API
 */
async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const [quotaResult, functionsResult, vmsResult, bucketsResult] = await Promise.allSettled([
    getQuota(),
    functionsApi.list({ page: 1, pageSize: 200 }),
    listVMs({ page: 1, pageSize: 200 }),
    listBuckets({ page: 1, pageSize: 200 }),
  ]);

  const quota = quotaResult.status === 'fulfilled' ? quotaResult.value : null;
  const functions = functionsResult.status === 'fulfilled' ? functionsResult.value : null;
  const vms = vmsResult.status === 'fulfilled' ? vmsResult.value : null;
  const buckets = bucketsResult.status === 'fulfilled' ? bucketsResult.value : null;

  const activeFunctions = functions
    ? functions.data.filter((fn) => fn.status === 'active').length
    : null;

  const runningVMs = vms
    ? vms.data.filter((vm) => vm.status === 'running').length
    : null;

  return {
    functions: {
      total: quota?.usage.functions.count ?? functions?.meta?.pagination?.total ?? null,
      active: activeFunctions,
    },
    virtualMachines: {
      total: quota?.usage.virtualMachines.count ?? vms?.meta?.pagination?.total ?? null,
      running: runningVMs,
    },
    storage: {
      totalBuckets: quota?.usage.storage.bucketCount ?? buckets?.meta?.pagination?.total ?? null,
      usedGB: quota ? Number((quota.usage.storage.totalBytes / (1024 * 1024 * 1024)).toFixed(2)) : null,
      maxGB: quota ? Number((quota.limits.storage.maxTotalBytes / (1024 * 1024 * 1024)).toFixed(2)) : null,
    },
    quotas: {
      functions: {
        used: quota?.usage.functions.count ?? null,
        max: quota?.limits.functions.maxCount ?? null,
      },
      vms: {
        used: quota?.usage.virtualMachines.count ?? null,
        max: quota?.limits.virtualMachines.maxCount ?? null,
      },
      buckets: {
        used: quota?.usage.storage.bucketCount ?? null,
        max: quota?.limits.storage.maxBuckets ?? null,
      },
      storage: {
        used: quota ? Number((quota.usage.storage.totalBytes / (1024 * 1024 * 1024)).toFixed(2)) : null,
        max: quota ? Number((quota.limits.storage.maxTotalBytes / (1024 * 1024 * 1024)).toFixed(2)) : null,
        unit: 'GB',
      },
      vcpus: {
        used: quota?.usage.virtualMachines.totalCores ?? null,
        max: quota?.limits.virtualMachines.maxCores ?? null,
      },
      memory: {
        used: quota ? Number((quota.usage.virtualMachines.totalMemoryMB / 1024).toFixed(2)) : null,
        max: quota ? Number((quota.limits.virtualMachines.maxMemoryMB / 1024).toFixed(2)) : null,
        unit: 'GB',
      },
    },
  };
}

/**
 * Fetch recent activities from API
 */
async function fetchRecentActivities(): Promise<ActivityItem[]> {
  try {
    const response = await getActivityLogs({ page: 1, pageSize: 10 });

    return response.data.map((item) => {
      const action = item.action;

      const type: ActivityItem['type'] =
        action === 'function.create' ? 'function_created' :
        action === 'function.delete' ? 'function_deleted' :
        action === 'function.invoke' ? 'function_invoked' :
        action === 'vm.create' ? 'vm_created' :
        action === 'vm.delete' ? 'vm_deleted' :
        action === 'vm.start' ? 'vm_started' :
        action === 'vm.stop' ? 'vm_stopped' :
        action === 'bucket.create' ? 'bucket_created' :
        action === 'bucket.delete' ? 'bucket_deleted' :
        action === 'user.login' ? 'login' :
        'other';

      return {
        id: String(item.id),
        type,
        message: action.replace('.', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        timestamp: item.createdAt,
        resourceName: item.resourceName,
      };
    });
  } catch {
    return [];
  }
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
