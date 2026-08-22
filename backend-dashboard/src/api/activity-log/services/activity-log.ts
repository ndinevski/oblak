/**
 * Activity Log Service
 * Business logic for activity logging and retrieval
 */

import type { Core } from '@strapi/strapi';

// =============================================================================
// Types
// =============================================================================

type ActionType =
  | 'function.create'
  | 'function.update'
  | 'function.delete'
  | 'function.invoke'
  | 'vm.create'
  | 'vm.start'
  | 'vm.stop'
  | 'vm.reboot'
  | 'vm.delete'
  | 'vm.snapshot'
  | 'bucket.create'
  | 'bucket.list'
  | 'bucket.view'
  | 'bucket.update'
  | 'bucket.delete'
  | 'bucket.sync'
  | 'bucket.stats'
  | 'bucket.quota'
  | 'object.list'
  | 'object.info'
  | 'object.upload'
  | 'object.download'
  | 'object.delete'
  | 'object.deleteMany'
  | 'object.deleteFolder'
  | 'object.copy'
  | 'object.presign'
  | 'user.login'
  | 'user.logout'
  | 'user.update'
  | 'polaroid.upload'
  | 'polaroid.delete'
  | 'polaroid.favorite'
  | 'polaroid.archive'
  | 'polaroid.album.create'
  | 'polaroid.album.update'
  | 'polaroid.album.delete'
  | 'polaroid.share.create'
  | 'polaroid.share.delete';

type ResourceType = 'function' | 'virtual-machine' | 'bucket' | 'object' | 'user' | 'polaroid';

type StatusType = 'success' | 'failure' | 'pending';

interface LogActivityParams {
  action: ActionType;
  resourceType: ResourceType;
  resourceId?: string;
  resourceName?: string;
  userId: number;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  status?: StatusType;
  errorMessage?: string;
}

interface FindLogsParams {
  userId: number;
  resourceType?: ResourceType;
  action?: ActionType;
  status?: StatusType;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

interface InvocationLogQueryParams {
  userId: number;
  resourceIds: string[];
  limit?: number;
}

interface RetentionPolicy {
  defaultRetentionDays: number;
  useCustomRetention: boolean;
  customRetentionDays: number;
  effectiveRetentionDays: number;
}

const RETENTION_POLICY_STORE_KEY = 'retention-policy';
const DEFAULT_RETENTION_DAYS = Number(process.env.ACTIVITY_LOG_DEFAULT_RETENTION_DAYS || 7);
const DEFAULT_CUSTOM_RETENTION_DAYS = Number(process.env.ACTIVITY_LOG_CUSTOM_RETENTION_DAYS || 30);

function normalizeDays(value: unknown, fallback: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const rounded = Math.trunc(parsed);
  if (rounded < 1) {
    return 1;
  }

  if (rounded > 3650) {
    return 3650;
  }

  return rounded;
}

// =============================================================================
// Service Factory
// =============================================================================

export default ({ strapi }: { strapi: Strapi }) => ({
  // ===========================================================================
  // Log Activity
  // ===========================================================================

  async log(params: LogActivityParams) {
    const {
      action,
      resourceType,
      resourceId,
      resourceName,
      userId,
      details,
      ipAddress,
      userAgent,
      status = 'success',
      errorMessage,
    } = params;

    try {
      const log = await strapi.db.query('api::activity-log.activity-log').create({
        data: {
          action,
          resourceType,
          resourceId,
          resourceName,
          details,
          ipAddress,
          userAgent,
          status,
          errorMessage,
          user: userId,
        },
      });

      return log;
    } catch (error) {
      // Don't throw on logging errors, just log them
      strapi.log.error('Failed to create activity log:', error);
      return null;
    }
  },

  // ===========================================================================
  // Find Logs with Filters
  // ===========================================================================

  async find(params: FindLogsParams) {
    const {
      userId,
      resourceType,
      action,
      status,
      startDate,
      endDate,
      page = 1,
      pageSize = 25,
    } = params;

    const where: Record<string, unknown> = { user: userId };

    if (resourceType) where.resourceType = resourceType;
    if (action) where.action = action;
    if (status) where.status = status;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        (where.createdAt as Record<string, unknown>).$gte = new Date(startDate);
      }
      if (endDate) {
        (where.createdAt as Record<string, unknown>).$lte = new Date(endDate);
      }
    }

    const [logs, total] = await Promise.all([
      strapi.db.query('api::activity-log.activity-log').findMany({
        where,
        orderBy: { createdAt: 'desc' },
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      strapi.db.query('api::activity-log.activity-log').count({ where }),
    ]);

    return {
      data: logs,
      meta: {
        pagination: {
          page,
          pageSize,
          total,
          pageCount: Math.ceil(total / pageSize),
        },
      },
    };
  },

  // ===========================================================================
  // Find One Log
  // ===========================================================================

  async findOne(logId: number, userId: number) {
    const log = await strapi.db.query('api::activity-log.activity-log').findOne({
      where: { id: logId, user: userId },
    });

    return log;
  },

  // ===========================================================================
  // Get Activity Summary
  // ===========================================================================

  async getSummary(userId: number, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get counts by action type
    const logs = await strapi.db.query('api::activity-log.activity-log').findMany({
      where: {
        user: userId,
        createdAt: { $gte: startDate },
      },
      select: ['action', 'resourceType', 'status'],
    });

    const byAction: Record<string, number> = {};
    const byResourceType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const log of logs) {
      byAction[log.action] = (byAction[log.action] || 0) + 1;
      byResourceType[log.resourceType] = (byResourceType[log.resourceType] || 0) + 1;
      byStatus[log.status || 'success'] = (byStatus[log.status || 'success'] || 0) + 1;
    }

    return {
      totalActivities: logs.length,
      byAction,
      byResourceType,
      byStatus,
      periodDays: days,
    };
  },

  // ===========================================================================
  // Get Function Invocation Logs
  // ===========================================================================

  async getFunctionInvocationLogs(params: InvocationLogQueryParams) {
    const { userId, resourceIds, limit = 25 } = params;

    if (!resourceIds || resourceIds.length === 0) {
      return {
        data: [],
        meta: { count: 0, limit: 0 },
      };
    }

    const retentionPolicy: RetentionPolicy = await strapi
      .service('api::activity-log.activity-log')
      .getRetentionPolicy();

    const cappedLimit = Math.max(1, Math.min(200, Number(limit) || 25));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionPolicy.effectiveRetentionDays);

    const logs = await strapi.db.query('api::activity-log.activity-log').findMany({
      where: {
        user: userId,
        action: 'function.invoke',
        resourceType: 'function',
        resourceId: { $in: resourceIds },
        createdAt: { $gte: cutoffDate },
      },
      orderBy: { createdAt: 'desc' },
      limit: cappedLimit,
    });

    const data = logs.map((log: any) => {
      const details = (log.details || {}) as Record<string, unknown>;
      const runtimeLogsRaw = details.runtimeLogs as Record<string, unknown> | undefined;

      const stdout = Array.isArray(runtimeLogsRaw?.stdout)
        ? runtimeLogsRaw?.stdout.filter((entry) => typeof entry === 'string')
        : [];
      const stderr = Array.isArray(runtimeLogsRaw?.stderr)
        ? runtimeLogsRaw?.stderr.filter((entry) => typeof entry === 'string')
        : [];

      return {
        id: log.id,
        createdAt: log.createdAt,
        status: log.status,
        errorMessage: log.errorMessage,
        executionTimeMs: details.executionTimeMs,
        providerStatusCode: details.providerStatusCode,
        response: details.functionResponse,
        runtimeLogs: stdout.length > 0 || stderr.length > 0
          ? {
              stdout,
              stderr,
            }
          : null,
      };
    });

    return {
      data,
      meta: {
        count: data.length,
        limit: cappedLimit,
      },
    };
  },

