/**
 * Virtual Machine Controller
 * Handles HTTP requests for VM operations
 */

import type { Core } from '@strapi/strapi';
import { createVMService } from '../services/virtual-machine';
import type { VMService } from '../services/virtual-machine';
import { IzvorClientError } from '../services/izvor-client';

let vmService: VMService;

function getVMService(strapi: Strapi): VMService {
  if (!vmService) {
    vmService = createVMService(strapi);
  }
  return vmService;
}

function getStrapi(ctx: any): Strapi {
  const instance = ctx?.strapi || (globalThis as any).strapi;
  if (!instance) {
    throw new Error('Strapi instance is not available');
  }
  return instance as Strapi;
}

function handleError(ctx: any, error: unknown) {
  if (error instanceof IzvorClientError) {
    ctx.status = error.statusCode;
    ctx.body = {
      error: {
        message: error.message,
        code: error.code,
        details: error.details,
      },
    };
    return;
  }

  if (error instanceof Error) {
    if (error.message.includes('quota')) {
      ctx.status = 403;
      ctx.body = { error: { message: error.message, code: 'QUOTA_EXCEEDED' } };
      return;
    }

    if (error.message.includes('Not authorized')) {
      ctx.status = 403;
      ctx.body = { error: { message: error.message, code: 'FORBIDDEN' } };
      return;
    }

    if (error.message.includes('not found') || error.message.includes('Not found')) {
      ctx.status = 404;
      ctx.body = { error: { message: error.message, code: 'NOT_FOUND' } };
      return;
    }

    ctx.status = 400;
    ctx.body = { error: { message: error.message } };
    return;
  }

  ctx.status = 500;
  ctx.body = { error: { message: 'Internal server error' } };
}

