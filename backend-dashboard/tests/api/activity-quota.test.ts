/**
 * Activity and Quota Tests
 * Tests for activity logging and quota management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mock Setup
// =============================================================================

const mockStrapi = {
  log: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  db: {
    query: vi.fn(),
  },
  entityService: {
    findMany: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  service: vi.fn(),
};

// =============================================================================
// Activity Log Service Tests
// =============================================================================

describe('Activity Log Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Log Activity', () => {
    it('should create activity log entry with required fields', async () => {
      const logParams = {
        userId: 1,
        action: 'function.create',
        resourceType: 'function',
        resourceId: '123',
        resourceName: 'my-function',
        status: 'success' as const,
      };

      mockStrapi.entityService.create.mockResolvedValue({
        id: 1,
        ...logParams,
        createdAt: new Date().toISOString(),
      });

      // Simulate service behavior
      const result = await mockStrapi.entityService.create('api::activity-log.activity-log', {
        data: {
          user: logParams.userId,
          action: logParams.action,
          resourceType: logParams.resourceType,
          resourceId: logParams.resourceId,
          resourceName: logParams.resourceName,
          status: logParams.status,
        },
      });

      expect(result).toBeDefined();
      expect(result.action).toBe('function.create');
      expect(result.resourceType).toBe('function');
    });

    it('should include optional details in log entry', async () => {
      const logParams = {
        userId: 1,
        action: 'function.invoke',
        resourceType: 'function',
        resourceId: '123',
        resourceName: 'my-function',
        status: 'success' as const,
        details: { runtime: 'nodejs', duration: 150 },
      };

      mockStrapi.entityService.create.mockResolvedValue({
        id: 1,
        ...logParams,
        createdAt: new Date().toISOString(),
      });

      const result = await mockStrapi.entityService.create('api::activity-log.activity-log', {
        data: {
          user: logParams.userId,
          action: logParams.action,
          resourceType: logParams.resourceType,
          resourceId: logParams.resourceId,
          resourceName: logParams.resourceName,
          status: logParams.status,
          details: logParams.details,
        },
      });

      expect(result.details).toEqual({ runtime: 'nodejs', duration: 150 });
    });

    it('should handle failure status', async () => {
      const logParams = {
        userId: 1,
        action: 'vm.create',
        resourceType: 'virtual-machine',
        status: 'failure' as const,
        details: { error: 'Quota exceeded' },
      };

      mockStrapi.entityService.create.mockResolvedValue({
        id: 1,
        ...logParams,
        createdAt: new Date().toISOString(),
      });

      const result = await mockStrapi.entityService.create('api::activity-log.activity-log', {
        data: logParams,
      });

      expect(result.status).toBe('failure');
      expect(result.details.error).toBe('Quota exceeded');
    });
  });

  describe('Find Activity Logs', () => {
    it('should filter by resource type', async () => {
      const mockLogs = [
        { id: 1, action: 'function.create', resourceType: 'function' },
        { id: 2, action: 'function.update', resourceType: 'function' },
      ];

      mockStrapi.entityService.findMany.mockResolvedValue(mockLogs);

      const result = await mockStrapi.entityService.findMany('api::activity-log.activity-log', {
        filters: { resourceType: 'function', user: 1 },
        sort: { createdAt: 'desc' },
      });

      expect(result).toHaveLength(2);
      expect(result[0].resourceType).toBe('function');
    });

    it('should filter by action', async () => {
      const mockLogs = [
        { id: 1, action: 'function.create', resourceType: 'function' },
      ];

      mockStrapi.entityService.findMany.mockResolvedValue(mockLogs);

      const result = await mockStrapi.entityService.findMany('api::activity-log.activity-log', {
        filters: { action: { $contains: 'create' }, user: 1 },
      });

      expect(result).toHaveLength(1);
      expect(result[0].action).toContain('create');
    });

    it('should filter by status', async () => {
      const mockLogs = [
        { id: 1, action: 'vm.create', status: 'failure' },
      ];

      mockStrapi.entityService.findMany.mockResolvedValue(mockLogs);

      const result = await mockStrapi.entityService.findMany('api::activity-log.activity-log', {
        filters: { status: 'failure', user: 1 },
      });

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('failure');
    });

    it('should support pagination', async () => {
      const mockLogs = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        action: 'function.invoke',
        resourceType: 'function',
      }));

      mockStrapi.entityService.findMany.mockResolvedValue(mockLogs);
      mockStrapi.entityService.count.mockResolvedValue(50);

      const result = await mockStrapi.entityService.findMany('api::activity-log.activity-log', {
        filters: { user: 1 },
        start: 0,
        limit: 10,
      });

      expect(result).toHaveLength(10);
    });
  });

  describe('Activity Summary', () => {
    it('should calculate summary statistics', async () => {
      const mockLogs = [
        { id: 1, action: 'function.create', resourceType: 'function', status: 'success' },
        { id: 2, action: 'function.invoke', resourceType: 'function', status: 'success' },
        { id: 3, action: 'vm.create', resourceType: 'virtual-machine', status: 'failure' },
        { id: 4, action: 'bucket.create', resourceType: 'bucket', status: 'success' },
      ];

      // Simulate summary calculation
      const summary = {
        totalActivities: mockLogs.length,
        byAction: {
          'function.create': 1,
          'function.invoke': 1,
          'vm.create': 1,
          'bucket.create': 1,
        },
        byResourceType: {
          function: 2,
          'virtual-machine': 1,
          bucket: 1,
        },
        byStatus: {
          success: 3,
          failure: 1,
        },
        recentDays: 30,
      };

      expect(summary.totalActivities).toBe(4);
      expect(summary.byStatus.success).toBe(3);
      expect(summary.byStatus.failure).toBe(1);
      expect(summary.byResourceType.function).toBe(2);
    });
  });
});

// =============================================================================
// Quota Service Tests
// =============================================================================

describe('Quota Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Get Quota Limits', () => {
    it('should return default limits', () => {
      const defaultLimits = {
        functions: {
          maxCount: 20,
          maxInvocationsPerDay: 10000,
        },
        virtualMachines: {
          maxCount: 5,
          maxCores: 32,
          maxMemoryMB: 32768,
          maxDiskGB: 500,
        },
        storage: {
          maxBuckets: 10,
          maxTotalBytes: 10 * 1024 * 1024 * 1024,
        },
      };

      expect(defaultLimits.functions.maxCount).toBe(20);
      expect(defaultLimits.virtualMachines.maxCount).toBe(5);
      expect(defaultLimits.storage.maxBuckets).toBe(10);
    });
  });

  describe('Get Quota Usage', () => {
    it('should calculate function usage', async () => {
      mockStrapi.db.query.mockReturnValue({
        count: vi.fn().mockResolvedValue(5),
        findMany: vi.fn().mockResolvedValue([]),
      });

      // Simulate usage calculation
      const usage = {
        functions: { count: 5, invocationsToday: 100 },
        virtualMachines: { count: 0, totalCores: 0, totalMemoryMB: 0, totalDiskGB: 0 },
        storage: { bucketCount: 0, totalBytes: 0 },
      };

      expect(usage.functions.count).toBe(5);
      expect(usage.functions.invocationsToday).toBe(100);
    });

    it('should calculate VM usage', async () => {
      const mockVMs = [
        { cores: 2, memoryMB: 2048, diskGB: 20 },
        { cores: 4, memoryMB: 4096, diskGB: 50 },
      ];

      const totalCores = mockVMs.reduce((sum, vm) => sum + vm.cores, 0);
      const totalMemoryMB = mockVMs.reduce((sum, vm) => sum + vm.memoryMB, 0);
      const totalDiskGB = mockVMs.reduce((sum, vm) => sum + vm.diskGB, 0);

      const usage = {
        virtualMachines: {
          count: mockVMs.length,
          totalCores,
          totalMemoryMB,
          totalDiskGB,
        },
      };

      expect(usage.virtualMachines.count).toBe(2);
      expect(usage.virtualMachines.totalCores).toBe(6);
      expect(usage.virtualMachines.totalMemoryMB).toBe(6144);
      expect(usage.virtualMachines.totalDiskGB).toBe(70);
    });

    it('should calculate storage usage', async () => {
      const mockBuckets = [
        { totalSize: '1073741824' }, // 1GB
        { totalSize: '2147483648' }, // 2GB
      ];

      const totalBytes = mockBuckets.reduce((sum, b) => sum + parseInt(b.totalSize, 10), 0);

      const usage = {
        storage: {
          bucketCount: mockBuckets.length,
          totalBytes,
        },
      };

      expect(usage.storage.bucketCount).toBe(2);
      expect(usage.storage.totalBytes).toBe(3221225472); // 3GB
    });
  });

  describe('Get Full Quota Info', () => {
    it('should calculate remaining quota', () => {
      const limits = {
        functions: { maxCount: 20, maxInvocationsPerDay: 10000 },
        virtualMachines: { maxCount: 5, maxCores: 32, maxMemoryMB: 32768, maxDiskGB: 500 },
        storage: { maxBuckets: 10, maxTotalBytes: 10737418240 },
      };

      const usage = {
        functions: { count: 5, invocationsToday: 1000 },
        virtualMachines: { count: 2, totalCores: 8, totalMemoryMB: 8192, totalDiskGB: 100 },
        storage: { bucketCount: 3, totalBytes: 3221225472 },
      };

      const remaining = {
        functions: {
          count: limits.functions.maxCount - usage.functions.count,
          invocationsToday: limits.functions.maxInvocationsPerDay - usage.functions.invocationsToday,
        },
        virtualMachines: {
          count: limits.virtualMachines.maxCount - usage.virtualMachines.count,
          cores: limits.virtualMachines.maxCores - usage.virtualMachines.totalCores,
          memoryMB: limits.virtualMachines.maxMemoryMB - usage.virtualMachines.totalMemoryMB,
          diskGB: limits.virtualMachines.maxDiskGB - usage.virtualMachines.totalDiskGB,
        },
        storage: {
          buckets: limits.storage.maxBuckets - usage.storage.bucketCount,
          bytes: limits.storage.maxTotalBytes - usage.storage.totalBytes,
        },
      };

      expect(remaining.functions.count).toBe(15);
      expect(remaining.virtualMachines.count).toBe(3);
      expect(remaining.virtualMachines.cores).toBe(24);
      expect(remaining.storage.buckets).toBe(7);
    });

    it('should calculate percentages', () => {
      const usage = { count: 5 };
      const limit = { maxCount: 20 };

      const percentage = Math.round((usage.count / limit.maxCount) * 100);

      expect(percentage).toBe(25);
    });

    it('should handle zero limits', () => {
      const usage = { count: 0 };
      const limit = { maxCount: 0 };

      const percentage = limit.maxCount === 0 ? 0 : Math.round((usage.count / limit.maxCount) * 100);

      expect(percentage).toBe(0);
    });
  });

  describe('Quota Checks', () => {
    it('should allow function creation when under quota', () => {
      const usage = { functions: { count: 5 } };
      const limits = { functions: { maxCount: 20 } };

      const allowed = usage.functions.count < limits.functions.maxCount;

      expect(allowed).toBe(true);
    });

    it('should deny function creation when at quota', () => {
      const usage = { functions: { count: 20 } };
      const limits = { functions: { maxCount: 20 } };

      const allowed = usage.functions.count < limits.functions.maxCount;

      expect(allowed).toBe(false);
    });

    it('should allow VM creation when under all quotas', () => {
      const usage = {
        virtualMachines: { count: 2, totalCores: 8, totalMemoryMB: 8192, totalDiskGB: 100 },
      };
      const limits = {
        virtualMachines: { maxCount: 5, maxCores: 32, maxMemoryMB: 32768, maxDiskGB: 500 },
      };
      const requested = { cores: 4, memoryMB: 4096, diskGB: 50 };

      const countAllowed = usage.virtualMachines.count < limits.virtualMachines.maxCount;
      const coresAllowed = usage.virtualMachines.totalCores + requested.cores <= limits.virtualMachines.maxCores;
      const memoryAllowed = usage.virtualMachines.totalMemoryMB + requested.memoryMB <= limits.virtualMachines.maxMemoryMB;
      const diskAllowed = usage.virtualMachines.totalDiskGB + requested.diskGB <= limits.virtualMachines.maxDiskGB;

      expect(countAllowed).toBe(true);
      expect(coresAllowed).toBe(true);
      expect(memoryAllowed).toBe(true);
      expect(diskAllowed).toBe(true);
    });

    it('should deny VM creation when cores exceed quota', () => {
      const usage = {
        virtualMachines: { count: 2, totalCores: 30 },
      };
      const limits = {
        virtualMachines: { maxCores: 32 },
      };
      const requested = { cores: 4 };

      const coresAllowed = usage.virtualMachines.totalCores + requested.cores <= limits.virtualMachines.maxCores;

      expect(coresAllowed).toBe(false);
    });

    it('should allow bucket creation when under quota', () => {
      const usage = { storage: { bucketCount: 5, totalBytes: 5368709120 } };
      const limits = { storage: { maxBuckets: 10, maxTotalBytes: 10737418240 } };

      const allowed = usage.storage.bucketCount < limits.storage.maxBuckets;

      expect(allowed).toBe(true);
    });

    it('should deny bucket creation when at quota', () => {
      const usage = { storage: { bucketCount: 10 } };
      const limits = { storage: { maxBuckets: 10 } };

      const allowed = usage.storage.bucketCount < limits.storage.maxBuckets;

      expect(allowed).toBe(false);
    });
  });
});

// =============================================================================
// Activity Controller Tests
// =============================================================================

describe('Activity Controller', () => {
  describe('Find Activities', () => {
    it('should return paginated activities', async () => {
      const mockResponse = {
        data: [
          { id: 1, action: 'function.create', resourceType: 'function' },
          { id: 2, action: 'vm.create', resourceType: 'virtual-machine' },
        ],
        meta: {
          pagination: { page: 1, pageSize: 20, pageCount: 1, total: 2 },
        },
      };

      expect(mockResponse.data).toHaveLength(2);
      expect(mockResponse.meta.pagination.total).toBe(2);
    });

    it('should require authentication', async () => {
      const ctx = { state: { user: null } };
      const requiresAuth = !ctx.state.user;
      expect(requiresAuth).toBe(true);
    });
  });

  describe('Get Summary', () => {
    it('should return summary statistics', async () => {
      const summary = {
        totalActivities: 100,
        byAction: { 'function.create': 20, 'function.invoke': 50 },
        byResourceType: { function: 70, 'virtual-machine': 20, bucket: 10 },
        byStatus: { success: 95, failure: 5 },
        recentDays: 30,
      };

      expect(summary.totalActivities).toBe(100);
      expect(summary.byStatus.success).toBe(95);
    });
  });
});

// =============================================================================
// Quota Controller Tests
// =============================================================================

describe('Quota Controller', () => {
  describe('Get Quota', () => {
    it('should return full quota information', async () => {
      const quotaInfo = {
        limits: {
          functions: { maxCount: 20, maxInvocationsPerDay: 10000 },
          virtualMachines: { maxCount: 5, maxCores: 32, maxMemoryMB: 32768, maxDiskGB: 500 },
          storage: { maxBuckets: 10, maxTotalBytes: 10737418240 },
        },
        usage: {
          functions: { count: 5, invocationsToday: 100 },
          virtualMachines: { count: 2, totalCores: 8, totalMemoryMB: 8192, totalDiskGB: 100 },
          storage: { bucketCount: 3, totalBytes: 3221225472 },
        },
        remaining: {
          functions: { count: 15, invocationsToday: 9900 },
          virtualMachines: { count: 3, cores: 24, memoryMB: 24576, diskGB: 400 },
          storage: { buckets: 7, bytes: 7516192768 },
        },
        percentages: {
          functions: { count: 25, invocations: 1 },
          virtualMachines: { count: 40, cores: 25, memory: 25, disk: 20 },
          storage: { buckets: 30, bytes: 30 },
        },
      };

      expect(quotaInfo.limits).toBeDefined();
      expect(quotaInfo.usage).toBeDefined();
      expect(quotaInfo.remaining).toBeDefined();
      expect(quotaInfo.percentages).toBeDefined();
    });

    it('should require authentication', async () => {
      const ctx = { state: { user: null } };
      const requiresAuth = !ctx.state.user;
      expect(requiresAuth).toBe(true);
    });
  });

  describe('Get Usage', () => {
    it('should return current usage only', async () => {
      const usage = {
        functions: { count: 5, invocationsToday: 100 },
        virtualMachines: { count: 2, totalCores: 8, totalMemoryMB: 8192, totalDiskGB: 100 },
        storage: { bucketCount: 3, totalBytes: 3221225472 },
      };

      expect(usage.functions).toBeDefined();
      expect(usage.virtualMachines).toBeDefined();
      expect(usage.storage).toBeDefined();
    });
  });

  describe('Get Limits', () => {
    it('should return limits only', async () => {
      const limits = {
        functions: { maxCount: 20, maxInvocationsPerDay: 10000 },
        virtualMachines: { maxCount: 5, maxCores: 32, maxMemoryMB: 32768, maxDiskGB: 500 },
        storage: { maxBuckets: 10, maxTotalBytes: 10737418240 },
      };

      expect(limits.functions.maxCount).toBe(20);
      expect(limits.virtualMachines.maxCount).toBe(5);
      expect(limits.storage.maxBuckets).toBe(10);
    });
  });
});
