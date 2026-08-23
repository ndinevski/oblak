/**
 * Quota Service
 * Unified quota management across all resources
 */

import type { Core } from "@strapi/strapi";
import { getClickHouseClient } from "../../../telemetry/clickhouse";
import { countAuditAction } from "../../../telemetry/queries";
import { getPristanisteClient } from "../../pristaniste/services/pristaniste-client";
import { getTefterClient } from "../../tefter/services/tefter-client";
import { getIndeksClient } from "../../indeks/services/indeks-client";
import { getRedClient } from "../../red/services/red-client";

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
  // Platform-service limits are counted platform-wide rather than per-user:
  // Pristaniste, Tefter, Indeks and Red keep their resources in the Go services with
  // no per-owner attribution, so on a self-hosted single-tenant install these
  // caps bound the whole deployment. See getPlatformUsage below.
  platform: {
    maxContainers: number;
    maxDatabases: number;
    maxKeyValueTables: number;
    maxQueues: number;
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
  platform: {
    containerCount: number;
    databaseCount: number;
    keyValueTableCount: number;
    queueCount: number;
  };
}

interface QuotaInfo {
  limits: QuotaLimits;
  usage: QuotaUsage;
  remaining: {
    functions: { count: number; invocationsToday: number };
    virtualMachines: {
      count: number;
      cores: number;
      memoryMB: number;
      diskGB: number;
    };
    storage: { buckets: number; bytes: number };
    platform: {
      containers: number;
      databases: number;
      keyValueTables: number;
      queues: number;
    };
  };
  percentages: {
    functions: { count: number; invocations: number };
    virtualMachines: {
      count: number;
      cores: number;
      memory: number;
      disk: number;
    };
    storage: { buckets: number; bytes: number };
    platform: {
      containers: number;
      databases: number;
      keyValueTables: number;
      queues: number;
    };
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
  platform: {
    maxContainers: 20,
    maxDatabases: 10,
    maxKeyValueTables: 50,
    maxQueues: 50,
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

function calculatePercentage(used: number, max: number): number {
  if (max === 0) return 0;
  return Math.min(Math.round((used / max) * 100), 100);
}

/**
 * Counts resources held by the platform Go services (Pristaniste, Tefter, Indeks,
 * Red). These have no per-user ownership, so counts are platform-wide.
 *
 * Quota must never fail closed: a service that is down or not configured is
 * reported as zero rather than throwing, so the quota view still renders and a
 * create is not blocked by an unrelated outage (the create call itself would
 * fail against the down service anyway). Each count is independent and runs in
 * parallel so one slow service does not serialise the others.
 */
async function getPlatformUsage(strapi: any): Promise<{
  containerCount: number;
  databaseCount: number;
  keyValueTableCount: number;
  queueCount: number;
}> {
  const safeCount = async (
    label: string,
    fn: () => Promise<{ length: number }>,
  ): Promise<number> => {
    try {
      const list = await fn();
      return Array.isArray(list) ? list.length : 0;
    } catch (error) {
      strapi.log.warn(
        `Quota: could not count ${label}: ${(error as Error).message}`,
      );
      return 0;
    }
  };

  const [containerCount, databaseCount, keyValueTableCount, queueCount] =
    await Promise.all([
      safeCount("Pristaniste containers", () => getPristanisteClient().listContainers(true)),
      safeCount("Tefter databases", () => getTefterClient().listInstances()),
      safeCount("Indeks tables", () => getIndeksClient().listTables()),
      safeCount("Red queues", () => getRedClient().listQueues()),
    ]);

  return { containerCount, databaseCount, keyValueTableCount, queueCount };
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
    const functionCount = await strapi.db
      .query("api::function.function")
      .count({
        where: { owner: userId },
      });

    // Get VM stats
    const vms = await strapi.db
      .query("api::virtual-machine.virtual-machine")
      .findMany({
        where: { owner: userId },
        select: ["cores", "memoryMB", "diskGB"],
      });

    const vmCount = vms.length;
    const totalCores = vms.reduce(
      (sum: number, vm: any) => sum + (vm.cores || 0),
      0,
    );
    const totalMemoryMB = vms.reduce(
      (sum: number, vm: any) => sum + (vm.memoryMB || 0),
      0,
    );
    const totalDiskGB = vms.reduce(
      (sum: number, vm: any) => sum + (vm.diskGB || 0),
      0,
    );

    // Get bucket stats
    const buckets = await strapi.db.query("api::bucket.bucket").findMany({
      where: { owner: userId },
      select: ["totalSize"],
    });

    const bucketCount = buckets.length;
    const totalBytes = buckets.reduce(
      (sum: number, b: any) => sum + parseInt(b.totalSize || "0", 10),
      0,
    );

    // Today's function invocations, counted from the audit trail in the
    // telemetry store. Quota must not fail closed when telemetry is down, so
    // an unreachable store is reported as zero usage rather than an error.
    let invocationsToday = 0;
    const ch = getClickHouseClient();
    if (ch) {
      try {
        invocationsToday = await countAuditAction(
          ch,
          { from: today, to: new Date() },
          "function.invoke",
          userId,
        );
      } catch (error) {
        strapi.log.warn(
          `Could not read invocation count from telemetry: ${(error as Error).message}`,
        );
      }
    }

    const platform = await getPlatformUsage(strapi);

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
      platform,
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
        invocationsToday: Math.max(
          0,
          limits.functions.maxInvocationsPerDay -
            usage.functions.invocationsToday,
        ),
      },
      virtualMachines: {
        count: Math.max(
          0,
          limits.virtualMachines.maxCount - usage.virtualMachines.count,
        ),
        cores: Math.max(
          0,
          limits.virtualMachines.maxCores - usage.virtualMachines.totalCores,
        ),
        memoryMB: Math.max(
          0,
          limits.virtualMachines.maxMemoryMB -
            usage.virtualMachines.totalMemoryMB,
        ),
        diskGB: Math.max(
          0,
          limits.virtualMachines.maxDiskGB - usage.virtualMachines.totalDiskGB,
        ),
      },
      storage: {
        buckets: Math.max(
          0,
          limits.storage.maxBuckets - usage.storage.bucketCount,
        ),
        bytes: Math.max(
          0,
          limits.storage.maxTotalBytes - usage.storage.totalBytes,
        ),
      },
      platform: {
        containers: Math.max(
          0,
          limits.platform.maxContainers - usage.platform.containerCount,
        ),
        databases: Math.max(
          0,
          limits.platform.maxDatabases - usage.platform.databaseCount,
        ),
        keyValueTables: Math.max(
          0,
          limits.platform.maxKeyValueTables - usage.platform.keyValueTableCount,
        ),
        queues: Math.max(
          0,
          limits.platform.maxQueues - usage.platform.queueCount,
        ),
      },
    };

    const percentages = {
      functions: {
        count: calculatePercentage(
          usage.functions.count,
          limits.functions.maxCount,
        ),
        invocations: calculatePercentage(
          usage.functions.invocationsToday,
          limits.functions.maxInvocationsPerDay,
        ),
      },
      virtualMachines: {
        count: calculatePercentage(
          usage.virtualMachines.count,
          limits.virtualMachines.maxCount,
        ),
        cores: calculatePercentage(
          usage.virtualMachines.totalCores,
          limits.virtualMachines.maxCores,
        ),
        memory: calculatePercentage(
          usage.virtualMachines.totalMemoryMB,
          limits.virtualMachines.maxMemoryMB,
        ),
        disk: calculatePercentage(
          usage.virtualMachines.totalDiskGB,
          limits.virtualMachines.maxDiskGB,
        ),
      },
      storage: {
        buckets: calculatePercentage(
          usage.storage.bucketCount,
          limits.storage.maxBuckets,
        ),
        bytes: calculatePercentage(
          usage.storage.totalBytes,
          limits.storage.maxTotalBytes,
        ),
      },
      platform: {
        containers: calculatePercentage(
          usage.platform.containerCount,
          limits.platform.maxContainers,
        ),
        databases: calculatePercentage(
          usage.platform.databaseCount,
          limits.platform.maxDatabases,
        ),
        keyValueTables: calculatePercentage(
          usage.platform.keyValueTableCount,
          limits.platform.maxKeyValueTables,
        ),
        queues: calculatePercentage(
          usage.platform.queueCount,
          limits.platform.maxQueues,
        ),
      },
    };

    return { limits, usage, remaining, percentages };
  },

