/**
 * Izvor Client Service
 * HTTP client for communicating with the Izvor VM management service
 */

import { Strapi } from '@strapi/strapi';

// Izvor API types matching the Go models
export interface IzvorVM {
  id: string;
  vmid: number;
  name: string;
  node: string;
  status: string;
  cores: number;
  memory: number;
  disk_size: number;
  ip_address: string;
  ipv6_address?: string;
  mac_address?: string;
  os_type: string;
  template: string;
  network: string;
  cloud_init?: IzvorCloudInit;
  cpu_usage?: number;
  memory_used?: number;
  disk_used?: number;
  uptime?: number;
  tags?: string[];
  description?: string;
  created_at: string;
  updated_at: string;
  error?: string;
}

export interface IzvorCloudInit {
  user?: string;
  password?: string;
  ssh_keys?: string[];
  user_data?: string;
  network_config?: string;
}

export interface IzvorVMTemplate {
  id: string;
  name: string;
  description: string;
  os_type: string;
  min_cores: number;
  min_memory: number;
  min_disk: number;
  default_user: string;
}

export interface IzvorVMSize {
  name: string;
  cores: number;
  memory: number;
  disk: number;
  display_name: string;
}

export interface IzvorCreateVMRequest {
  name: string;
  template?: string;
  os_template?: string;
  size?: string;
  cores?: number;
  memory?: number;
  disk_size?: number;
  network?: string;
  node?: string;
  cloud_init?: IzvorCloudInit;
  tags?: string[];
  description?: string;
}

export interface IzvorVMAction {
  action: 'start' | 'stop' | 'reboot' | 'pause' | 'resume' | 'shutdown';
  force?: boolean;
}

export interface IzvorSnapshot {
  name: string;
  description?: string;
  created_at: string;
  vmstate: boolean;
}

export interface IzvorCreateSnapshotRequest {
  name: string;
  description?: string;
  include_memory?: boolean;
}

export interface IzvorConsoleInfo {
  type: string;
  url: string;
  ticket: string;
  port: number;
  node: string;
}

export interface IzvorVMStats {
  cpu_usage: number;
  memory_used: number;
  memory_total: number;
  disk_used: number;
  disk_total: number;
  network_in: number;
  network_out: number;
  uptime: number;
}

export interface IzvorListResponse<T> {
  data: T[];
  total: number;
}

export interface IzvorError {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

interface IzvorClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  maxRetries?: number;
}

