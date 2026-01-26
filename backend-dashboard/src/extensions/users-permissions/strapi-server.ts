/**
 * Users-Permissions plugin extension
 * Customizes authentication behavior for Oblak Dashboard
 */

import type { Strapi } from '@strapi/strapi';

export default (plugin: any) => {
  // Store original controller methods
  const originalAuthController = plugin.controllers.auth;

  // Extend the auth controller
  plugin.controllers.auth = (ctx: { strapi: Strapi }) => {
    const original = originalAuthController(ctx);

    return {
      ...original,

      /**
       * Custom callback after successful login
       * Adds additional user data to the response
       */
      async callback(ctx: any) {
        // Call original callback
        await original.callback(ctx);

        // If successful, add additional info
        if (ctx.body?.user) {
          const user = ctx.body.user;

          // Add user's created resource counts (will be populated when resources are created)
          ctx.body.user = {
            ...user,
            meta: {
              loginTime: new Date().toISOString(),
            },
          };
        }
      },

      /**
       * Custom registration handler
       * Validates additional fields and sets defaults
       */
      async register(ctx: any) {
        const { organization } = ctx.request.body;

        // Set default organization if not provided
        if (!organization) {
          ctx.request.body.organization = 'Personal';
        }

        // Call original register
        await original.register(ctx);

        // Log registration for audit
        if (ctx.body?.user) {
          ctx.strapi.log.info(`New user registered: ${ctx.body.user.email}`);
        }
      },
    };
  };

  // Extend content types (add custom fields)
  plugin.contentTypes.user.schema.attributes = {
    ...plugin.contentTypes.user.schema.attributes,
    // Organization name
    organization: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      default: 'Personal',
    },
    // Resource quotas
    quotas: {
      type: 'json',
      default: {
        maxFunctions: 10,
        maxVMs: 5,
        maxBuckets: 10,
        maxStorageGB: 50,
      },
    },
    // Last login timestamp
    lastLoginAt: {
      type: 'datetime',
    },
  };

  return plugin;
};
