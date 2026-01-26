/**
 * Activity log controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::activity-log.activity-log', ({ strapi }) => ({
  /**
   * Find activity logs for current user
   */
  async find(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

    const { page = 1, pageSize = 25, resourceType, action } = ctx.query;

    const filters: Record<string, unknown> = { user: user.id };
    if (resourceType) filters.resourceType = resourceType;
    if (action) filters.action = action;

    try {
      const logs = await strapi.entityService.findMany('api::activity-log.activity-log', {
        filters,
        sort: { createdAt: 'desc' },
        limit: Number(pageSize),
        offset: (Number(page) - 1) * Number(pageSize),
      });

      const total = await strapi.db.query('api::activity-log.activity-log').count({
        where: filters,
      });

      return {
        data: logs,
        meta: {
          pagination: {
            page: Number(page),
            pageSize: Number(pageSize),
            total,
            pageCount: Math.ceil(total / Number(pageSize)),
          },
        },
      };
    } catch (error) {
      strapi.log.error('Error fetching activity logs:', error);
      return ctx.badRequest('Failed to fetch activity logs');
    }
  },

  /**
   * Find one activity log
   */
  async findOne(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

    const { id } = ctx.params;

    try {
      const log = await strapi.entityService.findOne('api::activity-log.activity-log', id, {
        populate: ['user'],
      });

      if (!log) {
        return ctx.notFound('Activity log not found');
      }

      // Check ownership
      if (log.user?.id !== user.id) {
        return ctx.forbidden('You do not have access to this activity log');
      }

      return { data: log };
    } catch (error) {
      strapi.log.error('Error fetching activity log:', error);
      return ctx.badRequest('Failed to fetch activity log');
    }
  },
}));
