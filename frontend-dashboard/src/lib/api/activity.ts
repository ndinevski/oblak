/**
 * Activity API Client
 * Handles all activity log related API calls
 */

import api from './client';

// =============================================================================
// Types
// =============================================================================

export interface ActivityLog {
  id: number;
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  details?: Record<string, unknown>;
  status: 'success' | 'failure' | 'pending';
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivitySummary {
  totalActivities: number;
  byAction: Record<string, number>;
  byResourceType: Record<string, number>;
  byStatus: Record<string, number>;
  recentDays: number;
}

export interface ActivityFilters {
  resourceType?: string;
  action?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Get activity logs with optional filters
 */
export async function getActivityLogs(filters: ActivityFilters = {}): Promise<PaginatedResponse<ActivityLog>> {
  const params = new URLSearchParams();
  
  if (filters.resourceType) params.append('resourceType', filters.resourceType);
  if (filters.action) params.append('action', filters.action);
  if (filters.status) params.append('status', filters.status);
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  if (filters.page) params.append('page', String(filters.page));
  if (filters.pageSize) params.append('pageSize', String(filters.pageSize));

  const queryString = params.toString();
  const url = `/activity-logs${queryString ? `?${queryString}` : ''}`;
  
  const response = await api.get(url);
  return response.data;
}

/**
 * Get a single activity log by ID
 */
export async function getActivityLog(id: number): Promise<ActivityLog> {
  const response = await api.get(`/activity-logs/${id}`);
  return response.data.data;
}

/**
 * Get activity summary statistics
 */
export async function getActivitySummary(days = 30): Promise<ActivitySummary> {
  const response = await api.get(`/activity-logs/summary?days=${days}`);
  return response.data.data;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get human-readable action label
 */
export function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    // Function actions
    'function.create': 'Created Function',
    'function.update': 'Updated Function',
    'function.delete': 'Deleted Function',
    'function.invoke': 'Invoked Function',
    'function.deploy': 'Deployed Function',
    
    // VM actions
    'vm.create': 'Created VM',
    'vm.update': 'Updated VM',
    'vm.delete': 'Deleted VM',
    'vm.start': 'Started VM',
    'vm.stop': 'Stopped VM',
    'vm.restart': 'Restarted VM',
    
    // Bucket actions
    'bucket.list': 'Listed Buckets',
    'bucket.view': 'Viewed Bucket',
    'bucket.create': 'Created Bucket',
    'bucket.update': 'Updated Bucket',
    'bucket.delete': 'Deleted Bucket',
    'bucket.sync': 'Synced Bucket',
    'bucket.stats': 'Viewed Bucket Stats',
    'bucket.quota': 'Viewed Bucket Quota',
    
    // Object actions
    'object.list': 'Listed Objects',
    'object.info': 'Viewed Object Info',
    'object.upload': 'Uploaded Object',
    'object.download': 'Downloaded Object',
    'object.delete': 'Deleted Object',
    'object.deleteMany': 'Deleted Multiple Objects',
    'object.deleteFolder': 'Deleted Folder',
    'object.copy': 'Copied Object',
    'object.presign': 'Generated Presigned URL',
    
    // User actions
    'user.login': 'Logged In',
    'user.logout': 'Logged Out',
    'user.register': 'Registered',
    'user.update': 'Updated Profile',
    'user.password_change': 'Changed Password',

    // Polaroid actions
    'polaroid.upload': 'Uploaded Photo/Video',
    'polaroid.delete': 'Deleted Photo/Video',
    'polaroid.favorite': 'Favorited Photo/Video',
    'polaroid.archive': 'Archived Photo/Video',
    'polaroid.album.create': 'Created Album',
    'polaroid.album.update': 'Updated Album',
    'polaroid.album.delete': 'Deleted Album',
    'polaroid.share.create': 'Created Shared Link',
    'polaroid.share.delete': 'Deleted Shared Link',
  };
  
  return labels[action] || action.replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Get action type for styling
 */
export function getActionType(action: string): 'create' | 'update' | 'delete' | 'read' | 'other' {
  if (action.includes('create') || action.includes('register')) return 'create';
  if (action.includes('update') || action.includes('deploy')) return 'update';
  if (action.includes('delete')) return 'delete';
  if (action.includes('invoke') || action.includes('download') || action.includes('login')) return 'read';
  if (action.includes('upload')) return 'create';
  if (action.includes('share') || action.includes('favorite') || action.includes('archive')) return 'update';
  return 'other';
}

/**
 * Get action color for badges
 */
export function getActionColor(action: string): string {
  const type = getActionType(action);
  const colors: Record<string, string> = {
    create: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    update: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    delete: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    read: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    other: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  };
  return colors[type];
}

/**
 * Get resource type label
 */
export function getResourceTypeLabel(resourceType: string): string {
  const labels: Record<string, string> = {
    function: 'Impuls Function',
    'virtual-machine': 'Virtual Machine',
    vm: 'Izvor VM',
    bucket: 'Spomen Bucket',
    object: 'Object',
    user: 'User',
    polaroid: 'Polaroid',
  };
  return labels[resourceType] || resourceType;
}

/**
 * Get resource type icon name
 */
export function getResourceTypeIcon(resourceType: string): string {
  const icons: Record<string, string> = {
    function: 'Code',
    'virtual-machine': 'Server',
    vm: 'Server',
    bucket: 'Database',
    object: 'File',
    user: 'User',
    polaroid: 'Camera',
  };
  return icons[resourceType] || 'Activity';
}

/**
 * Get status color
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    failure: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  };
  return colors[status] || colors.success;
}

/**
 * Format relative time
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}

/**
 * Get all available resource types
 */
export function getResourceTypes(): { value: string; label: string }[] {
  return [
    { value: 'function', label: 'Impuls Functions' },
    { value: 'virtual-machine', label: 'Izvor VMs' },
    { value: 'bucket', label: 'Spomen Buckets' },
    { value: 'object', label: 'Objects' },
    { value: 'user', label: 'Users' },
    { value: 'polaroid', label: 'Polaroid' },
  ];
}

/**
 * Get all available actions
 */
export function getActions(): { value: string; label: string }[] {
  return [
    { value: 'create', label: 'Create' },
    { value: 'update', label: 'Update' },
    { value: 'delete', label: 'Delete' },
    { value: 'invoke', label: 'Invoke' },
    { value: 'start', label: 'Start' },
    { value: 'stop', label: 'Stop' },
    { value: 'upload', label: 'Upload' },
    { value: 'download', label: 'Download' },
  ];
}

/**
 * Get all available statuses
 */
export function getStatuses(): { value: string; label: string }[] {
  return [
    { value: 'success', label: 'Success' },
    { value: 'failure', label: 'Failure' },
    { value: 'pending', label: 'Pending' },
  ];
}
