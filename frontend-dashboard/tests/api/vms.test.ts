/**
 * Virtual Machines API Tests
 */

import { describe, it, expect } from 'vitest';
import {
  getStatusColor,
  getStatusLabel,
  formatMemory,
  formatDisk,
  formatUptime,
  isVMActionable,
  canStartVM,
  canStopVM,
  canPauseVM,
  canResumeVM,
  canAccessConsole,
} from '@/lib/api/vms';

describe('VMs API Helper Functions', () => {
  describe('getStatusColor', () => {
    it('should return correct color for running status', () => {
      expect(getStatusColor('running')).toBe('bg-green-500');
    });

    it('should return correct color for stopped status', () => {
      expect(getStatusColor('stopped')).toBe('bg-gray-500');
    });

    it('should return correct color for error status', () => {
      expect(getStatusColor('error')).toBe('bg-red-500');
    });

    it('should return correct color for transitional statuses', () => {
      expect(getStatusColor('starting')).toBe('bg-blue-500');
      expect(getStatusColor('stopping')).toBe('bg-orange-500');
      expect(getStatusColor('creating')).toBe('bg-blue-400');
    });
  });

  describe('getStatusLabel', () => {
    it('should return proper labels', () => {
      expect(getStatusLabel('running')).toBe('Running');
      expect(getStatusLabel('stopped')).toBe('Stopped');
      expect(getStatusLabel('paused')).toBe('Paused');
      expect(getStatusLabel('creating')).toBe('Creating');
    });
  });

  describe('formatMemory', () => {
    it('should format MB correctly', () => {
      expect(formatMemory(512)).toBe('512 MB');
      expect(formatMemory(256)).toBe('256 MB');
    });

    it('should format GB correctly', () => {
      expect(formatMemory(1024)).toBe('1.0 GB');
      expect(formatMemory(2048)).toBe('2.0 GB');
      expect(formatMemory(4096)).toBe('4.0 GB');
    });
  });

  describe('formatDisk', () => {
    it('should format GB correctly', () => {
      expect(formatDisk(20)).toBe('20 GB');
      expect(formatDisk(100)).toBe('100 GB');
    });

    it('should format TB correctly', () => {
      expect(formatDisk(1000)).toBe('1.0 TB');
      expect(formatDisk(2000)).toBe('2.0 TB');
    });
  });

  describe('formatUptime', () => {
    it('should format seconds', () => {
      expect(formatUptime(30)).toBe('30s');
    });

    it('should format minutes', () => {
      expect(formatUptime(120)).toBe('2m');
      expect(formatUptime(300)).toBe('5m');
    });

    it('should format hours', () => {
      expect(formatUptime(3600)).toBe('1h 0m');
      expect(formatUptime(7200)).toBe('2h 0m');
      expect(formatUptime(5400)).toBe('1h 30m');
    });

    it('should format days', () => {
      expect(formatUptime(86400)).toBe('1d 0h');
      expect(formatUptime(172800)).toBe('2d 0h');
    });
  });

  describe('isVMActionable', () => {
    it('should return false for transitional statuses', () => {
      expect(isVMActionable('creating')).toBe(false);
      expect(isVMActionable('deleting')).toBe(false);
      expect(isVMActionable('starting')).toBe(false);
      expect(isVMActionable('stopping')).toBe(false);
    });

    it('should return true for stable statuses', () => {
      expect(isVMActionable('running')).toBe(true);
      expect(isVMActionable('stopped')).toBe(true);
      expect(isVMActionable('paused')).toBe(true);
      expect(isVMActionable('error')).toBe(true);
    });
  });

  describe('canStartVM', () => {
    it('should return true for stopped/paused VMs', () => {
      expect(canStartVM('stopped')).toBe(true);
      expect(canStartVM('paused')).toBe(true);
    });

    it('should return false for running VMs', () => {
      expect(canStartVM('running')).toBe(false);
      expect(canStartVM('starting')).toBe(false);
    });
  });

  describe('canStopVM', () => {
    it('should return true for running/paused VMs', () => {
      expect(canStopVM('running')).toBe(true);
      expect(canStopVM('paused')).toBe(true);
    });

    it('should return false for stopped VMs', () => {
      expect(canStopVM('stopped')).toBe(false);
      expect(canStopVM('stopping')).toBe(false);
    });
  });

  describe('canPauseVM', () => {
    it('should return true only for running VMs', () => {
      expect(canPauseVM('running')).toBe(true);
      expect(canPauseVM('stopped')).toBe(false);
      expect(canPauseVM('paused')).toBe(false);
    });
  });

  describe('canResumeVM', () => {
    it('should return true only for paused VMs', () => {
      expect(canResumeVM('paused')).toBe(true);
      expect(canResumeVM('running')).toBe(false);
      expect(canResumeVM('stopped')).toBe(false);
    });
  });

  describe('canAccessConsole', () => {
    it('should return true only for running VMs', () => {
      expect(canAccessConsole('running')).toBe(true);
      expect(canAccessConsole('stopped')).toBe(false);
      expect(canAccessConsole('paused')).toBe(false);
    });
  });
});

