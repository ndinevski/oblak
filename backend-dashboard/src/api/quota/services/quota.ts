/**
 * Quota Service
 * Unified quota management across all resources
 */

import { Strapi } from '@strapi/strapi';

// =============================================================================
// Types
// =============================================================================

interface QuotaLimits {
  functions: {
    maxCount: number;
    maxInvocationsPerDay: number;
  };
  virtualMachines: {
    maxCount: number;
    maxCores: number;
    maxMemoryMB: number;
    maxDiskGB: number;
  };
  storage: {
    maxBuckets: number;
    maxTotalBytes: number;
  };
}

interface QuotaUsage {
  functions: {
    count: number;
    invocationsToday: number;
  };
  virtualMachines: {
    count: number;
    totalCores: number;
    totalMemoryMB: number;
    totalDiskGB: number;
  };
  storage: {
    bucketCount: number;
    totalBytes: number;
  };
}

interface QuotaInfo {
  limits: QuotaLimits;
  usage: QuotaUsage;
  remaining: {
    functions: { count: number; invocationsToday: number };
    virtualMachines: { count: number; cores: number; memoryMB: number; diskGB: number };
    storage: { buckets: number; bytes: number };
  };
  percentages: {
    functions: { count: number; invocations: number };
    virtualMachines: { count: number; cores: number; memory: number; disk: number };
    storage: { buckets: number; bytes: number };
  };
}

// =============================================================================
// Default Limits
// =============================================================================

