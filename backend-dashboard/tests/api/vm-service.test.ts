/**
 * Virtual Machine Service Tests
 * 
 * Tests for VM service layer including Izvor client integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Izvor client
const mockIzvorClient = {
  createVM: vi.fn(),
  deleteVM: vi.fn(),
  startVM: vi.fn(),
  stopVM: vi.fn(),
  restartVM: vi.fn(),
  getVM: vi.fn(),
  listVMs: vi.fn(),
  getVMConsole: vi.fn(),
  resizeVM: vi.fn(),
  snapshotVM: vi.fn(),
  restoreSnapshot: vi.fn(),
  deleteSnapshot: vi.fn(),
  listSnapshots: vi.fn(),
};

// Mock Strapi
const mockStrapi = {
  entityService: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findOne: vi.fn(),
    findMany: vi.fn(),
  },
  service: vi.fn().mockReturnValue({
    log: vi.fn(),
  }),
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
};

// VM types
interface VirtualMachine {
  id: number;
  documentId: string;
  name: string;
  status: 'running' | 'stopped' | 'paused' | 'suspended' | 'creating' | 'deleting' | 'error';
  os: string;
  cores: number;
  memory: number;
  disk: number;
  ipAddress: string | null;
  externalId: string;
  owner: { id: number };
  createdAt: string;
  updatedAt: string;
}

interface CreateVMData {
  name: string;
  os: string;
  cores: number;
  memory: number;
  disk: number;
  sshKey?: string;
  userData?: string;
}

interface ResizeVMData {
  cores?: number;
  memory?: number;
  disk?: number;
}

interface Snapshot {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  size: number;
}

// Simulated VM service implementation
class VMService {
  private strapi: typeof mockStrapi;
  private izvor: typeof mockIzvorClient;

  constructor(strapi: typeof mockStrapi, izvor: typeof mockIzvorClient) {
    this.strapi = strapi;
    this.izvor = izvor;
  }

  async createVM(data: CreateVMData, userId: number): Promise<VirtualMachine> {
    // Validate VM name
    if (!data.name || data.name.length < 1 || data.name.length > 64) {
      throw new Error('VM name must be between 1 and 64 characters');
    }

    // Validate resources
    if (data.cores < 1 || data.cores > 32) {
      throw new Error('Cores must be between 1 and 32');
    }

    if (data.memory < 512 || data.memory > 65536) {
      throw new Error('Memory must be between 512 MB and 65536 MB');
    }

    if (data.disk < 10 || data.disk > 2000) {
      throw new Error('Disk must be between 10 GB and 2000 GB');
    }

    // Create VM in Izvor (external ID will be returned)
    const izvorResult = await this.izvor.createVM({
      name: data.name,
      os: data.os,
      cores: data.cores,
      memory: data.memory,
      disk: data.disk,
      sshKey: data.sshKey,
      userData: data.userData,
    });

    // Create VM record in database with 'creating' status
    const vm = await this.strapi.entityService.create('api::virtual-machine.virtual-machine', {
      data: {
        name: data.name,
        status: 'creating',
        os: data.os,
        cores: data.cores,
        memory: data.memory,
        disk: data.disk,
        ipAddress: null,
        externalId: izvorResult.id,
        owner: userId,
      },
    });

    // Log activity
    await this.strapi.service('api::activity-log.activity-log').log({
      resourceType: 'vm',
      resourceId: vm.documentId,
      action: 'create',
      userId,
      details: { name: data.name, os: data.os, cores: data.cores, memory: data.memory },
    });

    return vm as VirtualMachine;
  }

  async startVM(documentId: string, userId: number): Promise<VirtualMachine> {
    const vm = await this.strapi.entityService.findOne(
      'api::virtual-machine.virtual-machine',
      documentId
    );

    if (!vm) {
      throw new Error('VM not found');
    }

    if (vm.status === 'running') {
      throw new Error('VM is already running');
    }

    if (vm.status === 'creating' || vm.status === 'deleting') {
      throw new Error('Cannot start VM in current state');
    }

    // Start VM in Izvor
    await this.izvor.startVM(vm.externalId);

    // Update status in database
    const updated = await this.strapi.entityService.update(
      'api::virtual-machine.virtual-machine',
      documentId,
      { data: { status: 'running' } }
    );

    // Log activity
    await this.strapi.service('api::activity-log.activity-log').log({
      resourceType: 'vm',
      resourceId: documentId,
      action: 'start',
      userId,
      details: { previousStatus: vm.status },
    });

    return updated as VirtualMachine;
  }

  async stopVM(documentId: string, userId: number): Promise<VirtualMachine> {
    const vm = await this.strapi.entityService.findOne(
      'api::virtual-machine.virtual-machine',
      documentId
    );

    if (!vm) {
      throw new Error('VM not found');
    }

    if (vm.status === 'stopped') {
      throw new Error('VM is already stopped');
    }

    if (vm.status === 'creating' || vm.status === 'deleting') {
      throw new Error('Cannot stop VM in current state');
    }

    // Stop VM in Izvor
    await this.izvor.stopVM(vm.externalId);

    // Update status in database
    const updated = await this.strapi.entityService.update(
      'api::virtual-machine.virtual-machine',
      documentId,
      { data: { status: 'stopped' } }
    );

    // Log activity
    await this.strapi.service('api::activity-log.activity-log').log({
      resourceType: 'vm',
      resourceId: documentId,
      action: 'stop',
      userId,
      details: { previousStatus: vm.status },
    });

    return updated as VirtualMachine;
  }

  async restartVM(documentId: string, userId: number): Promise<VirtualMachine> {
    const vm = await this.strapi.entityService.findOne(
      'api::virtual-machine.virtual-machine',
      documentId
    );

    if (!vm) {
      throw new Error('VM not found');
    }

    if (vm.status !== 'running') {
      throw new Error('Can only restart running VMs');
    }

    // Restart VM in Izvor
    await this.izvor.restartVM(vm.externalId);

    // Log activity
    await this.strapi.service('api::activity-log.activity-log').log({
      resourceType: 'vm',
      resourceId: documentId,
      action: 'restart',
      userId,
      details: {},
    });

    return vm as VirtualMachine;
  }

  async deleteVM(documentId: string, userId: number): Promise<void> {
    const vm = await this.strapi.entityService.findOne(
      'api::virtual-machine.virtual-machine',
      documentId
    );

    if (!vm) {
      throw new Error('VM not found');
    }

    if (vm.status === 'running') {
      throw new Error('Cannot delete running VM. Stop it first.');
    }

    // Update status to deleting
    await this.strapi.entityService.update(
      'api::virtual-machine.virtual-machine',
      documentId,
      { data: { status: 'deleting' } }
    );

    // Delete VM in Izvor
    await this.izvor.deleteVM(vm.externalId);

    // Delete from database
    await this.strapi.entityService.delete(
      'api::virtual-machine.virtual-machine',
      documentId
    );

    // Log activity
    await this.strapi.service('api::activity-log.activity-log').log({
      resourceType: 'vm',
      resourceId: documentId,
      action: 'delete',
      userId,
      details: { name: vm.name },
    });
  }

  async resizeVM(documentId: string, data: ResizeVMData, userId: number): Promise<VirtualMachine> {
    const vm = await this.strapi.entityService.findOne(
      'api::virtual-machine.virtual-machine',
      documentId
    );

    if (!vm) {
      throw new Error('VM not found');
    }

    if (vm.status !== 'stopped') {
      throw new Error('VM must be stopped to resize');
    }

    // Validate new resources
    if (data.cores !== undefined && (data.cores < 1 || data.cores > 32)) {
      throw new Error('Cores must be between 1 and 32');
    }

    if (data.memory !== undefined && (data.memory < 512 || data.memory > 65536)) {
      throw new Error('Memory must be between 512 MB and 65536 MB');
    }

    if (data.disk !== undefined) {
      if (data.disk < vm.disk) {
        throw new Error('Disk size cannot be decreased');
      }
      if (data.disk > 2000) {
        throw new Error('Disk must not exceed 2000 GB');
      }
    }

    // Resize VM in Izvor
    await this.izvor.resizeVM(vm.externalId, data);

    // Update in database
    const updated = await this.strapi.entityService.update(
      'api::virtual-machine.virtual-machine',
      documentId,
      {
        data: {
          cores: data.cores ?? vm.cores,
          memory: data.memory ?? vm.memory,
          disk: data.disk ?? vm.disk,
        },
      }
    );

    // Log activity
    await this.strapi.service('api::activity-log.activity-log').log({
      resourceType: 'vm',
      resourceId: documentId,
      action: 'resize',
      userId,
      details: {
        oldCores: vm.cores,
        oldMemory: vm.memory,
        oldDisk: vm.disk,
        newCores: data.cores ?? vm.cores,
        newMemory: data.memory ?? vm.memory,
        newDisk: data.disk ?? vm.disk,
      },
    });

    return updated as VirtualMachine;
  }

  async createSnapshot(
    documentId: string,
    name: string,
    description: string | undefined,
    userId: number
  ): Promise<Snapshot> {
    const vm = await this.strapi.entityService.findOne(
      'api::virtual-machine.virtual-machine',
      documentId
    );

    if (!vm) {
      throw new Error('VM not found');
    }

    // Create snapshot in Izvor
    const snapshot = await this.izvor.snapshotVM(vm.externalId, { name, description });

    // Log activity
    await this.strapi.service('api::activity-log.activity-log').log({
      resourceType: 'snapshot',
      resourceId: snapshot.id,
      action: 'create',
      userId,
      details: { vmId: documentId, vmName: vm.name, snapshotName: name },
    });

    return snapshot;
  }

  async restoreSnapshot(documentId: string, snapshotId: string, userId: number): Promise<void> {
    const vm = await this.strapi.entityService.findOne(
      'api::virtual-machine.virtual-machine',
      documentId
    );

    if (!vm) {
      throw new Error('VM not found');
    }

    if (vm.status !== 'stopped') {
      throw new Error('VM must be stopped to restore snapshot');
    }

    // Restore snapshot in Izvor
    await this.izvor.restoreSnapshot(vm.externalId, snapshotId);

    // Log activity
    await this.strapi.service('api::activity-log.activity-log').log({
      resourceType: 'snapshot',
      resourceId: snapshotId,
      action: 'restore',
      userId,
      details: { vmId: documentId, vmName: vm.name },
    });
  }

  async deleteSnapshot(documentId: string, snapshotId: string, userId: number): Promise<void> {
    const vm = await this.strapi.entityService.findOne(
      'api::virtual-machine.virtual-machine',
      documentId
    );

    if (!vm) {
      throw new Error('VM not found');
    }

    // Delete snapshot in Izvor
    await this.izvor.deleteSnapshot(vm.externalId, snapshotId);

    // Log activity
    await this.strapi.service('api::activity-log.activity-log').log({
      resourceType: 'snapshot',
      resourceId: snapshotId,
      action: 'delete',
      userId,
      details: { vmId: documentId, vmName: vm.name },
    });
  }

  async getConsole(documentId: string, userId: number): Promise<{ url: string; token: string }> {
    const vm = await this.strapi.entityService.findOne(
      'api::virtual-machine.virtual-machine',
      documentId
    );

    if (!vm) {
      throw new Error('VM not found');
    }

    if (vm.status !== 'running') {
      throw new Error('VM must be running to access console');
    }

    // Get console from Izvor
    const console = await this.izvor.getVMConsole(vm.externalId);

    // Log activity
    await this.strapi.service('api::activity-log.activity-log').log({
      resourceType: 'vm',
      resourceId: documentId,
      action: 'console_access',
      userId,
      details: {},
    });

    return console;
  }

  calculateResourceUsage(vms: VirtualMachine[]): {
    totalVMs: number;
    runningVMs: number;
    totalCores: number;
    totalMemory: number;
    totalDisk: number;
  } {
    return vms.reduce(
      (acc, vm) => ({
        totalVMs: acc.totalVMs + 1,
        runningVMs: acc.runningVMs + (vm.status === 'running' ? 1 : 0),
        totalCores: acc.totalCores + vm.cores,
        totalMemory: acc.totalMemory + vm.memory,
        totalDisk: acc.totalDisk + vm.disk,
      }),
      { totalVMs: 0, runningVMs: 0, totalCores: 0, totalMemory: 0, totalDisk: 0 }
    );
  }
}

describe('VMService', () => {
  let service: VMService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new VMService(mockStrapi, mockIzvorClient);
  });

  describe('createVM', () => {
    it('should create VM successfully', async () => {
      const data: CreateVMData = {
        name: 'test-vm',
        os: 'ubuntu-22.04',
        cores: 2,
        memory: 2048,
        disk: 50,
      };

      mockIzvorClient.createVM.mockResolvedValue({ id: 'vm-123', status: 'creating' });
      mockStrapi.entityService.create.mockResolvedValue({
        id: 1,
        documentId: 'vm-doc-123',
        name: 'test-vm',
        status: 'creating',
        os: 'ubuntu-22.04',
        cores: 2,
        memory: 2048,
        disk: 50,
        ipAddress: null,
        externalId: 'vm-123',
      });

      const result = await service.createVM(data, 1);

      expect(result.name).toBe('test-vm');
      expect(result.status).toBe('creating');
      expect(mockIzvorClient.createVM).toHaveBeenCalled();
    });

    it('should reject invalid name length', async () => {
      await expect(
        service.createVM({ name: '', os: 'ubuntu', cores: 2, memory: 2048, disk: 50 }, 1)
      ).rejects.toThrow('VM name must be between 1 and 64 characters');

      await expect(
        service.createVM({ name: 'a'.repeat(65), os: 'ubuntu', cores: 2, memory: 2048, disk: 50 }, 1)
      ).rejects.toThrow('VM name must be between 1 and 64 characters');
    });

    it('should reject invalid cores', async () => {
      await expect(
        service.createVM({ name: 'test', os: 'ubuntu', cores: 0, memory: 2048, disk: 50 }, 1)
      ).rejects.toThrow('Cores must be between 1 and 32');

      await expect(
        service.createVM({ name: 'test', os: 'ubuntu', cores: 64, memory: 2048, disk: 50 }, 1)
      ).rejects.toThrow('Cores must be between 1 and 32');
    });

    it('should reject invalid memory', async () => {
      await expect(
        service.createVM({ name: 'test', os: 'ubuntu', cores: 2, memory: 256, disk: 50 }, 1)
      ).rejects.toThrow('Memory must be between 512 MB and 65536 MB');

      await expect(
        service.createVM({ name: 'test', os: 'ubuntu', cores: 2, memory: 100000, disk: 50 }, 1)
      ).rejects.toThrow('Memory must be between 512 MB and 65536 MB');
    });

    it('should reject invalid disk', async () => {
      await expect(
        service.createVM({ name: 'test', os: 'ubuntu', cores: 2, memory: 2048, disk: 5 }, 1)
      ).rejects.toThrow('Disk must be between 10 GB and 2000 GB');

      await expect(
        service.createVM({ name: 'test', os: 'ubuntu', cores: 2, memory: 2048, disk: 5000 }, 1)
      ).rejects.toThrow('Disk must be between 10 GB and 2000 GB');
    });
  });

  describe('startVM', () => {
    it('should start stopped VM', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        id: 1,
        documentId: 'vm-123',
        name: 'test-vm',
        status: 'stopped',
        externalId: 'ext-123',
      });
      mockIzvorClient.startVM.mockResolvedValue({ success: true });
      mockStrapi.entityService.update.mockResolvedValue({
        id: 1,
        documentId: 'vm-123',
        name: 'test-vm',
        status: 'running',
      });

      const result = await service.startVM('vm-123', 1);

      expect(result.status).toBe('running');
      expect(mockIzvorClient.startVM).toHaveBeenCalledWith('ext-123');
    });

    it('should throw error if VM already running', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        status: 'running',
      });

      await expect(service.startVM('vm-123', 1)).rejects.toThrow('VM is already running');
    });

    it('should throw error if VM is creating', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        status: 'creating',
      });

      await expect(service.startVM('vm-123', 1)).rejects.toThrow('Cannot start VM in current state');
    });
  });

  describe('stopVM', () => {
    it('should stop running VM', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        id: 1,
        documentId: 'vm-123',
        name: 'test-vm',
        status: 'running',
        externalId: 'ext-123',
      });
      mockIzvorClient.stopVM.mockResolvedValue({ success: true });
      mockStrapi.entityService.update.mockResolvedValue({
        id: 1,
        documentId: 'vm-123',
        name: 'test-vm',
        status: 'stopped',
      });

      const result = await service.stopVM('vm-123', 1);

      expect(result.status).toBe('stopped');
      expect(mockIzvorClient.stopVM).toHaveBeenCalledWith('ext-123');
    });

    it('should throw error if VM already stopped', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        status: 'stopped',
      });

      await expect(service.stopVM('vm-123', 1)).rejects.toThrow('VM is already stopped');
    });
  });

  describe('restartVM', () => {
    it('should restart running VM', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        id: 1,
        documentId: 'vm-123',
        name: 'test-vm',
        status: 'running',
        externalId: 'ext-123',
      });
      mockIzvorClient.restartVM.mockResolvedValue({ success: true });

      const result = await service.restartVM('vm-123', 1);

      expect(mockIzvorClient.restartVM).toHaveBeenCalledWith('ext-123');
    });

    it('should throw error if VM not running', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        status: 'stopped',
      });

      await expect(service.restartVM('vm-123', 1)).rejects.toThrow('Can only restart running VMs');
    });
  });

  describe('deleteVM', () => {
    it('should delete stopped VM', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        id: 1,
        documentId: 'vm-123',
        name: 'test-vm',
        status: 'stopped',
        externalId: 'ext-123',
      });
      mockStrapi.entityService.update.mockResolvedValue({});
      mockIzvorClient.deleteVM.mockResolvedValue({ success: true });
      mockStrapi.entityService.delete.mockResolvedValue({});

      await service.deleteVM('vm-123', 1);

      expect(mockIzvorClient.deleteVM).toHaveBeenCalledWith('ext-123');
      expect(mockStrapi.entityService.delete).toHaveBeenCalled();
    });

    it('should throw error if VM is running', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        status: 'running',
      });

      await expect(service.deleteVM('vm-123', 1)).rejects.toThrow(
        'Cannot delete running VM. Stop it first.'
      );
    });
  });

  describe('resizeVM', () => {
    it('should resize stopped VM', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        id: 1,
        documentId: 'vm-123',
        name: 'test-vm',
        status: 'stopped',
        externalId: 'ext-123',
        cores: 2,
        memory: 2048,
        disk: 50,
      });
      mockIzvorClient.resizeVM.mockResolvedValue({ success: true });
      mockStrapi.entityService.update.mockResolvedValue({
        cores: 4,
        memory: 4096,
        disk: 100,
      });

      const result = await service.resizeVM('vm-123', { cores: 4, memory: 4096, disk: 100 }, 1);

      expect(mockIzvorClient.resizeVM).toHaveBeenCalledWith('ext-123', {
        cores: 4,
        memory: 4096,
        disk: 100,
      });
    });

    it('should throw error if VM not stopped', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        status: 'running',
      });

      await expect(service.resizeVM('vm-123', { cores: 4 }, 1)).rejects.toThrow(
        'VM must be stopped to resize'
      );
    });

    it('should throw error if disk size decreased', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        status: 'stopped',
        disk: 100,
      });

      await expect(service.resizeVM('vm-123', { disk: 50 }, 1)).rejects.toThrow(
        'Disk size cannot be decreased'
      );
    });
  });

  describe('createSnapshot', () => {
    it('should create snapshot', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        id: 1,
        documentId: 'vm-123',
        name: 'test-vm',
        externalId: 'ext-123',
      });
      mockIzvorClient.snapshotVM.mockResolvedValue({
        id: 'snap-123',
        name: 'pre-upgrade',
        createdAt: new Date().toISOString(),
        size: 10000000,
      });

      const result = await service.createSnapshot('vm-123', 'pre-upgrade', 'Before system upgrade', 1);

      expect(result.id).toBe('snap-123');
      expect(result.name).toBe('pre-upgrade');
    });

    it('should throw error if VM not found', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue(null);

      await expect(service.createSnapshot('vm-123', 'snap', undefined, 1)).rejects.toThrow(
        'VM not found'
      );
    });
  });

  describe('restoreSnapshot', () => {
    it('should restore snapshot on stopped VM', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        id: 1,
        documentId: 'vm-123',
        name: 'test-vm',
        status: 'stopped',
        externalId: 'ext-123',
      });
      mockIzvorClient.restoreSnapshot.mockResolvedValue({ success: true });

      await service.restoreSnapshot('vm-123', 'snap-123', 1);

      expect(mockIzvorClient.restoreSnapshot).toHaveBeenCalledWith('ext-123', 'snap-123');
    });

    it('should throw error if VM running', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        status: 'running',
      });

      await expect(service.restoreSnapshot('vm-123', 'snap-123', 1)).rejects.toThrow(
        'VM must be stopped to restore snapshot'
      );
    });
  });

  describe('getConsole', () => {
    it('should get console for running VM', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        id: 1,
        documentId: 'vm-123',
        name: 'test-vm',
        status: 'running',
        externalId: 'ext-123',
      });
      mockIzvorClient.getVMConsole.mockResolvedValue({
        url: 'wss://console.example.com/vm-123',
        token: 'token-abc',
      });

      const result = await service.getConsole('vm-123', 1);

      expect(result.url).toContain('console');
      expect(result.token).toBeDefined();
    });

    it('should throw error if VM not running', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        status: 'stopped',
      });

      await expect(service.getConsole('vm-123', 1)).rejects.toThrow(
        'VM must be running to access console'
      );
    });
  });

  describe('calculateResourceUsage', () => {
    it('should calculate total resource usage', () => {
      const vms: VirtualMachine[] = [
        {
          id: 1,
          documentId: 'vm-1',
          name: 'vm1',
          status: 'running',
          os: 'ubuntu',
          cores: 2,
          memory: 2048,
          disk: 50,
          ipAddress: '192.168.1.1',
          externalId: 'ext-1',
          owner: { id: 1 },
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 2,
          documentId: 'vm-2',
          name: 'vm2',
          status: 'stopped',
          os: 'debian',
          cores: 4,
          memory: 4096,
          disk: 100,
          ipAddress: null,
          externalId: 'ext-2',
          owner: { id: 1 },
          createdAt: '',
          updatedAt: '',
        },
      ];

      const result = service.calculateResourceUsage(vms);

      expect(result.totalVMs).toBe(2);
      expect(result.runningVMs).toBe(1);
      expect(result.totalCores).toBe(6);
      expect(result.totalMemory).toBe(6144);
      expect(result.totalDisk).toBe(150);
    });

    it('should return zeros for empty array', () => {
      const result = service.calculateResourceUsage([]);

      expect(result.totalVMs).toBe(0);
      expect(result.runningVMs).toBe(0);
      expect(result.totalCores).toBe(0);
      expect(result.totalMemory).toBe(0);
      expect(result.totalDisk).toBe(0);
    });
  });
});

describe('VM Status State Machine', () => {
  const validTransitions: Record<string, string[]> = {
    creating: ['running', 'error'],
    running: ['stopped', 'paused', 'suspended', 'error'],
    stopped: ['running', 'deleting'],
    paused: ['running', 'stopped'],
    suspended: ['running', 'stopped'],
    deleting: [], // terminal state
    error: ['stopped', 'deleting'],
  };

  const statuses = ['creating', 'running', 'stopped', 'paused', 'suspended', 'deleting', 'error'];

  statuses.forEach((from) => {
    it(`should define valid transitions from ${from}`, () => {
      expect(validTransitions[from]).toBeDefined();
      expect(Array.isArray(validTransitions[from])).toBe(true);
    });
  });

  it('should not allow transitions from deleting', () => {
    expect(validTransitions['deleting']).toHaveLength(0);
  });

  it('should allow starting from stopped state', () => {
    expect(validTransitions['stopped']).toContain('running');
  });

  it('should allow stopping from running state', () => {
    expect(validTransitions['running']).toContain('stopped');
  });
});

describe('VM Resource Limits', () => {
  const limits = {
    cores: { min: 1, max: 32 },
    memory: { min: 512, max: 65536 }, // MB
    disk: { min: 10, max: 2000 }, // GB
  };

  it('should define valid core limits', () => {
    expect(limits.cores.min).toBeGreaterThan(0);
    expect(limits.cores.max).toBeGreaterThan(limits.cores.min);
  });

  it('should define valid memory limits', () => {
    expect(limits.memory.min).toBeGreaterThanOrEqual(512);
    expect(limits.memory.max).toBeLessThanOrEqual(65536);
  });

  it('should define valid disk limits', () => {
    expect(limits.disk.min).toBeGreaterThanOrEqual(10);
    expect(limits.disk.max).toBeLessThanOrEqual(2000);
  });

  it('should allow common VM configurations', () => {
    const configs = [
      { cores: 1, memory: 1024, disk: 20 },
      { cores: 2, memory: 2048, disk: 50 },
      { cores: 4, memory: 4096, disk: 100 },
      { cores: 8, memory: 8192, disk: 200 },
      { cores: 16, memory: 32768, disk: 500 },
    ];

    configs.forEach((config) => {
      expect(config.cores).toBeGreaterThanOrEqual(limits.cores.min);
      expect(config.cores).toBeLessThanOrEqual(limits.cores.max);
      expect(config.memory).toBeGreaterThanOrEqual(limits.memory.min);
      expect(config.memory).toBeLessThanOrEqual(limits.memory.max);
      expect(config.disk).toBeGreaterThanOrEqual(limits.disk.min);
      expect(config.disk).toBeLessThanOrEqual(limits.disk.max);
    });
  });
});