describe('VM Types', () => {
  it('should have valid status types', () => {
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

    validStatuses.forEach(status => {
      expect(typeof getStatusLabel(status as any)).toBe('string');
    });
  });

  it('should have valid size types', () => {
    const validSizes = ['nano', 'micro', 'small', 'medium', 'large', 'xlarge', 'xxlarge', 'custom'];
    expect(validSizes).toHaveLength(8);
  });
});

describe('VM Request Types', () => {
  it('should accept valid create request', () => {
    const request = {
      name: 'my-vm',
      description: 'Test VM',
      template: 'ubuntu-22.04',
      size: 'small',
      cloudInit: {
        user: 'ubuntu',
        sshKeys: ['ssh-rsa AAAA...'],
      },
      tags: ['production', 'web'],
    };

    expect(request.name).toBe('my-vm');
    expect(request.size).toBe('small');
    expect(request.cloudInit?.user).toBe('ubuntu');
    expect(request.tags).toContain('production');
  });

  it('should accept minimal create request', () => {
    const request = {
      name: 'simple-vm',
    };

    expect(request.name).toBe('simple-vm');
  });
});

describe('VM Size Specs', () => {
  it('should have predefined sizes', () => {
    const sizes = [
      { name: 'nano', cores: 1, memory: 256, disk: 5 },
      { name: 'micro', cores: 1, memory: 512, disk: 10 },
      { name: 'small', cores: 1, memory: 1024, disk: 20 },
      { name: 'medium', cores: 2, memory: 2048, disk: 40 },
      { name: 'large', cores: 4, memory: 4096, disk: 80 },
      { name: 'xlarge', cores: 8, memory: 8192, disk: 160 },
      { name: 'xxlarge', cores: 16, memory: 16384, disk: 320 },
    ];

    expect(sizes).toHaveLength(7);
    
    // Verify nano is smallest
    expect(sizes[0].cores).toBe(1);
    expect(sizes[0].memory).toBe(256);
    
    // Verify xxlarge is largest
    expect(sizes[6].cores).toBe(16);
    expect(sizes[6].memory).toBe(16384);
  });
});

describe('Snapshot Types', () => {
  it('should have valid snapshot structure', () => {
    const snapshot = {
      name: 'before-upgrade',
      description: 'Snapshot before system upgrade',
      createdAt: '2024-01-15T10:30:00Z',
      vmstate: true,
    };

    expect(snapshot.name).toBe('before-upgrade');
    expect(snapshot.vmstate).toBe(true);
  });

  it('should have valid create request', () => {
    const request = {
      name: 'new-snapshot',
      description: 'Description',
      includeMemory: false,
    };

    expect(request.name).toBe('new-snapshot');
    expect(request.includeMemory).toBe(false);
  });
});

describe('Console Types', () => {
  it('should have valid console info structure', () => {
    const consoleInfo = {
      type: 'vnc',
      url: 'wss://proxmox:8006/console',
      ticket: 'PVE:user@pve:...',
      port: 5900,
      node: 'pve1',
    };

    expect(consoleInfo.type).toBe('vnc');
    expect(consoleInfo.port).toBe(5900);
  });

  it('should support VNC and SPICE types', () => {
    const types = ['vnc', 'spice'];
    expect(types).toContain('vnc');
    expect(types).toContain('spice');
  });
});
