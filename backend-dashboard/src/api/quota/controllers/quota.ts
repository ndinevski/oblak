/**
 * Quota Controller
 * Handles HTTP requests for quota operations
 */

import { Strapi } from '@strapi/strapi';

// =============================================================================
// Types
// =============================================================================

interface Context {
  state: {
    user?: { id: number };
  };
  query: Record<string, unknown>;
  throw: (status: number, message: string) => never;
  body: unknown;
  status: number;
}

// =============================================================================
// Controller Factory
// =============================================================================

export default ({ strapi }: { strapi: Strapi }) => ({
  // ===========================================================================
  // Get Quota Info
  // ===========================================================================

  async getQuota(ctx: Context) {
    try {
      if (!ctx.state.user) {
        ctx.throw(401, 'Authentication required');
      }

      const quotaService = strapi.service('api::quota.quota');
      const quotaInfo = await quotaService.getQuotaInfo(ctx.state.user.id);

      ctx.body = { data: quotaInfo };
    } catch (error) {
      strapi.log.error('Error fetching quota:', error);
      ctx.status = 400;
      ctx.body = { error: { message: 'Failed to fetch quota information' } };
    }
  },

  // ===========================================================================
  // Get Usage Only
  // ===========================================================================

  async getUsage(ctx: Context) {
    try {
      if (!ctx.state.user) {
        ctx.throw(401, 'Authentication required');
      }

      const quotaService = strapi.service('api::quota.quota');
      const usage = await quotaService.getUsage(ctx.state.user.id);

      ctx.body = { data: usage };
    } catch (error) {
      strapi.log.error('Error fetching usage:', error);
      ctx.status = 400;
      ctx.body = { error: { message: 'Failed to fetch usage information' } };
    }
  },

  // ===========================================================================
  // Get Limits Only
  // ===========================================================================

  async getLimits(ctx: Context) {
    try {
      if (!ctx.state.user) {
        ctx.throw(401, 'Authentication required');
      }

      const quotaService = strapi.service('api::quota.quota');
      const limits = quotaService.getLimits(ctx.state.user.id);

      ctx.body = { data: limits };
    } catch (error) {
      strapi.log.error('Error fetching limits:', error);
      ctx.status = 400;
      ctx.body = { error: { message: 'Failed to fetch quota limits' } };
    }
  },
});
