/**
 * Quota API Client
 * Handles all quota related API calls
 */

import api from './client';

// =============================================================================
// Types
// =============================================================================

export interface QuotaLimits {
  functions: {
    maxCount: number;
    maxInvocationsPerDay: number;
  };
  virtualMachines: {
    maxCount: number;
    maxCores: number;
    maxMemoryMB: number;
    maxDiskGB: number;
  };
  storage: {
    maxBuckets: number;
    maxTotalBytes: number;
  };
}

export interface QuotaUsage {
  functions: {
    count: number;
    invocationsToday: number;
  };
  virtualMachines: {
    count: number;
    totalCores: number;
    totalMemoryMB: number;
    totalDiskGB: number;
  };
  storage: {
    bucketCount: number;
    totalBytes: number;
  };
}

export interface QuotaRemaining {
  functions: { count: number; invocationsToday: number };
  virtualMachines: { count: number; cores: number; memoryMB: number; diskGB: number };
  storage: { buckets: number; bytes: number };
}

export interface QuotaPercentages {
  functions: { count: number; invocations: number };
  virtualMachines: { count: number; cores: number; memory: number; disk: number };
  storage: { buckets: number; bytes: number };
}

export interface QuotaInfo {
  limits: QuotaLimits;
  usage: QuotaUsage;
  remaining: QuotaRemaining;
  percentages: QuotaPercentages;
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Get full quota information
 */
export async function getQuota(): Promise<QuotaInfo> {
  const response = await api.get('/quota');
  return response.data.data;
}

/**
 * Get current resource usage
 */
export async function getQuotaUsage(): Promise<QuotaUsage> {
  const response = await api.get('/quota/usage');
  return response.data.data;
}

/**
 * Get quota limits
 */
export async function getQuotaLimits(): Promise<QuotaLimits> {
  const response = await api.get('/quota/limits');
  return response.data.data;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format memory MB to human-readable string
 */
export function formatMemory(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

/**
 * Get percentage color class
 */
export function getPercentageColor(percentage: number): string {
  if (percentage >= 90) return 'text-red-600 dark:text-red-400';
  if (percentage >= 75) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-green-600 dark:text-green-400';
}

/**
 * Get progress bar color
 */
export function getProgressColor(percentage: number): string {
  if (percentage >= 90) return 'bg-red-500';
  if (percentage >= 75) return 'bg-yellow-500';
  return 'bg-green-500';
}

/**
 * Check if quota is near limit
 */
export function isNearLimit(percentage: number): boolean {
  return percentage >= 75;
}

/**
 * Check if quota is at limit
 */
export function isAtLimit(percentage: number): boolean {
  return percentage >= 100;
}

/**
 * Get quota status label
 */
export function getQuotaStatus(percentage: number): 'ok' | 'warning' | 'critical' {
  if (percentage >= 90) return 'critical';
  if (percentage >= 75) return 'warning';
  return 'ok';
}

/**
 * Get quota status message
 */
export function getQuotaStatusMessage(percentage: number, resourceName: string): string {
  if (percentage >= 100) return `${resourceName} quota exhausted`;
  if (percentage >= 90) return `${resourceName} quota critical - almost full`;
  if (percentage >= 75) return `${resourceName} quota warning - nearing limit`;
  return `${resourceName} usage normal`;
}

/**
 * Calculate overall quota health
 */
export function calculateOverallHealth(percentages: QuotaPercentages): 'healthy' | 'warning' | 'critical' {
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
  
  if (maxPercentage >= 90) return 'critical';
  if (maxPercentage >= 75) return 'warning';
  return 'healthy';
}
