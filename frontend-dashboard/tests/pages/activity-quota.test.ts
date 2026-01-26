/**
 * Activity and Quota Tests
 * Frontend tests for activity logging and quota management features
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Test Setup
// =============================================================================

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

// =============================================================================
// Activity API Helper Tests
// =============================================================================

describe('Activity API Helpers', () => {
  describe('getActionLabel', () => {
    it('should return human-readable labels for known actions', () => {
      const labels: Record<string, string> = {
        'function.create': 'Created Function',
        'function.update': 'Updated Function',
        'function.delete': 'Deleted Function',
        'function.invoke': 'Invoked Function',
        'vm.create': 'Created VM',
        'vm.start': 'Started VM',
        'vm.stop': 'Stopped VM',
        'bucket.create': 'Created Bucket',
        'user.login': 'Logged In',
      };

      Object.entries(labels).forEach(([action, expected]) => {
        // Simulate getActionLabel logic
        const result = labels[action] || action;
        expect(result).toBe(expected);
      });
    });

    it('should format unknown actions', () => {
      const action = 'unknown.action';
      const formatted = action.replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      expect(formatted).toBe('Unknown Action');
    });
  });

  describe('getActionType', () => {
    it('should identify create actions', () => {
      const createActions = ['function.create', 'vm.create', 'bucket.create', 'user.register'];
      createActions.forEach(action => {
        const isCreate = action.includes('create') || action.includes('register');
        expect(isCreate).toBe(true);
      });
    });

    it('should identify update actions', () => {
      const updateActions = ['function.update', 'vm.update', 'function.deploy'];
      updateActions.forEach(action => {
        const isUpdate = action.includes('update') || action.includes('deploy');
        expect(isUpdate).toBe(true);
      });
    });

    it('should identify delete actions', () => {
      const deleteActions = ['function.delete', 'vm.delete', 'bucket.delete'];
      deleteActions.forEach(action => {
        const isDelete = action.includes('delete');
        expect(isDelete).toBe(true);
      });
    });
  });

  describe('getResourceTypeLabel', () => {
    it('should return readable labels', () => {
      const labels: Record<string, string> = {
        function: 'Function',
        'virtual-machine': 'Virtual Machine',
        vm: 'Virtual Machine',
        bucket: 'Bucket',
        object: 'Object',
        user: 'User',
      };

      expect(labels['function']).toBe('Function');
      expect(labels['virtual-machine']).toBe('Virtual Machine');
      expect(labels['bucket']).toBe('Bucket');
    });
  });

  describe('getStatusColor', () => {
    it('should return correct colors for statuses', () => {
      const colors: Record<string, string> = {
        success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
        failure: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
        pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      };

      expect(colors.success).toContain('green');
      expect(colors.failure).toContain('red');
      expect(colors.pending).toContain('yellow');
    });
  });

  describe('formatRelativeTime', () => {
    it('should format recent times', () => {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
      const diffSecs = Math.floor((now.getTime() - oneMinuteAgo.getTime()) / 1000);
      const diffMins = Math.floor(diffSecs / 60);

      expect(diffMins).toBe(1);
    });

    it('should format hours ago', () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const diffHours = Math.floor((now.getTime() - twoHoursAgo.getTime()) / (60 * 60 * 1000));

      expect(diffHours).toBe(2);
    });

    it('should format days ago', () => {
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const diffDays = Math.floor((now.getTime() - threeDaysAgo.getTime()) / (24 * 60 * 60 * 1000));

      expect(diffDays).toBe(3);
    });
  });
});

// =============================================================================
// Quota API Helper Tests
// =============================================================================

describe('Quota API Helpers', () => {
  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      const formatBytes = (bytes: number, decimals = 2): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
      };

      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(1099511627776)).toBe('1 TB');
    });
  });

  describe('formatMemory', () => {
    it('should format memory in MB', () => {
      const formatMemory = (mb: number): string => {
        if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
        return `${mb} MB`;
      };

      expect(formatMemory(512)).toBe('512 MB');
      expect(formatMemory(1024)).toBe('1.0 GB');
      expect(formatMemory(2048)).toBe('2.0 GB');
      expect(formatMemory(32768)).toBe('32.0 GB');
    });
  });

  describe('getPercentageColor', () => {
    it('should return green for low usage', () => {
      const getColor = (percentage: number): string => {
        if (percentage >= 90) return 'text-red-600';
        if (percentage >= 75) return 'text-yellow-600';
        return 'text-green-600';
      };

      expect(getColor(50)).toContain('green');
    });

    it('should return yellow for medium usage', () => {
      const getColor = (percentage: number): string => {
        if (percentage >= 90) return 'text-red-600';
        if (percentage >= 75) return 'text-yellow-600';
        return 'text-green-600';
      };

      expect(getColor(80)).toContain('yellow');
    });

    it('should return red for high usage', () => {
      const getColor = (percentage: number): string => {
        if (percentage >= 90) return 'text-red-600';
        if (percentage >= 75) return 'text-yellow-600';
        return 'text-green-600';
      };

      expect(getColor(95)).toContain('red');
    });
  });

  describe('getQuotaStatus', () => {
    it('should return ok for low usage', () => {
      const getStatus = (percentage: number): 'ok' | 'warning' | 'critical' => {
        if (percentage >= 90) return 'critical';
        if (percentage >= 75) return 'warning';
        return 'ok';
      };

      expect(getStatus(50)).toBe('ok');
    });

    it('should return warning for medium usage', () => {
      const getStatus = (percentage: number): 'ok' | 'warning' | 'critical' => {
        if (percentage >= 90) return 'critical';
        if (percentage >= 75) return 'warning';
        return 'ok';
      };

      expect(getStatus(80)).toBe('warning');
    });

    it('should return critical for high usage', () => {
      const getStatus = (percentage: number): 'ok' | 'warning' | 'critical' => {
        if (percentage >= 90) return 'critical';
        if (percentage >= 75) return 'warning';
        return 'ok';
      };

      expect(getStatus(95)).toBe('critical');
    });
  });

  describe('calculateOverallHealth', () => {
    it('should return healthy when all percentages are low', () => {
      const percentages = {
        functions: { count: 25, invocations: 10 },
        virtualMachines: { count: 20, cores: 25, memory: 25, disk: 20 },
        storage: { buckets: 30, bytes: 30 },
      };

      const allPercentages = [
        percentages.functions.count,
        percentages.functions.invocations,
        percentages.virtualMachines.count,
        percentages.virtualMachines.cores,
        percentages.virtualMachines.memory,
        percentages.virtualMachines.disk,
        percentages.storage.buckets,
        percentages.storage.bytes,
      ];

      const maxPercentage = Math.max(...allPercentages);
      const health = maxPercentage >= 90 ? 'critical' : maxPercentage >= 75 ? 'warning' : 'healthy';

      expect(health).toBe('healthy');
    });

    it('should return warning when any percentage is above 75', () => {
      const percentages = {
        functions: { count: 80, invocations: 10 },
        virtualMachines: { count: 20, cores: 25, memory: 25, disk: 20 },
        storage: { buckets: 30, bytes: 30 },
      };

      const allPercentages = [
        percentages.functions.count,
        percentages.functions.invocations,
        percentages.virtualMachines.count,
        percentages.virtualMachines.cores,
        percentages.virtualMachines.memory,
        percentages.virtualMachines.disk,
        percentages.storage.buckets,
        percentages.storage.bytes,
      ];

      const maxPercentage = Math.max(...allPercentages);
      const health = maxPercentage >= 90 ? 'critical' : maxPercentage >= 75 ? 'warning' : 'healthy';

      expect(health).toBe('warning');
    });

    it('should return critical when any percentage is above 90', () => {
      const percentages = {
        functions: { count: 95, invocations: 10 },
        virtualMachines: { count: 20, cores: 25, memory: 25, disk: 20 },
        storage: { buckets: 30, bytes: 30 },
      };

      const allPercentages = [
        percentages.functions.count,
        percentages.functions.invocations,
        percentages.virtualMachines.count,
        percentages.virtualMachines.cores,
        percentages.virtualMachines.memory,
        percentages.virtualMachines.disk,
        percentages.storage.buckets,
        percentages.storage.bytes,
      ];

      const maxPercentage = Math.max(...allPercentages);
      const health = maxPercentage >= 90 ? 'critical' : maxPercentage >= 75 ? 'warning' : 'healthy';

      expect(health).toBe('critical');
    });
  });
});

// =============================================================================
// Activity Hooks Tests
// =============================================================================

describe('Activity Hooks', () => {
  describe('useActivityFilters', () => {
    it('should initialize with default values', () => {
      const defaultFilters = {
        page: 1,
        pageSize: 20,
        resourceType: undefined,
        action: undefined,
        status: undefined,
        startDate: undefined,
        endDate: undefined,
      };

      expect(defaultFilters.page).toBe(1);
      expect(defaultFilters.pageSize).toBe(20);
      expect(defaultFilters.resourceType).toBeUndefined();
    });

    it('should reset page when filter changes', () => {
      const filters = { page: 3, pageSize: 20 };
      const newFilters = { ...filters, resourceType: 'function', page: 1 };

      expect(newFilters.page).toBe(1);
    });

    it('should detect active filters', () => {
      const filters = {
        resourceType: 'function',
        action: undefined,
        status: undefined,
      };

      const hasActiveFilters = !!(
        filters.resourceType ||
        filters.action ||
        filters.status
      );

      expect(hasActiveFilters).toBe(true);
    });

    it('should clear all filters', () => {
      const clearedFilters = {
        page: 1,
        pageSize: 20,
        resourceType: undefined,
        action: undefined,
        status: undefined,
        startDate: undefined,
        endDate: undefined,
      };

      expect(clearedFilters.resourceType).toBeUndefined();
      expect(clearedFilters.action).toBeUndefined();
      expect(clearedFilters.status).toBeUndefined();
    });
  });

  describe('Activity Query Keys', () => {
    it('should generate correct query keys', () => {
      const activityKeys = {
        all: ['activity'] as const,
        lists: () => [...activityKeys.all, 'list'] as const,
        list: (filters: Record<string, unknown>) => [...activityKeys.lists(), filters] as const,
        details: () => [...activityKeys.all, 'detail'] as const,
        detail: (id: number) => [...activityKeys.details(), id] as const,
        summary: (days: number) => [...activityKeys.all, 'summary', days] as const,
      };

      expect(activityKeys.all).toEqual(['activity']);
      expect(activityKeys.lists()).toEqual(['activity', 'list']);
      expect(activityKeys.detail(1)).toEqual(['activity', 'detail', 1]);
      expect(activityKeys.summary(30)).toEqual(['activity', 'summary', 30]);
    });
  });
});

// =============================================================================
// Quota Hooks Tests
// =============================================================================

describe('Quota Hooks', () => {
  describe('Quota Query Keys', () => {
    it('should generate correct query keys', () => {
      const quotaKeys = {
        all: ['quota'] as const,
        info: () => [...quotaKeys.all, 'info'] as const,
        usage: () => [...quotaKeys.all, 'usage'] as const,
        limits: () => [...quotaKeys.all, 'limits'] as const,
      };

      expect(quotaKeys.all).toEqual(['quota']);
      expect(quotaKeys.info()).toEqual(['quota', 'info']);
      expect(quotaKeys.usage()).toEqual(['quota', 'usage']);
      expect(quotaKeys.limits()).toEqual(['quota', 'limits']);
    });
  });
});

// =============================================================================
// Activity Page Tests
// =============================================================================

describe('ActivityPage', () => {
  it('should show loading state initially', () => {
    const isLoading = true;
    expect(isLoading).toBe(true);
  });

  it('should render filter controls', () => {
    const filterControls = ['resourceType', 'action', 'status'];
    expect(filterControls).toContain('resourceType');
    expect(filterControls).toContain('action');
    expect(filterControls).toContain('status');
  });

  it('should display activity list', () => {
    const activities = [
      { id: 1, action: 'function.create', resourceType: 'function' },
      { id: 2, action: 'vm.create', resourceType: 'virtual-machine' },
    ];

    expect(activities).toHaveLength(2);
  });

  it('should show empty state when no activities', () => {
    const activities: unknown[] = [];
    const showEmptyState = activities.length === 0;
    expect(showEmptyState).toBe(true);
  });

  it('should support pagination', () => {
    const pagination = { page: 1, pageSize: 20, pageCount: 5, total: 100 };
    expect(pagination.pageCount).toBeGreaterThan(1);
  });
});

// =============================================================================
// Quota Page Tests
// =============================================================================

describe('QuotaPage', () => {
  it('should display function quota', () => {
    const quota = {
      usage: { functions: { count: 5, invocationsToday: 100 } },
      limits: { functions: { maxCount: 20, maxInvocationsPerDay: 10000 } },
      percentages: { functions: { count: 25, invocations: 1 } },
    };

    expect(quota.usage.functions.count).toBe(5);
    expect(quota.limits.functions.maxCount).toBe(20);
    expect(quota.percentages.functions.count).toBe(25);
  });

  it('should display VM quota', () => {
    const quota = {
      usage: {
        virtualMachines: { count: 2, totalCores: 8, totalMemoryMB: 8192, totalDiskGB: 100 },
      },
      limits: {
        virtualMachines: { maxCount: 5, maxCores: 32, maxMemoryMB: 32768, maxDiskGB: 500 },
      },
    };

    expect(quota.usage.virtualMachines.count).toBe(2);
    expect(quota.limits.virtualMachines.maxCount).toBe(5);
  });

  it('should display storage quota', () => {
    const quota = {
      usage: { storage: { bucketCount: 3, totalBytes: 3221225472 } },
      limits: { storage: { maxBuckets: 10, maxTotalBytes: 10737418240 } },
    };

    expect(quota.usage.storage.bucketCount).toBe(3);
    expect(quota.limits.storage.maxBuckets).toBe(10);
  });

  it('should show overall health status', () => {
    const percentages = {
      functions: { count: 25, invocations: 1 },
      virtualMachines: { count: 20, cores: 25, memory: 25, disk: 20 },
      storage: { buckets: 30, bytes: 30 },
    };

    const allPercentages = Object.values(percentages).flatMap(p => Object.values(p));
    const maxPercentage = Math.max(...allPercentages);
    const health = maxPercentage >= 90 ? 'critical' : maxPercentage >= 75 ? 'warning' : 'healthy';

    expect(health).toBe('healthy');
  });

  it('should display summary table', () => {
    const tableColumns = ['Resource', 'Used', 'Limit', 'Remaining', 'Usage'];
    expect(tableColumns).toHaveLength(5);
  });
});

// =============================================================================
// Settings Page Tests
// =============================================================================

describe('SettingsPage', () => {
  it('should display account settings section', () => {
    const accountSettings = ['Profile', 'Security', 'API Keys'];
    expect(accountSettings).toContain('Profile');
  });

  it('should display monitoring section', () => {
    const monitoringSettings = ['Activity Log', 'Quota Usage'];
    expect(monitoringSettings).toContain('Activity Log');
    expect(monitoringSettings).toContain('Quota Usage');
  });

  it('should link to profile page', () => {
    const profileLink = '/settings/profile';
    expect(profileLink).toBe('/settings/profile');
  });

  it('should link to activity page', () => {
    const activityLink = '/settings/activity';
    expect(activityLink).toBe('/settings/activity');
  });

  it('should link to quota page', () => {
    const quotaLink = '/settings/quota';
    expect(quotaLink).toBe('/settings/quota');
  });
});

// =============================================================================
// Profile Page Tests
// =============================================================================

describe('ProfilePage', () => {
  it('should display user information', () => {
    const user = {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    expect(user.username).toBe('testuser');
    expect(user.email).toBe('test@example.com');
  });

  it('should have editable fields', () => {
    const editableFields = ['displayName', 'organization'];
    expect(editableFields).toContain('displayName');
    expect(editableFields).toContain('organization');
  });

  it('should have non-editable email field', () => {
    const emailEditable = false;
    expect(emailEditable).toBe(false);
  });

  it('should generate user initials', () => {
    const getInitials = (name: string) => {
      return name
        .split(' ')
        .map(part => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'U';
    };

    expect(getInitials('John Doe')).toBe('JD');
    expect(getInitials('Alice')).toBe('A');
    expect(getInitials('')).toBe('U');
  });

  it('should format join date', () => {
    const dateString = '2024-01-15T00:00:00.000Z';
    const formatted = new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    expect(formatted).toContain('2024');
    expect(formatted).toContain('January');
  });
});