  // ===========================================================================
  // Check Specific Quota
  // ===========================================================================

  async checkFunctionQuota(
    userId: number,
  ): Promise<{ allowed: boolean; message?: string }> {
    const limits = this.getLimits(userId);
    const usage = await this.getUsage(userId);

    if (usage.functions.count >= limits.functions.maxCount) {
      return {
        allowed: false,
        message: `Maximum function limit (${limits.functions.maxCount}) reached`,
      };
    }

    return { allowed: true };
  },

  async checkVMQuota(
    userId: number,
    cores: number,
    memoryMB: number,
    diskGB: number,
  ): Promise<{ allowed: boolean; message?: string }> {
    const limits = this.getLimits(userId);
    const usage = await this.getUsage(userId);

    if (usage.virtualMachines.count >= limits.virtualMachines.maxCount) {
      return {
        allowed: false,
        message: `Maximum VM limit (${limits.virtualMachines.maxCount}) reached`,
      };
    }
    if (
      usage.virtualMachines.totalCores + cores >
      limits.virtualMachines.maxCores
    ) {
      return {
        allowed: false,
        message: `CPU quota would be exceeded (max ${limits.virtualMachines.maxCores} cores)`,
      };
    }
    if (
      usage.virtualMachines.totalMemoryMB + memoryMB >
      limits.virtualMachines.maxMemoryMB
    ) {
      return {
        allowed: false,
        message: `Memory quota would be exceeded (max ${limits.virtualMachines.maxMemoryMB}MB)`,
      };
    }
    if (
      usage.virtualMachines.totalDiskGB + diskGB >
      limits.virtualMachines.maxDiskGB
    ) {
      return {
        allowed: false,
        message: `Disk quota would be exceeded (max ${limits.virtualMachines.maxDiskGB}GB)`,
      };
    }

    return { allowed: true };
  },

