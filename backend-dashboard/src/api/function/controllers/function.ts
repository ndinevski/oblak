/**
 * Function controller
 * Handles HTTP requests for function operations
 */

export default ({ strapi }: { strapi: any }) => ({
  /**
   * Find all functions for the current user
   */
  async find(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

    const { page = 1, pageSize = 25, search, runtime, status } = ctx.query;

    try {
      const functions = await strapi.service('api::function.function').findByOwner(user.id, {
        page: Number(page),
        pageSize: Number(pageSize),
        search: search ? String(search) : undefined,
        runtime: runtime ? String(runtime) : undefined,
        status: status ? String(status) : undefined,
      });

      const total = await strapi.service('api::function.function').countByOwner(user.id, {
        search: search ? String(search) : undefined,
        runtime: runtime ? String(runtime) : undefined,
        status: status ? String(status) : undefined,
      });

      return {
        data: functions,
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
      strapi.log.error('Error finding functions:', error);
      return ctx.badRequest('Failed to fetch functions');
    }
  },

  /**
   * Find one function by ID
   */
  async findOne(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

    const { id } = ctx.params;

    try {
      const fn = await strapi.entityService.findOne('api::function.function', id, {
        populate: ['owner'],
      });

      if (!fn) {
        return ctx.notFound('Function not found');
      }

      // Check ownership
      if (fn.owner?.id !== user.id) {
        return ctx.forbidden('You do not have access to this function');
      }

      return { data: fn };
    } catch (error) {
      strapi.log.error('Error finding function:', error);
      return ctx.badRequest('Failed to fetch function');
    }
  },

  /**
   * Find function by name
   */
  async findByName(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

    const { name } = ctx.params;

    try {
      const fn = await strapi.service('api::function.function').findByName(name);

      if (!fn) {
        return ctx.notFound('Function not found');
      }

      // Populate owner for access check
      const fnWithOwner = await strapi.entityService.findOne('api::function.function', fn.documentId, {
        populate: ['owner'],
      });

      // Check ownership
      if (fnWithOwner?.owner?.id !== user.id) {
        return ctx.forbidden('You do not have access to this function');
      }

      return { data: fnWithOwner };
    } catch (error) {
      strapi.log.error('Error finding function by name:', error);
      return ctx.badRequest('Failed to fetch function');
    }
  },

  /**
   * Create a new function
   */
  async create(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

    const { name, description, runtime, handler, code, memoryMB, timeoutSec, environment } = ctx.request.body;

    // Validate required fields
    if (!name || !runtime || !handler) {
      return ctx.badRequest('Name, runtime, and handler are required');
    }

    // Validate name format
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name) || name.length < 2 || name.length > 63) {
      return ctx.badRequest('Name must be 2-63 characters, lowercase alphanumeric with hyphens');
    }

    // Check quota
    const currentCount = await strapi.service('api::function.function').countByOwner(user.id);
    const maxFunctions = user.quotas?.maxFunctions || 10;
    if (currentCount >= maxFunctions) {
      return ctx.forbidden(`You have reached your function quota (${maxFunctions})`);
    }

    // Check if name already exists
    const existing = await strapi.service('api::function.function').findByName(name);
    if (existing) {
      return ctx.badRequest('A function with this name already exists');
    }

    try {
      const fn = await strapi.service('api::function.function').createWithSync({
        name,
        description,
        runtime,
        handler,
        code,
        memoryMB,
        timeoutSec,
        environment,
        owner: user.id,
      });

      return { data: fn };
    } catch (error) {
      strapi.log.error('Error creating function:', error);
      return ctx.badRequest((error as Error).message || 'Failed to create function');
    }
  },

  /**
   * Update a function
   */
  async update(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

    const { id } = ctx.params;
    const { description, runtime, handler, code, memoryMB, timeoutSec, environment } = ctx.request.body;

    // Check ownership
    const existing = await strapi.entityService.findOne('api::function.function', id, {
      populate: ['owner'],
    });

    if (!existing) {
      return ctx.notFound('Function not found');
    }

    if (existing.owner?.id !== user.id) {
      return ctx.forbidden('You do not have access to this function');
    }

    try {
      const fn = await strapi.service('api::function.function').updateWithSync(
        id,
        { description, runtime, handler, code, memoryMB, timeoutSec, environment },
        user.id
      );

      return { data: fn };
    } catch (error) {
      strapi.log.error('Error updating function:', error);
      return ctx.badRequest((error as Error).message || 'Failed to update function');
    }
  },

  /**
   * Delete a function
   */
  async delete(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

    const { id } = ctx.params;

    // Check ownership
    const existing = await strapi.entityService.findOne('api::function.function', id, {
      populate: ['owner'],
    });

    if (!existing) {
      return ctx.notFound('Function not found');
    }

    if (existing.owner?.id !== user.id) {
      return ctx.forbidden('You do not have access to this function');
    }

    try {
      await strapi.service('api::function.function').deleteWithSync(id, user.id);
      return { data: { success: true, name: existing.name } };
    } catch (error) {
      strapi.log.error('Error deleting function:', error);
      return ctx.badRequest((error as Error).message || 'Failed to delete function');
    }
  },

  /**
   * Invoke a function
   */
  async invoke(ctx: any) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

    const { id } = ctx.params;
    const payload = ctx.request.body || {};
    const { local } = ctx.query;

    // Check ownership
    const existing = await strapi.entityService.findOne('api::function.function', id, {
      populate: ['owner'],
    });

    if (!existing) {
      return ctx.notFound('Function not found');
    }

    if (existing.owner?.id !== user.id) {
      return ctx.forbidden('You do not have access to this function');
    }

    try {
      const result = await strapi.service('api::function.function').invoke(
        id,
        payload,
        user.id,
        { local: local === 'true' }
      );

      return { data: result };
    } catch (error) {
      strapi.log.error('Error invoking function:', error);
      return ctx.badRequest((error as Error).message || 'Failed to invoke function');
    }
  },
});