export function createIzvorClient(strapi: Strapi) {
  const config: IzvorClientConfig = {
    baseUrl: process.env.IZVOR_URL || 'http://izvor:8082',
    apiKey: process.env.IZVOR_API_KEY,
    timeout: parseInt(process.env.IZVOR_TIMEOUT || '30000', 10),
    maxRetries: parseInt(process.env.IZVOR_MAX_RETRIES || '3', 10),
  };

  const logger = strapi.log;

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    retries = 0
  ): Promise<T> {
    const url = `${config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    try {
      logger.debug(`Izvor request: ${method} ${url}`);
      
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        let errorData: IzvorError;
        
        try {
          errorData = JSON.parse(errorBody);
        } catch {
          errorData = { error: errorBody || response.statusText };
        }

        // Retry on server errors
        if (response.status >= 500 && retries < (config.maxRetries || 3)) {
          logger.warn(`Izvor server error, retrying (${retries + 1}/${config.maxRetries}): ${errorData.error}`);
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
          return request<T>(method, path, body, retries + 1);
        }

        throw new IzvorClientError(
          errorData.error || 'Unknown Izvor error',
          response.status,
          errorData.code,
          errorData.details
        );
      }

      // Handle empty responses
      const text = await response.text();
      if (!text) {
        return {} as T;
      }

      return JSON.parse(text) as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof IzvorClientError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new IzvorClientError('Request timeout', 408);
        }

        // Retry on network errors
        if (retries < (config.maxRetries || 3)) {
          logger.warn(`Izvor network error, retrying (${retries + 1}/${config.maxRetries}): ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
          return request<T>(method, path, body, retries + 1);
        }

        throw new IzvorClientError(`Network error: ${error.message}`, 503);
      }

      throw new IzvorClientError('Unknown error occurred', 500);
    }
  }

  return {
    // VM operations
    async listVMs(params?: { 
      node?: string; 
      status?: string; 
      limit?: number; 
      offset?: number 
    }): Promise<IzvorListResponse<IzvorVM>> {
      const searchParams = new URLSearchParams();
      if (params?.node) searchParams.set('node', params.node);
      if (params?.status) searchParams.set('status', params.status);
      if (params?.limit) searchParams.set('limit', params.limit.toString());
      if (params?.offset) searchParams.set('offset', params.offset.toString());
      
      const query = searchParams.toString();
      return request<IzvorListResponse<IzvorVM>>('GET', `/api/vms${query ? `?${query}` : ''}`);
    },

    async getVM(id: string): Promise<IzvorVM> {
      return request<IzvorVM>('GET', `/api/vms/${id}`);
    },

    async createVM(data: IzvorCreateVMRequest): Promise<IzvorVM> {
      return request<IzvorVM>('POST', '/api/vms', data);
    },

    async updateVM(id: string, data: Partial<IzvorCreateVMRequest>): Promise<IzvorVM> {
      return request<IzvorVM>('PUT', `/api/vms/${id}`, data);
    },

    async deleteVM(id: string): Promise<void> {
      await request<void>('DELETE', `/api/vms/${id}`);
    },

    // VM actions
    async startVM(id: string): Promise<void> {
      await request<void>('POST', `/api/vms/${id}/action`, { action: 'start' });
    },

    async stopVM(id: string, force = false): Promise<void> {
      await request<void>('POST', `/api/vms/${id}/action`, { action: 'stop', force });
    },

    async rebootVM(id: string): Promise<void> {
      await request<void>('POST', `/api/vms/${id}/action`, { action: 'reboot' });
    },

    async pauseVM(id: string): Promise<void> {
      await request<void>('POST', `/api/vms/${id}/action`, { action: 'pause' });
    },

    async resumeVM(id: string): Promise<void> {
      await request<void>('POST', `/api/vms/${id}/action`, { action: 'resume' });
    },

    async shutdownVM(id: string): Promise<void> {
      await request<void>('POST', `/api/vms/${id}/action`, { action: 'shutdown' });
    },

    // Console
    async getConsole(id: string, type: 'vnc' | 'spice' = 'vnc'): Promise<IzvorConsoleInfo> {
      return request<IzvorConsoleInfo>('GET', `/api/vms/${id}/console?type=${type}`);
    },

    // Stats
    async getVMStats(id: string): Promise<IzvorVMStats> {
      return request<IzvorVMStats>('GET', `/api/vms/${id}/stats`);
    },

    // Snapshots
    async listSnapshots(vmId: string): Promise<IzvorSnapshot[]> {
      const response = await request<{ data: IzvorSnapshot[] }>('GET', `/api/vms/${vmId}/snapshots`);
      return response.data || [];
    },

    async createSnapshot(vmId: string, data: IzvorCreateSnapshotRequest): Promise<IzvorSnapshot> {
      return request<IzvorSnapshot>('POST', `/api/vms/${vmId}/snapshots`, data);
    },

    async restoreSnapshot(vmId: string, snapshotName: string): Promise<void> {
      await request<void>('POST', `/api/vms/${vmId}/snapshots/${snapshotName}/restore`);
    },

    async deleteSnapshot(vmId: string, snapshotName: string): Promise<void> {
      await request<void>('DELETE', `/api/vms/${vmId}/snapshots/${snapshotName}`);
    },

    // Templates and sizes
    async listTemplates(): Promise<IzvorVMTemplate[]> {
      const response = await request<{ data: IzvorVMTemplate[] }>('GET', '/api/templates');
      return response.data || [];
    },

    async listSizes(): Promise<IzvorVMSize[]> {
      // Return predefined sizes matching Izvor's PredefinedSizes
      return [
        { name: 'nano', cores: 1, memory: 256, disk: 5, display_name: 'Nano (1 vCPU, 256MB RAM, 5GB Disk)' },
        { name: 'micro', cores: 1, memory: 512, disk: 10, display_name: 'Micro (1 vCPU, 512MB RAM, 10GB Disk)' },
        { name: 'small', cores: 1, memory: 1024, disk: 20, display_name: 'Small (1 vCPU, 1GB RAM, 20GB Disk)' },
        { name: 'medium', cores: 2, memory: 2048, disk: 40, display_name: 'Medium (2 vCPU, 2GB RAM, 40GB Disk)' },
        { name: 'large', cores: 4, memory: 4096, disk: 80, display_name: 'Large (4 vCPU, 4GB RAM, 80GB Disk)' },
        { name: 'xlarge', cores: 8, memory: 8192, disk: 160, display_name: 'XLarge (8 vCPU, 8GB RAM, 160GB Disk)' },
        { name: 'xxlarge', cores: 16, memory: 16384, disk: 320, display_name: '2XLarge (16 vCPU, 16GB RAM, 320GB Disk)' },
      ];
    },

    // Health check
    async health(): Promise<boolean> {
      try {
        await request<unknown>('GET', '/health');
        return true;
      } catch {
        return false;
      }
    },
  };
}

export class IzvorClientError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'IzvorClientError';
  }
}

export type IzvorClient = ReturnType<typeof createIzvorClient>;
