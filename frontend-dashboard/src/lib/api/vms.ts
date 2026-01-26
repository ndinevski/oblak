/**
 * Virtual Machines API Client
 * Frontend client for VM operations via dashboard backend
 */

import { apiClient } from './client';
import type { PaginatedResponse, ApiResponse, PaginationParams } from './types';

// VM Types
export type VMStatus =
  | 'running'
  | 'stopped'
  | 'paused'
  | 'starting'
  | 'stopping'
  | 'creating'
  | 'deleting'
  | 'error'
  | 'unknown';

export type VMSize = 'nano' | 'micro' | 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge' | 'custom';

export type OSType = 'linux' | 'windows' | 'other';

export interface CloudInitConfig {
  user?: string;
  password?: string;
  sshKeys?: string[];
}

export interface VirtualMachine {
  id: number;
  documentId: string;
  name: string;
  description?: string;
  status: VMStatus;
  template?: string;
  osType: OSType;
  size: VMSize;
  cores: number;
  memoryMB: number;
  diskGB: number;
  ipAddress?: string;
  ipv6Address?: string;
  network: string;
  cloudInit?: CloudInitConfig;
  tags?: string[];
  metadata?: {
    vmid?: number;
    macAddress?: string;
    cpuUsage?: number;
    memoryUsed?: number;
    diskUsed?: number;
    uptime?: number;
    error?: string;
    lastSync?: string;
  };
  lastActionAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VMTemplate {
  id: string;
  name: string;
  description: string;
  osType: OSType;
  minCores: number;
  minMemory: number;
  minDisk: number;
  defaultUser: string;
}

export interface VMSizeSpec {
  name: VMSize;
  cores: number;
  memory: number;
  disk: number;
  displayName: string;
}

export interface VMStats {
  cpuUsage: number;
  memoryUsed: number;
  memoryTotal: number;
  diskUsed: number;
  diskTotal: number;
  networkIn: number;
  networkOut: number;
  uptime: number;
}

export interface VMConsoleInfo {
  type: 'vnc' | 'spice';
  url: string;
  ticket: string;
  port: number;
  node: string;
}

export interface VMSnapshot {
  name: string;
  description?: string;
  createdAt: string;
  vmstate: boolean;
}

export interface CreateVMRequest {
  name: string;
  description?: string;
  template?: string;
  size?: VMSize;
  cores?: number;
  memoryMB?: number;
  diskGB?: number;
  network?: string;
  cloudInit?: CloudInitConfig;
  tags?: string[];
}

export interface UpdateVMRequest {
  name?: string;
  description?: string;
  tags?: string[];
}

export interface CreateSnapshotRequest {
  name: string;
  description?: string;
  includeMemory?: boolean;
}

export interface VMListParams extends PaginationParams {
  status?: VMStatus;
  search?: string;
  sort?: string;
}

// API Functions
export async function listVMs(params: VMListParams = {}): Promise<PaginatedResponse<VirtualMachine>> {
  const searchParams = new URLSearchParams();
  
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.pageSize) searchParams.set('pageSize', params.pageSize.toString());
  if (params.status) searchParams.set('status', params.status);
  if (params.search) searchParams.set('search', params.search);
  if (params.sort) searchParams.set('sort', params.sort);

  const query = searchParams.toString();
  return apiClient.get<PaginatedResponse<VirtualMachine>>(
    `/virtual-machines${query ? `?${query}` : ''}`
  );
}

export async function getVM(id: string): Promise<ApiResponse<VirtualMachine>> {
  return apiClient.get<ApiResponse<VirtualMachine>>(`/virtual-machines/${id}`);
}

export async function createVM(data: CreateVMRequest): Promise<ApiResponse<VirtualMachine>> {
  return apiClient.post<ApiResponse<VirtualMachine>>('/virtual-machines', data);
}

export async function updateVM(id: string, data: UpdateVMRequest): Promise<ApiResponse<VirtualMachine>> {
  return apiClient.put<ApiResponse<VirtualMachine>>(`/virtual-machines/${id}`, data);
}

export async function deleteVM(id: string): Promise<void> {
  await apiClient.delete(`/virtual-machines/${id}`);
}

// VM Actions
export async function startVM(id: string): Promise<ApiResponse<VirtualMachine>> {
  return apiClient.post<ApiResponse<VirtualMachine>>(`/virtual-machines/${id}/start`);
}

export async function stopVM(id: string, force = false): Promise<ApiResponse<VirtualMachine>> {
  return apiClient.post<ApiResponse<VirtualMachine>>(`/virtual-machines/${id}/stop`, { force });
}