export default {
  // List VMs for current user
  async find(ctx: any) {
    const strapi = getStrapi(ctx);
    const userId = ctx.state.user?.id;

    if (!userId) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Authentication required' } };
      return;
    }

    try {
      const { page = 1, pageSize = 25, status, search, sort = 'createdAt:desc' } = ctx.query;

      const filters: Record<string, unknown> = { owner: userId };
      if (status) filters.status = status;
      if (search) {
        filters.$or = [
          { name: { $containsi: search } },
          { description: { $containsi: search } },
        ];
      }

      const [sortField, sortOrder] = (sort as string).split(':');

      const vms = await strapi.documents('api::virtual-machine.virtual-machine').findMany({
        filters: filters as any,
        sort: { [sortField]: sortOrder || 'desc' } as any,
        start: (Number(page) - 1) * Number(pageSize),
        limit: Number(pageSize),
      });

      const total = await strapi.documents('api::virtual-machine.virtual-machine').count({
        filters: filters as any,
      });

      ctx.body = {
        data: vms,
        meta: {
          pagination: {
            page: Number(page),
            pageSize: Number(pageSize),
            pageCount: Math.ceil(total / Number(pageSize)),
            total,
          },
        },
      };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // Get single VM
  async findOne(ctx: any) {
    const { strapi } = ctx;
    const { id } = ctx.params;
    const userId = ctx.state.user?.id;

    if (!userId) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Authentication required' } };
      return;
    }

    try {
      const vm = await strapi.documents('api::virtual-machine.virtual-machine').findOne({
        documentId: id,
        populate: ['owner'],
      });

      if (!vm) {
        ctx.status = 404;
        ctx.body = { error: { message: 'VM not found' } };
        return;
      }

      // Check ownership
      const vmOwner = vm.owner as { id: number } | undefined;
      if (vmOwner?.id !== userId) {
        ctx.status = 403;
        ctx.body = { error: { message: 'Not authorized to view this VM' } };
        return;
      }

      ctx.body = { data: vm };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // Create VM
  async create(ctx: any) {
    const { strapi } = ctx;
    const userId = ctx.state.user?.id;

    if (!userId) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Authentication required' } };
      return;
    }

    try {
      const service = getVMService(strapi);
      const vm = await service.createVM(userId, ctx.request.body);

      ctx.status = 201;
      ctx.body = { data: vm };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // Update VM (metadata only, not hardware)
  async update(ctx: any) {
    const { strapi } = ctx;
    const { id } = ctx.params;
    const userId = ctx.state.user?.id;

    if (!userId) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Authentication required' } };
      return;
    }

    try {
      const vm = await strapi.documents('api::virtual-machine.virtual-machine').findOne({
        documentId: id,
        populate: ['owner'],
      });

      if (!vm) {
        ctx.status = 404;
        ctx.body = { error: { message: 'VM not found' } };
        return;
      }

      // Check ownership
      const vmOwner = vm.owner as { id: number } | undefined;
      if (vmOwner?.id !== userId) {
        ctx.status = 403;
        ctx.body = { error: { message: 'Not authorized to update this VM' } };
        return;
      }

      // Only allow updating certain fields
      const allowedFields = ['name', 'description', 'tags'];
      const updateData: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (ctx.request.body[field] !== undefined) {
          updateData[field] = ctx.request.body[field];
        }
      }

      const updatedVM = await strapi.documents('api::virtual-machine.virtual-machine').update({
        documentId: id,
        data: updateData,
      });

      ctx.body = { data: updatedVM };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // Delete VM
  async delete(ctx: any) {
    const { strapi } = ctx;
    const { id } = ctx.params;
    const userId = ctx.state.user?.id;

    if (!userId) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Authentication required' } };
      return;
    }

    try {
      const service = getVMService(strapi);
      await service.deleteVM(id, userId);

      ctx.status = 204;
      ctx.body = null;
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // Start VM
  async start(ctx: any) {
    const { strapi } = ctx;
    const { id } = ctx.params;
    const userId = ctx.state.user?.id;

    if (!userId) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Authentication required' } };
      return;
    }

    try {
      const service = getVMService(strapi);
      const vm = await service.performAction(id, 'start', userId);

      ctx.body = { data: vm };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // Stop VM
  async stop(ctx: any) {
    const { strapi } = ctx;
    const { id } = ctx.params;
    const userId = ctx.state.user?.id;
    const { force } = ctx.request.body || {};

    if (!userId) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Authentication required' } };
      return;
    }

    try {
      const service = getVMService(strapi);
      const vm = await service.performAction(id, 'stop', userId, { force });

      ctx.body = { data: vm };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // Reboot VM
  async reboot(ctx: any) {
    const { strapi } = ctx;
    const { id } = ctx.params;
    const userId = ctx.state.user?.id;

    if (!userId) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Authentication required' } };
      return;
    }

    try {
      const service = getVMService(strapi);
      const vm = await service.performAction(id, 'reboot', userId);

      ctx.body = { data: vm };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // Pause VM
  async pause(ctx: any) {
    const { strapi } = ctx;
    const { id } = ctx.params;
    const userId = ctx.state.user?.id;

    if (!userId) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Authentication required' } };
      return;
    }

    try {
      const service = getVMService(strapi);
      const vm = await service.performAction(id, 'pause', userId);

      ctx.body = { data: vm };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // Resume VM
  async resume(ctx: any) {
    const { strapi } = ctx;
    const { id } = ctx.params;
    const userId = ctx.state.user?.id;

    if (!userId) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Authentication required' } };
      return;
    }

    try {
      const service = getVMService(strapi);
      const vm = await service.performAction(id, 'resume', userId);

      ctx.body = { data: vm };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // Get console access
  async console(ctx: any) {
    const { strapi } = ctx;
    const { id } = ctx.params;
    const userId = ctx.state.user?.id;
    const { type = 'vnc' } = ctx.query;

    if (!userId) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Authentication required' } };
      return;
    }

    try {
      const service = getVMService(strapi);
      const consoleInfo = await service.getConsole(id, userId, type as 'vnc' | 'spice');

      ctx.body = { data: consoleInfo };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // Get VM stats
  async stats(ctx: any) {
    const { strapi } = ctx;
    const { id } = ctx.params;
    const userId = ctx.state.user?.id;

    if (!userId) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Authentication required' } };
      return;
    }

    try {
      const service = getVMService(strapi);
      const stats = await service.getStats(id, userId);

      ctx.body = { data: stats };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // List snapshots
  async listSnapshots(ctx: any) {
    const { strapi } = ctx;
    const { id } = ctx.params;
    const userId = ctx.state.user?.id;

    if (!userId) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Authentication required' } };
      return;
    }

    try {
      const service = getVMService(strapi);
      const snapshots = await service.listSnapshots(id, userId);

      ctx.body = { data: snapshots };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // Create snapshot
  async createSnapshot(ctx: any) {
    const { strapi } = ctx;
    const { id } = ctx.params;
    const userId = ctx.state.user?.id;

    if (!userId) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Authentication required' } };
      return;
    }

    try {
      const service = getVMService(strapi);
      const snapshot = await service.createSnapshot(id, userId, ctx.request.body);

      ctx.status = 201;
      ctx.body = { data: snapshot };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // Restore snapshot
  async restoreSnapshot(ctx: any) {
    const { strapi } = ctx;
    const { id, snapshotName } = ctx.params;
    const userId = ctx.state.user?.id;

    if (!userId) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Authentication required' } };
      return;
    }

    try {
      const service = getVMService(strapi);
      await service.restoreSnapshot(id, snapshotName, userId);

      ctx.body = { message: 'Snapshot restored successfully' };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // Delete snapshot
  async deleteSnapshot(ctx: any) {
    const { strapi } = ctx;
    const { id, snapshotName } = ctx.params;
    const userId = ctx.state.user?.id;

    if (!userId) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Authentication required' } };
      return;
    }

    try {
      const service = getVMService(strapi);
      await service.deleteSnapshot(id, snapshotName, userId);

      ctx.status = 204;
      ctx.body = null;
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // Get templates
  async templates(ctx: any) {
    const { strapi } = ctx;

    try {
      const service = getVMService(strapi);
      const templates = await service.getTemplates();

      ctx.body = { data: templates };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // Get sizes
  async sizes(ctx: any) {
    const { strapi } = ctx;

    try {
      const service = getVMService(strapi);
      const sizes = await service.getSizes();

      ctx.body = { data: sizes };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // Sync VM with Izvor
  async sync(ctx: any) {
    const { strapi } = ctx;
    const { id } = ctx.params;
    const userId = ctx.state.user?.id;

    if (!userId) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Authentication required' } };
      return;
    }

    try {
      const vm = await strapi.documents('api::virtual-machine.virtual-machine').findOne({
        documentId: id,
        populate: ['owner'],
      });

      if (!vm) {
        ctx.status = 404;
        ctx.body = { error: { message: 'VM not found' } };
        return;
      }

      // Check ownership
      const vmOwner = vm.owner as { id: number } | undefined;
      if (vmOwner?.id !== userId) {
        ctx.status = 403;
        ctx.body = { error: { message: 'Not authorized to sync this VM' } };
        return;
      }

      const service = getVMService(strapi);
      const syncedVM = await service.syncVM(id);

      ctx.body = { data: syncedVM };
    } catch (error) {
      handleError(ctx, error);
    }
  },
};
