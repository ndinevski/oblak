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
  | 'bucket.update'
  | 'bucket.delete'
  | 'object.upload'
  | 'object.download'
  | 'object.delete'
  | 'user.login'
  | 'user.logout'
  | 'user.update';

type ResourceType = 'function' | 'virtual-machine' | 'bucket' | 'object' | 'user';

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
  // Clean Old Logs
  // ===========================================================================

  async cleanOldLogs(retentionDays = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await strapi.db.query('api::activity-log.activity-log').deleteMany({
      where: {
        createdAt: { $lt: cutoffDate },
      },
    });

    return { deleted: result.count };
  },
});