export async function rebootVM(id: string): Promise<ApiResponse<VirtualMachine>> {
  return apiClient.post<ApiResponse<VirtualMachine>>(`/virtual-machines/${id}/reboot`);
}

export async function pauseVM(id: string): Promise<ApiResponse<VirtualMachine>> {
  return apiClient.post<ApiResponse<VirtualMachine>>(`/virtual-machines/${id}/pause`);
}

export async function resumeVM(id: string): Promise<ApiResponse<VirtualMachine>> {
  return apiClient.post<ApiResponse<VirtualMachine>>(`/virtual-machines/${id}/resume`);
}

// Console
export async function getVMConsole(id: string, type: 'vnc' | 'spice' = 'vnc'): Promise<ApiResponse<VMConsoleInfo>> {
  return apiClient.get<ApiResponse<VMConsoleInfo>>(`/virtual-machines/${id}/console?type=${type}`);
}

// Stats
export async function getVMStats(id: string): Promise<ApiResponse<VMStats>> {
  return apiClient.get<ApiResponse<VMStats>>(`/virtual-machines/${id}/stats`);
}

// Snapshots
export async function listVMSnapshots(vmId: string): Promise<ApiResponse<VMSnapshot[]>> {
  return apiClient.get<ApiResponse<VMSnapshot[]>>(`/virtual-machines/${vmId}/snapshots`);
}

export async function createVMSnapshot(vmId: string, data: CreateSnapshotRequest): Promise<ApiResponse<VMSnapshot>> {
  return apiClient.post<ApiResponse<VMSnapshot>>(`/virtual-machines/${vmId}/snapshots`, data);
}

export async function restoreVMSnapshot(vmId: string, snapshotName: string): Promise<void> {
  await apiClient.post(`/virtual-machines/${vmId}/snapshots/${snapshotName}/restore`);
}

export async function deleteVMSnapshot(vmId: string, snapshotName: string): Promise<void> {
  await apiClient.delete(`/virtual-machines/${vmId}/snapshots/${snapshotName}`);
}

// Templates and Sizes
export async function getVMTemplates(): Promise<ApiResponse<VMTemplate[]>> {
  return apiClient.get<ApiResponse<VMTemplate[]>>('/virtual-machines/templates');
}

export async function getVMSizes(): Promise<ApiResponse<VMSizeSpec[]>> {
  return apiClient.get<ApiResponse<VMSizeSpec[]>>('/virtual-machines/sizes');
}

// Sync
export async function syncVM(id: string): Promise<ApiResponse<VirtualMachine>> {
  return apiClient.post<ApiResponse<VirtualMachine>>(`/virtual-machines/${id}/sync`);
}

// Helper functions
export function getStatusColor(status: VMStatus): string {
  const colors: Record<VMStatus, string> = {
    running: 'bg-green-500',
    stopped: 'bg-gray-500',
    paused: 'bg-yellow-500',
    starting: 'bg-blue-500',
    stopping: 'bg-orange-500',
    creating: 'bg-blue-400',
    deleting: 'bg-red-400',
    error: 'bg-red-500',
    unknown: 'bg-gray-400',
  };
  return colors[status] || 'bg-gray-400';
}

export function getStatusLabel(status: VMStatus): string {
  const labels: Record<VMStatus, string> = {
    running: 'Running',
    stopped: 'Stopped',
    paused: 'Paused',
    starting: 'Starting',
    stopping: 'Stopping',
    creating: 'Creating',
    deleting: 'Deleting',
    error: 'Error',
    unknown: 'Unknown',
  };
  return labels[status] || 'Unknown';
}

export function formatMemory(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

export function formatDisk(gb: number): string {
  if (gb >= 1000) {
    return `${(gb / 1000).toFixed(1)} TB`;
  }
  return `${gb} GB`;
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

export function isVMActionable(status: VMStatus): boolean {
  return !['creating', 'deleting', 'starting', 'stopping'].includes(status);
}

export function canStartVM(status: VMStatus): boolean {
  return ['stopped', 'paused'].includes(status);
}

export function canStopVM(status: VMStatus): boolean {
  return ['running', 'paused'].includes(status);
}

export function canPauseVM(status: VMStatus): boolean {
  return status === 'running';
}

export function canResumeVM(status: VMStatus): boolean {
  return status === 'paused';
}

export function canAccessConsole(status: VMStatus): boolean {
  return status === 'running';
}