  async checkStorageQuota(
    userId: number,
    additionalBytes = 0,
  ): Promise<{ allowed: boolean; message?: string }> {
    const limits = this.getLimits(userId);
    const usage = await this.getUsage(userId);

    if (usage.storage.bucketCount >= limits.storage.maxBuckets) {
      return {
        allowed: false,
        message: `Maximum bucket limit (${limits.storage.maxBuckets}) reached`,
      };
    }
    if (
      usage.storage.totalBytes + additionalBytes >
      limits.storage.maxTotalBytes
    ) {
      return {
        allowed: false,
        message: `Storage quota would be exceeded (max ${limits.storage.maxTotalBytes / (1024 * 1024 * 1024)}GB)`,
      };
    }

    return { allowed: true };
  },

  // ===========================================================================
  // Platform Service Quotas (Pristaniste, Tefter, Indeks, Red)
  //
  // Counted platform-wide, not per-user. Each check counts only its own
  // resource so it stays cheap, and fails open on a service outage (see
  // getPlatformUsage) so a create is never blocked by an unrelated one.
  // ===========================================================================

  async checkContainerQuota(): Promise<{
    allowed: boolean;
    message?: string;
  }> {
    const max = DEFAULT_LIMITS.platform.maxContainers;
    let count = 0;
    try {
      count = (await getPristanisteClient().listContainers(true)).length;
    } catch {
      return { allowed: true };
    }
    if (count >= max) {
      return {
        allowed: false,
        message: `Maximum container limit (${max}) reached`,
      };
    }
    return { allowed: true };
  },

  async checkDatabaseQuota(): Promise<{ allowed: boolean; message?: string }> {
    const max = DEFAULT_LIMITS.platform.maxDatabases;
    let count = 0;
    try {
      count = (await getTefterClient().listInstances()).length;
    } catch {
      return { allowed: true };
    }
    if (count >= max) {
      return {
        allowed: false,
        message: `Maximum database limit (${max}) reached`,
      };
    }
    return { allowed: true };
  },

  async checkKeyValueTableQuota(): Promise<{
    allowed: boolean;
    message?: string;
  }> {
    const max = DEFAULT_LIMITS.platform.maxKeyValueTables;
    let count = 0;
    try {
      count = (await getIndeksClient().listTables()).length;
    } catch {
      return { allowed: true };
    }
    if (count >= max) {
      return {
        allowed: false,
        message: `Maximum key/value table limit (${max}) reached`,
      };
    }
    return { allowed: true };
  },

  async checkQueueQuota(): Promise<{ allowed: boolean; message?: string }> {
    const max = DEFAULT_LIMITS.platform.maxQueues;
    let count = 0;
    try {
      count = (await getRedClient().listQueues()).length;
    } catch {
      return { allowed: true };
    }
    if (count >= max) {
      return {
        allowed: false,
        message: `Maximum queue limit (${max}) reached`,
      };
    }
    return { allowed: true };
  },
});