  // ===========================================================================
  // Retention Policy
  // ===========================================================================

  async getRetentionPolicy(): Promise<RetentionPolicy> {
    const store = strapi.store({ type: 'core', name: 'activity-log' });
    const saved = (await store.get({ key: RETENTION_POLICY_STORE_KEY })) as
      | { useCustomRetention?: boolean; customRetentionDays?: number }
      | undefined;

    const defaultRetentionDays = normalizeDays(DEFAULT_RETENTION_DAYS, 7);
    const customRetentionDays = normalizeDays(
      saved?.customRetentionDays,
      normalizeDays(DEFAULT_CUSTOM_RETENTION_DAYS, 30)
    );
    const useCustomRetention = saved?.useCustomRetention === true;

    return {
      defaultRetentionDays,
      useCustomRetention,
      customRetentionDays,
      effectiveRetentionDays: useCustomRetention ? customRetentionDays : defaultRetentionDays,
    };
  },

  async updateRetentionPolicy(config: {
    useCustomRetention?: boolean;
    customRetentionDays?: number;
  }): Promise<RetentionPolicy> {
    const currentPolicy: RetentionPolicy = await strapi
      .service('api::activity-log.activity-log')
      .getRetentionPolicy();

    const nextUseCustomRetention =
      typeof config.useCustomRetention === 'boolean'
        ? config.useCustomRetention
        : currentPolicy.useCustomRetention;

    const nextCustomRetentionDays =
      config.customRetentionDays !== undefined
        ? normalizeDays(config.customRetentionDays, currentPolicy.customRetentionDays)
        : currentPolicy.customRetentionDays;

    const store = strapi.store({ type: 'core', name: 'activity-log' });
    await store.set({
      key: RETENTION_POLICY_STORE_KEY,
      value: {
        useCustomRetention: nextUseCustomRetention,
        customRetentionDays: nextCustomRetentionDays,
      },
    });

    return strapi.service('api::activity-log.activity-log').getRetentionPolicy();
  },

  // ===========================================================================
  // Clean Old Logs
  // ===========================================================================

  async cleanOldLogs(retentionDays = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await strapi.db.query('api::activity-log.activity-log').deleteMany({
      where: {
        createdAt: { $lt: cutoffDate },
      },
    });

    return { deleted: result.count };
  },

  async runRetentionCleanup() {
    const policy: RetentionPolicy = await strapi
      .service('api::activity-log.activity-log')
      .getRetentionPolicy();

    const cleanup = await strapi
      .service('api::activity-log.activity-log')
      .cleanOldLogs(policy.effectiveRetentionDays);

    return {
      ...cleanup,
      retentionDays: policy.effectiveRetentionDays,
    };
  },
});