const DEFAULT_LIMITS: QuotaLimits = {
  functions: {
    maxCount: 20,
    maxInvocationsPerDay: 10000,
  },
  virtualMachines: {
    maxCount: 5,
    maxCores: 32,
    maxMemoryMB: 32768, // 32GB
    maxDiskGB: 500,
  },
  storage: {
    maxBuckets: 10,
    maxTotalBytes: 10 * 1024 * 1024 * 1024, // 10GB
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

function calculatePercentage(used: number, max: number): number {
  if (max === 0) return 0;
  return Math.min(Math.round((used / max) * 100), 100);
}

// =============================================================================
// Service Factory
// =============================================================================

export default ({ strapi }: { strapi: Strapi }) => ({
  // ===========================================================================
  // Get Quota Limits
  // ===========================================================================

  getLimits(userId: number): QuotaLimits {
    // In the future, this could be customized per user or plan
    return DEFAULT_LIMITS;
  },

  // ===========================================================================
  // Get Current Usage
  // ===========================================================================

  async getUsage(userId: number): Promise<QuotaUsage> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get function count
    const functionCount = await strapi.db.query('api::function.function').count({
      where: { owner: userId },
    });

    // Get VM stats
    const vms = await strapi.db.query('api::virtual-machine.virtual-machine').findMany({
      where: { owner: userId },
      select: ['cores', 'memoryMB', 'diskGB'],
    });

    const vmCount = vms.length;
    const totalCores = vms.reduce((sum, vm) => sum + (vm.cores || 0), 0);
    const totalMemoryMB = vms.reduce((sum, vm) => sum + (vm.memoryMB || 0), 0);
    const totalDiskGB = vms.reduce((sum, vm) => sum + (vm.diskGB || 0), 0);

    // Get bucket stats
    const buckets = await strapi.db.query('api::bucket.bucket').findMany({
      where: { owner: userId },
      select: ['totalSize'],
    });

    const bucketCount = buckets.length;
    const totalBytes = buckets.reduce((sum, b) => sum + parseInt(b.totalSize || '0', 10), 0);

    // Get today's function invocations (from activity log)
    const invocationsToday = await strapi.db.query('api::activity-log.activity-log').count({
      where: {
        user: userId,
        action: 'function.invoke',
        createdAt: { $gte: today },
      },
    });

    return {
      functions: {
        count: functionCount,
        invocationsToday,
      },
      virtualMachines: {
        count: vmCount,
        totalCores,
        totalMemoryMB,
        totalDiskGB,
      },
      storage: {
        bucketCount,
        totalBytes,
      },
    };
  },

  // ===========================================================================
  // Get Full Quota Info
  // ===========================================================================

  async getQuotaInfo(userId: number): Promise<QuotaInfo> {
    const limits = this.getLimits(userId);
    const usage = await this.getUsage(userId);

    const remaining = {
      functions: {
        count: Math.max(0, limits.functions.maxCount - usage.functions.count),
        invocationsToday: Math.max(0, limits.functions.maxInvocationsPerDay - usage.functions.invocationsToday),
      },
      virtualMachines: {
        count: Math.max(0, limits.virtualMachines.maxCount - usage.virtualMachines.count),
        cores: Math.max(0, limits.virtualMachines.maxCores - usage.virtualMachines.totalCores),
        memoryMB: Math.max(0, limits.virtualMachines.maxMemoryMB - usage.virtualMachines.totalMemoryMB),
        diskGB: Math.max(0, limits.virtualMachines.maxDiskGB - usage.virtualMachines.totalDiskGB),
      },
      storage: {
        buckets: Math.max(0, limits.storage.maxBuckets - usage.storage.bucketCount),
        bytes: Math.max(0, limits.storage.maxTotalBytes - usage.storage.totalBytes),
      },
    };

    const percentages = {
      functions: {
        count: calculatePercentage(usage.functions.count, limits.functions.maxCount),
        invocations: calculatePercentage(usage.functions.invocationsToday, limits.functions.maxInvocationsPerDay),
      },
      virtualMachines: {
        count: calculatePercentage(usage.virtualMachines.count, limits.virtualMachines.maxCount),
        cores: calculatePercentage(usage.virtualMachines.totalCores, limits.virtualMachines.maxCores),
        memory: calculatePercentage(usage.virtualMachines.totalMemoryMB, limits.virtualMachines.maxMemoryMB),
        disk: calculatePercentage(usage.virtualMachines.totalDiskGB, limits.virtualMachines.maxDiskGB),
      },
      storage: {
        buckets: calculatePercentage(usage.storage.bucketCount, limits.storage.maxBuckets),
        bytes: calculatePercentage(usage.storage.totalBytes, limits.storage.maxTotalBytes),
      },
    };

    return { limits, usage, remaining, percentages };
  },

  // ===========================================================================
  // Check Specific Quota
  // ===========================================================================

  async checkFunctionQuota(userId: number): Promise<{ allowed: boolean; message?: string }> {
    const limits = this.getLimits(userId);
    const usage = await this.getUsage(userId);

    if (usage.functions.count >= limits.functions.maxCount) {
      return { allowed: false, message: `Maximum function limit (${limits.functions.maxCount}) reached` };
    }

    return { allowed: true };
  },

  async checkVMQuota(
    userId: number,
    cores: number,
    memoryMB: number,
    diskGB: number
  ): Promise<{ allowed: boolean; message?: string }> {
    const limits = this.getLimits(userId);
    const usage = await this.getUsage(userId);

    if (usage.virtualMachines.count >= limits.virtualMachines.maxCount) {
      return { allowed: false, message: `Maximum VM limit (${limits.virtualMachines.maxCount}) reached` };
    }
    if (usage.virtualMachines.totalCores + cores > limits.virtualMachines.maxCores) {
      return { allowed: false, message: `CPU quota would be exceeded (max ${limits.virtualMachines.maxCores} cores)` };
    }
    if (usage.virtualMachines.totalMemoryMB + memoryMB > limits.virtualMachines.maxMemoryMB) {
      return { allowed: false, message: `Memory quota would be exceeded (max ${limits.virtualMachines.maxMemoryMB}MB)` };
    }
    if (usage.virtualMachines.totalDiskGB + diskGB > limits.virtualMachines.maxDiskGB) {
      return { allowed: false, message: `Disk quota would be exceeded (max ${limits.virtualMachines.maxDiskGB}GB)` };
    }

    return { allowed: true };
  },

  async checkStorageQuota(userId: number, additionalBytes = 0): Promise<{ allowed: boolean; message?: string }> {
    const limits = this.getLimits(userId);
    const usage = await this.getUsage(userId);

    if (usage.storage.bucketCount >= limits.storage.maxBuckets) {
      return { allowed: false, message: `Maximum bucket limit (${limits.storage.maxBuckets}) reached` };
    }
    if (usage.storage.totalBytes + additionalBytes > limits.storage.maxTotalBytes) {
      return { allowed: false, message: `Storage quota would be exceeded (max ${limits.storage.maxTotalBytes / (1024 * 1024 * 1024)}GB)` };
    }

    return { allowed: true };
  },
});
