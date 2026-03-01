/**
 * Virtual Machine Service
 * Business logic for VM operations and synchronization with Izvor
 */

import type { Core } from '@strapi/strapi';
import { createIzvorClient, IzvorVM, IzvorClientError } from './izvor-client';
import type { IzvorClient } from './izvor-client';

interface VMServiceConfig {
  quotaEnabled: boolean;
  maxVMsPerUser: number;
  maxCoresPerUser: number;
  maxMemoryPerUser: number; // in MB
  maxDiskPerUser: number; // in GB
  autoSync: boolean;
  syncInterval: number; // in seconds
}

export function createVMService(strapi: Strapi) {
  const izvorClient: IzvorClient = createIzvorClient(strapi);
  const logger = strapi.log;

  const config: VMServiceConfig = {
    quotaEnabled: process.env.VM_QUOTA_ENABLED !== 'false',
    maxVMsPerUser: parseInt(process.env.VM_MAX_PER_USER || '10', 10),
    maxCoresPerUser: parseInt(process.env.VM_MAX_CORES_PER_USER || '32', 10),
    maxMemoryPerUser: parseInt(process.env.VM_MAX_MEMORY_PER_USER || '32768', 10),
    maxDiskPerUser: parseInt(process.env.VM_MAX_DISK_PER_USER || '500', 10),
    autoSync: process.env.VM_AUTO_SYNC !== 'false',
    syncInterval: parseInt(process.env.VM_SYNC_INTERVAL || '60', 10),
  };

  // Helper to get current user's quota usage
  async function getUserQuotaUsage(userId: number) {
    const vms = await strapi.documents('api::virtual-machine.virtual-machine').findMany({
      filters: { owner: userId },
    });

    return {
      vmCount: vms.length,
      totalCores: vms.reduce((sum: number, vm: any) => sum + (vm.cores || 0), 0),
      totalMemory: vms.reduce((sum: number, vm: any) => sum + (vm.memoryMB || 0), 0),
      totalDisk: vms.reduce((sum: number, vm: any) => sum + (vm.diskGB || 0), 0),
    };
  }

  // Check if user can create VM with given specs
  async function checkQuota(userId: number, cores: number, memoryMB: number, diskGB: number) {
    if (!config.quotaEnabled) {
      return { allowed: true };
    }

    const usage = await getUserQuotaUsage(userId);

    const checks = [
      {
        resource: 'VMs',
        current: usage.vmCount,
        requested: 1,
        max: config.maxVMsPerUser,
      },
      {
        resource: 'CPU cores',
        current: usage.totalCores,
        requested: cores,
        max: config.maxCoresPerUser,
      },
      {
        resource: 'Memory (MB)',
        current: usage.totalMemory,
        requested: memoryMB,
        max: config.maxMemoryPerUser,
      },
      {
        resource: 'Disk (GB)',
        current: usage.totalDisk,
        requested: diskGB,
        max: config.maxDiskPerUser,
      },
    ];

    for (const check of checks) {
      if (check.current + check.requested > check.max) {
        return {
          allowed: false,
          reason: `${check.resource} quota exceeded. Current: ${check.current}, Requested: ${check.requested}, Max: ${check.max}`,
        };
      }
    }

    return { allowed: true };
  }

  // Map Izvor VM to Strapi VM format
  function mapIzvorVMToStrapi(izvorVM: IzvorVM) {
    return {
      name: izvorVM.name,
      description: izvorVM.description,
      status: izvorVM.status as 'running' | 'stopped' | 'paused' | 'starting' | 'stopping' | 'creating' | 'deleting' | 'error' | 'unknown',
      template: izvorVM.template,
      osType: izvorVM.os_type as 'linux' | 'windows' | 'other',
      cores: izvorVM.cores,
      memoryMB: izvorVM.memory,
      diskGB: Math.ceil(izvorVM.disk_size / (1024 * 1024 * 1024)), // bytes to GB
      ipAddress: izvorVM.ip_address,
      ipv6Address: izvorVM.ipv6_address,
      network: izvorVM.network,
      cloudInit: izvorVM.cloud_init || {},
      tags: izvorVM.tags || [],
      externalId: izvorVM.id,
      node: izvorVM.node,
      metadata: {
        vmid: izvorVM.vmid,
        macAddress: izvorVM.mac_address,
        cpuUsage: izvorVM.cpu_usage,
        memoryUsed: izvorVM.memory_used,
        diskUsed: izvorVM.disk_used,
        uptime: izvorVM.uptime,
        error: izvorVM.error,
        lastSync: new Date().toISOString(),
      },
    };
  }

  // Sync a single VM with Izvor
  async function syncVM(vmDocumentId: string) {
    const vm = await strapi.documents('api::virtual-machine.virtual-machine').findOne({
      documentId: vmDocumentId,
    });

    if (!vm || !vm.externalId) {
      logger.warn(`Cannot sync VM ${vmDocumentId}: no external ID`);
      return null;
    }

    try {
      const izvorVM = await izvorClient.getVM(vm.externalId);
      const updatedData = mapIzvorVMToStrapi(izvorVM);

      return await strapi.documents('api::virtual-machine.virtual-machine').update({
        documentId: vmDocumentId,
        data: updatedData as any,
      });
    } catch (error) {
      if (error instanceof IzvorClientError && error.statusCode === 404) {
        // VM no longer exists in Izvor
        logger.warn(`VM ${vmDocumentId} not found in Izvor, marking as deleted`);
        await strapi.documents('api::virtual-machine.virtual-machine').update({
          documentId: vmDocumentId,
          data: { status: 'deleting' } as any,
        });
        return null;
      }
      throw error;
    }
  }

  return {
    izvorClient,
    config,
    getUserQuotaUsage,
    checkQuota,
    syncVM,

    // Create VM
    async createVM(
      userId: number,
      data: {
        name: string;
        description?: string;
        template?: string;
        size?: string;
        cores?: number;
        memoryMB?: number;
        diskGB?: number;
        network?: string;
        cloudInit?: {
          user?: string;
          password?: string;
          sshKeys?: string[];
        };
        tags?: string[];
      }
    ) {
      // Get size specs if using predefined size
      let cores = data.cores || 1;
      let memoryMB = data.memoryMB || 1024;
      let diskGB = data.diskGB || 20;

      if (data.size && data.size !== 'custom') {
        const sizes = await izvorClient.listSizes();
        const sizeSpec = sizes.find(s => s.name === data.size);
        if (sizeSpec) {
          cores = sizeSpec.cores;
          memoryMB = sizeSpec.memory;
          diskGB = sizeSpec.disk;
        }
      }

      // Check quota
      const quotaCheck = await checkQuota(userId, cores, memoryMB, diskGB);
      if (!quotaCheck.allowed) {
        throw new Error(quotaCheck.reason);
      }

      // Create in Strapi first (with creating status)
      const strapiVM = await strapi.documents('api::virtual-machine.virtual-machine').create({
        data: {
          name: data.name,
          description: data.description,
          status: 'creating',
          template: data.template,
          size: data.size || 'custom',
          cores,
          memoryMB,
          diskGB,
          network: data.network || 'vmbr0',
          cloudInit: data.cloudInit || {},
          tags: data.tags || [],
          owner: userId,
        } as any,
      });

      try {
        // Create in Izvor
        const izvorVM = await izvorClient.createVM({
          name: data.name,
          template: data.template,
          size: data.size,
          cores: data.size === 'custom' ? cores : undefined,
          memory: data.size === 'custom' ? memoryMB : undefined,
          disk_size: data.size === 'custom' ? diskGB : undefined,
          network: data.network,
          cloud_init: data.cloudInit ? {
            user: data.cloudInit.user,
            password: data.cloudInit.password,
            ssh_keys: data.cloudInit.sshKeys,
          } : undefined,
          tags: data.tags,
          description: data.description,
        });

        // Update with Izvor data
        const updatedData = mapIzvorVMToStrapi(izvorVM);
        const updatedVM = await strapi.documents('api::virtual-machine.virtual-machine').update({
          documentId: strapiVM.documentId,
          data: {
            ...updatedData,
            owner: userId,
          } as any,
        });

        // Log activity
        await strapi.documents('api::activity-log.activity-log').create({
          data: {
            action: 'vm.create',
            resourceType: 'virtual-machine',
            resourceId: strapiVM.documentId,
            resourceName: data.name,
            details: {
              template: data.template,
              size: data.size,
              cores,
              memoryMB,
              diskGB,
            },
            user: userId,
          },
        });

        return updatedVM;
      } catch (error) {
        // Rollback Strapi VM on Izvor failure
        logger.error(`Failed to create VM in Izvor: ${error}`);
        await strapi.documents('api::virtual-machine.virtual-machine').update({
          documentId: strapiVM.documentId,
          data: { 
            status: 'error',
            metadata: {
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          } as any,
        });
        throw error;
      }
    },

    // Delete VM
    async deleteVM(vmDocumentId: string, userId: number) {
      const vm = await strapi.documents('api::virtual-machine.virtual-machine').findOne({
        documentId: vmDocumentId,
        populate: ['owner'],
      });

      if (!vm) {
        throw new Error('VM not found');
      }

      // Check ownership
      const vmOwner = vm.owner as { id: number } | undefined;
      if (vmOwner?.id !== userId) {
        throw new Error('Not authorized to delete this VM');
      }

      // Mark as deleting
      await strapi.documents('api::virtual-machine.virtual-machine').update({
        documentId: vmDocumentId,
        data: { status: 'deleting' } as any,
      });

      try {
        // Delete from Izvor
        if (vm.externalId) {
          await izvorClient.deleteVM(vm.externalId);
        }

        // Delete from Strapi
        await strapi.documents('api::virtual-machine.virtual-machine').delete({
          documentId: vmDocumentId,
        });

        // Log activity
        await strapi.documents('api::activity-log.activity-log').create({
          data: {
            action: 'vm.delete',
            resourceType: 'virtual-machine',
            resourceId: vmDocumentId,
            resourceName: vm.name,
            user: userId,
          },
        });

        return true;
      } catch (error) {
        // Revert status on failure
        await strapi.documents('api::virtual-machine.virtual-machine').update({
          documentId: vmDocumentId,
          data: { 
            status: 'error',
            metadata: {
              ...vm.metadata as Record<string, unknown>,
              error: error instanceof Error ? error.message : 'Delete failed',
            },
          } as any,
        });
        throw error;
      }
    },

    // VM Actions
    async performAction(
      vmDocumentId: string,
      action: 'start' | 'stop' | 'reboot' | 'pause' | 'resume',
      userId: number,
      options?: { force?: boolean }
    ) {
      const vm = await strapi.documents('api::virtual-machine.virtual-machine').findOne({
        documentId: vmDocumentId,
        populate: ['owner'],
      });

      if (!vm) {
        throw new Error('VM not found');
      }

      // Check ownership
      const vmOwner = vm.owner as { id: number } | undefined;
      if (vmOwner?.id !== userId) {
        throw new Error('Not authorized to perform this action');
      }

      if (!vm.externalId) {
        throw new Error('VM not yet provisioned');
      }

      // Update status to transitional state
      const statusMap: Record<string, string> = {
        start: 'starting',
        stop: 'stopping',
        reboot: 'stopping',
        pause: 'paused',
        resume: 'running',
      };

      await strapi.documents('api::virtual-machine.virtual-machine').update({
        documentId: vmDocumentId,
        data: { 
          status: statusMap[action] as 'starting' | 'stopping' | 'paused' | 'running',
          lastActionAt: new Date(),
        } as any,
      });

      try {
        // Perform action in Izvor
        switch (action) {
          case 'start':
            await izvorClient.startVM(vm.externalId);
            break;
          case 'stop':
            await izvorClient.stopVM(vm.externalId, options?.force);
            break;
          case 'reboot':
            await izvorClient.rebootVM(vm.externalId);
            break;
          case 'pause':
            await izvorClient.pauseVM(vm.externalId);
            break;
          case 'resume':
            await izvorClient.resumeVM(vm.externalId);
            break;
        }

        // Sync to get updated status
        await syncVM(vmDocumentId);

        // Log activity
        await strapi.documents('api::activity-log.activity-log').create({
          data: {
            action: `vm.${action}`,
            resourceType: 'virtual-machine',
            resourceId: vmDocumentId,
            resourceName: vm.name,
            details: { force: options?.force },
            user: userId,
          },
        });

        return await strapi.documents('api::virtual-machine.virtual-machine').findOne({
          documentId: vmDocumentId,
        });
      } catch (error) {
        // Sync to get actual status
        await syncVM(vmDocumentId);
        throw error;
      }
    },

    // Get console access
    async getConsole(vmDocumentId: string, userId: number, type: 'vnc' | 'spice' = 'vnc') {
      const vm = await strapi.documents('api::virtual-machine.virtual-machine').findOne({
        documentId: vmDocumentId,
        populate: ['owner'],
      });

      if (!vm) {
        throw new Error('VM not found');
      }

      // Check ownership
      const vmOwner = vm.owner as { id: number } | undefined;
      if (vmOwner?.id !== userId) {
        throw new Error('Not authorized to access console');
      }

      if (!vm.externalId) {
        throw new Error('VM not yet provisioned');
      }

      if (vm.status !== 'running') {
        throw new Error('VM must be running to access console');
      }

      return izvorClient.getConsole(vm.externalId, type);
    },

    // Get VM stats
    async getStats(vmDocumentId: string, userId: number) {
      const vm = await strapi.documents('api::virtual-machine.virtual-machine').findOne({
        documentId: vmDocumentId,
        populate: ['owner'],
      });

      if (!vm) {
        throw new Error('VM not found');
      }

      // Check ownership
      const vmOwner = vm.owner as { id: number } | undefined;
      if (vmOwner?.id !== userId) {
        throw new Error('Not authorized to view stats');
      }

      if (!vm.externalId) {
        throw new Error('VM not yet provisioned');
      }

      return izvorClient.getVMStats(vm.externalId);
    },

    // Snapshots
    async listSnapshots(vmDocumentId: string, userId: number) {
      const vm = await strapi.documents('api::virtual-machine.virtual-machine').findOne({
        documentId: vmDocumentId,
        populate: ['owner'],
      });

      if (!vm) {
        throw new Error('VM not found');
      }

      // Check ownership
      const vmOwner = vm.owner as { id: number } | undefined;
      if (vmOwner?.id !== userId) {
        throw new Error('Not authorized to view snapshots');
      }

      if (!vm.externalId) {
        throw new Error('VM not yet provisioned');
      }

      return izvorClient.listSnapshots(vm.externalId);
    },

    async createSnapshot(
      vmDocumentId: string,
      userId: number,
      data: { name: string; description?: string; includeMemory?: boolean }
    ) {
      const vm = await strapi.documents('api::virtual-machine.virtual-machine').findOne({
        documentId: vmDocumentId,
        populate: ['owner'],
      });

      if (!vm) {
        throw new Error('VM not found');
      }

      // Check ownership
      const vmOwner = vm.owner as { id: number } | undefined;
      if (vmOwner?.id !== userId) {
        throw new Error('Not authorized to create snapshots');
      }

      if (!vm.externalId) {
        throw new Error('VM not yet provisioned');
      }

      const snapshot = await izvorClient.createSnapshot(vm.externalId, {
        name: data.name,
        description: data.description,
        include_memory: data.includeMemory,
      });

      // Log activity
      await strapi.documents('api::activity-log.activity-log').create({
        data: {
          action: 'vm.snapshot.create',
          resourceType: 'virtual-machine',
          resourceId: vmDocumentId,
          resourceName: vm.name,
          details: { snapshotName: data.name },
          user: userId,
        },
      });

      return snapshot;
    },

    async restoreSnapshot(vmDocumentId: string, snapshotName: string, userId: number) {
      const vm = await strapi.documents('api::virtual-machine.virtual-machine').findOne({
        documentId: vmDocumentId,
        populate: ['owner'],
      });

      if (!vm) {
        throw new Error('VM not found');
      }

      // Check ownership
      const vmOwner = vm.owner as { id: number } | undefined;
      if (vmOwner?.id !== userId) {
        throw new Error('Not authorized to restore snapshots');
      }

      if (!vm.externalId) {
        throw new Error('VM not yet provisioned');
      }

      await izvorClient.restoreSnapshot(vm.externalId, snapshotName);

      // Sync to get updated state
      await syncVM(vmDocumentId);

      // Log activity
      await strapi.documents('api::activity-log.activity-log').create({
        data: {
          action: 'vm.snapshot.restore',
          resourceType: 'virtual-machine',
          resourceId: vmDocumentId,
          resourceName: vm.name,
          details: { snapshotName },
          user: userId,
        },
      });

      return true;
    },

    async deleteSnapshot(vmDocumentId: string, snapshotName: string, userId: number) {
      const vm = await strapi.documents('api::virtual-machine.virtual-machine').findOne({
        documentId: vmDocumentId,
        populate: ['owner'],
      });

      if (!vm) {
        throw new Error('VM not found');
      }

      // Check ownership
      const vmOwner = vm.owner as { id: number } | undefined;
      if (vmOwner?.id !== userId) {
        throw new Error('Not authorized to delete snapshots');
      }

      if (!vm.externalId) {
        throw new Error('VM not yet provisioned');
      }

      await izvorClient.deleteSnapshot(vm.externalId, snapshotName);

      // Log activity
      await strapi.documents('api::activity-log.activity-log').create({
        data: {
          action: 'vm.snapshot.delete',
          resourceType: 'virtual-machine',
          resourceId: vmDocumentId,
          resourceName: vm.name,
          details: { snapshotName },
          user: userId,
        },
      });

      return true;
    },

    // Templates and sizes
    async getTemplates() {
      return izvorClient.listTemplates();
    },

    async getSizes() {
      return izvorClient.listSizes();
    },

    // Health check
    async checkHealth() {
      return izvorClient.health();
    },
  };
}

export type VMService = ReturnType<typeof createVMService>;
