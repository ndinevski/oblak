/**
 * Activity Log Controller
 * Handles HTTP requests for activity log operations
 */

import type { Core } from '@strapi/strapi';

// =============================================================================
// Types
// =============================================================================

interface Context {
  state: {
    user?: { id: number };
  };
  request: {
    body?: unknown;
    query?: Record<string, unknown>;
  };
  params: Record<string, string>;
  query: Record<string, unknown>;
  throw: (status: number, message: string) => never;
  unauthorized: (message: string) => void;
  notFound: (message: string) => void;
  forbidden: (message: string) => void;
  badRequest: (message: string) => void;
  body: unknown;
  status: number;
}

// =============================================================================
// Helpers
// =============================================================================

function getAuthenticatedUser(ctx: Context): { id: number } {
  if (!ctx.state.user) {
    ctx.throw(401, 'Authentication required');
  }
  return ctx.state.user;
}

// =============================================================================
// Controller Factory
// =============================================================================

export default ({ strapi }: { strapi: Strapi }) => ({
  // ===========================================================================
  // Find Activity Logs
  // ===========================================================================

  async find(ctx: Context) {
    try {
      const user = getAuthenticatedUser(ctx);
      const activityService = strapi.service('api::activity-log.activity-log');

      const result = await activityService.find({
        userId: user.id,
        resourceType: ctx.query.resourceType as string,
        action: ctx.query.action as string,
        status: ctx.query.status as string,
        startDate: ctx.query.startDate as string,
        endDate: ctx.query.endDate as string,
        page: Number(ctx.query.page) || 1,
        pageSize: Number(ctx.query.pageSize) || 25,
      });

      ctx.body = result;
    } catch (error) {
      strapi.log.error('Error fetching activity logs:', error);
      ctx.status = 400;
      ctx.body = { error: { message: 'Failed to fetch activity logs' } };
    }
  },

  // ===========================================================================
  // Find One Activity Log
  // ===========================================================================

  async findOne(ctx: Context) {
    try {
      const user = getAuthenticatedUser(ctx);
      const logId = parseInt(ctx.params.id, 10);
      const activityService = strapi.service('api::activity-log.activity-log');

      const log = await activityService.findOne(logId, user.id);

      if (!log) {
        ctx.status = 404;
        ctx.body = { error: { message: 'Activity log not found' } };
        return;
      }

      ctx.body = { data: log };
    } catch (error) {
      strapi.log.error('Error fetching activity log:', error);
      ctx.status = 400;
      ctx.body = { error: { message: 'Failed to fetch activity log' } };
    }
  },

  // ===========================================================================
  // Get Activity Summary
  // ===========================================================================

  async summary(ctx: Context) {
    try {
      const user = getAuthenticatedUser(ctx);
      const activityService = strapi.service('api::activity-log.activity-log');

      const days = ctx.query.days ? Number(ctx.query.days) : 30;
      const summary = await activityService.getSummary(user.id, days);

      ctx.body = { data: summary };
    } catch (error) {
      strapi.log.error('Error fetching activity summary:', error);
      ctx.status = 400;
      ctx.body = { error: { message: 'Failed to fetch activity summary' } };
    }
  },
});

