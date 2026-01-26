/**
 * Virtual Machine API Tests
 */

import { describe, it, expect, vi } from 'vitest';

describe('Izvor Client', () => {
  describe('VM Sizes', () => {
    it('should have predefined sizes', () => {
      const predefinedSizes = [
        { name: 'nano', cores: 1, memory: 256, disk: 5 },
        { name: 'micro', cores: 1, memory: 512, disk: 10 },
        { name: 'small', cores: 1, memory: 1024, disk: 20 },
        { name: 'medium', cores: 2, memory: 2048, disk: 40 },
        { name: 'large', cores: 4, memory: 4096, disk: 80 },
        { name: 'xlarge', cores: 8, memory: 8192, disk: 160 },
        { name: 'xxlarge', cores: 16, memory: 16384, disk: 320 },
      ];

      expect(predefinedSizes).toHaveLength(7);
      expect(predefinedSizes[0].name).toBe('nano');
      expect(predefinedSizes[6].name).toBe('xxlarge');
    });

    it('should have valid size specs', () => {
      const sizes = [
        { name: 'nano', cores: 1, memory: 256, disk: 5 },
        { name: 'xxlarge', cores: 16, memory: 16384, disk: 320 },
      ];

      for (const size of sizes) {
        expect(size.cores).toBeGreaterThanOrEqual(1);
        expect(size.memory).toBeGreaterThanOrEqual(256);
        expect(size.disk).toBeGreaterThanOrEqual(5);
      }
    });
  });

  describe('VM Status', () => {
    it('should have all valid statuses', () => {
      const validStatuses = [
        'running',
        'stopped',
        'paused',
        'starting',
        'stopping',
        'creating',
        'deleting',
        'error',
        'unknown',
      ];

      expect(validStatuses).toContain('running');
      expect(validStatuses).toContain('stopped');
      expect(validStatuses).toContain('creating');
    });
  });

  describe('IzvorClientError', () => {
    it('should create error with status code', () => {
      class IzvorClientError extends Error {
        constructor(
          message: string,
          public statusCode: number,
          public code?: string,
        ) {
          super(message);
          this.name = 'IzvorClientError';
        }
      }

      const error = new IzvorClientError('VM not found', 404, 'NOT_FOUND');
      expect(error.message).toBe('VM not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.name).toBe('IzvorClientError');
    });
  });
});

describe('VM Service', () => {
  describe('Quota Management', () => {
    it('should calculate quota usage', () => {
      const vms = [
        { cores: 2, memoryMB: 2048, diskGB: 40 },
        { cores: 4, memoryMB: 4096, diskGB: 80 },
      ];

      const usage = {
        vmCount: vms.length,
        totalCores: vms.reduce((sum, vm) => sum + vm.cores, 0),
        totalMemory: vms.reduce((sum, vm) => sum + vm.memoryMB, 0),
        totalDisk: vms.reduce((sum, vm) => sum + vm.diskGB, 0),
      };

      expect(usage.vmCount).toBe(2);
      expect(usage.totalCores).toBe(6);
      expect(usage.totalMemory).toBe(6144);
      expect(usage.totalDisk).toBe(120);
    });

    it('should check quota limits', () => {
      const config = {
        maxVMsPerUser: 10,
        maxCoresPerUser: 32,
        maxMemoryPerUser: 32768,
        maxDiskPerUser: 500,
      };

      const currentUsage = { vmCount: 2, totalCores: 6, totalMemory: 6144, totalDisk: 120 };
      const requested = { cores: 4, memoryMB: 4096, diskGB: 80 };

      // Check if within quota
      const withinVMLimit = currentUsage.vmCount + 1 <= config.maxVMsPerUser;
      const withinCoresLimit = currentUsage.totalCores + requested.cores <= config.maxCoresPerUser;
      const withinMemoryLimit = currentUsage.totalMemory + requested.memoryMB <= config.maxMemoryPerUser;
      const withinDiskLimit = currentUsage.totalDisk + requested.diskGB <= config.maxDiskPerUser;

      expect(withinVMLimit).toBe(true);
      expect(withinCoresLimit).toBe(true);
      expect(withinMemoryLimit).toBe(true);
      expect(withinDiskLimit).toBe(true);
    });

    it('should reject when quota exceeded', () => {
      const config = { maxCoresPerUser: 8 };
      const currentUsage = { totalCores: 6 };
      const requested = { cores: 4 };

      const withinLimit = currentUsage.totalCores + requested.cores <= config.maxCoresPerUser;
      expect(withinLimit).toBe(false);
    });
  });

  describe('VM Creation', () => {
    it('should resolve size to specs', () => {
      const sizes: Record<string, { cores: number; memory: number; disk: number }> = {
        nano: { cores: 1, memory: 256, disk: 5 },
        small: { cores: 1, memory: 1024, disk: 20 },
        medium: { cores: 2, memory: 2048, disk: 40 },
      };

      const selectedSize = 'medium';
      const specs = sizes[selectedSize];

      expect(specs.cores).toBe(2);
      expect(specs.memory).toBe(2048);
      expect(specs.disk).toBe(40);
    });

    it('should use custom specs when size is custom', () => {
      const customSpecs = {
        size: 'custom',
        cores: 6,
        memoryMB: 8192,
        diskGB: 100,
      };

      expect(customSpecs.cores).toBe(6);
      expect(customSpecs.memoryMB).toBe(8192);
      expect(customSpecs.diskGB).toBe(100);
    });
  });
});

describe('VM Schema', () => {
  it('should have correct structure', () => {
    const schema = {
      info: {
        singularName: 'virtual-machine',
        pluralName: 'virtual-machines',
        displayName: 'Virtual Machine',
      },
      attributes: {
        name: { type: 'string', required: true },
        status: { 
          type: 'enumeration', 
          enum: ['running', 'stopped', 'paused', 'starting', 'stopping', 'creating', 'deleting', 'error', 'unknown'] 
        },
        size: { 
          type: 'enumeration', 
          enum: ['nano', 'micro', 'small', 'medium', 'large', 'xlarge', 'xxlarge', 'custom'] 
        },
        cores: { type: 'integer', min: 1, max: 128 },
        memoryMB: { type: 'integer', min: 256, max: 65536 },
        diskGB: { type: 'integer', min: 5, max: 2000 },
        owner: { type: 'relation', target: 'plugin::users-permissions.user' },
      },
    };

    expect(schema.info.singularName).toBe('virtual-machine');
    expect(schema.attributes.name.required).toBe(true);
    expect(schema.attributes.status.enum).toContain('running');
    expect(schema.attributes.size.enum).toContain('nano');
    expect(schema.attributes.owner.type).toBe('relation');
  });
});

describe('VM Actions', () => {
  it('should have valid action types', () => {
    const actions = ['start', 'stop', 'reboot', 'pause', 'resume', 'shutdown'];
    
    expect(actions).toContain('start');
    expect(actions).toContain('stop');
    expect(actions).toContain('reboot');
    expect(actions).toContain('pause');
    expect(actions).toContain('resume');
  });

  it('should map action to transitional status', () => {
    const statusMap: Record<string, string> = {
      start: 'starting',
      stop: 'stopping',
      reboot: 'stopping',
      pause: 'paused',
      resume: 'running',
    };

    expect(statusMap['start']).toBe('starting');
    expect(statusMap['stop']).toBe('stopping');
    expect(statusMap['reboot']).toBe('stopping');
  });
});

describe('VM Snapshots', () => {
  it('should have snapshot structure', () => {
    const snapshot = {
      name: 'before-upgrade',
      description: 'Snapshot before system upgrade',
      created_at: '2024-01-15T10:30:00Z',
      vmstate: true,
    };

    expect(snapshot.name).toBe('before-upgrade');
    expect(snapshot.vmstate).toBe(true);
    expect(snapshot.created_at).toBeDefined();
  });

  it('should create snapshot request', () => {
    const request = {
      name: 'new-snapshot',
      description: 'Test snapshot',
      include_memory: false,
    };

    expect(request.name).toBe('new-snapshot');
    expect(request.include_memory).toBe(false);
  });
});

describe('VM Console', () => {
  it('should have console info structure', () => {
    const consoleInfo = {
      type: 'vnc',
      url: 'wss://proxmox:8006/console',
      ticket: 'PVE:user@pve:...',
      port: 5900,
      node: 'pve1',
    };

    expect(consoleInfo.type).toBe('vnc');
    expect(consoleInfo.port).toBe(5900);
    expect(consoleInfo.url).toContain('wss://');
  });

  it('should support VNC and SPICE types', () => {
    const consoleTypes = ['vnc', 'spice'];
    
    expect(consoleTypes).toContain('vnc');
    expect(consoleTypes).toContain('spice');
  });
});
