/**
 * Virtual Machines Hooks
 * React Query hooks for VM operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listVMs,
  getVM,
  createVM,
  updateVM,
  deleteVM,
  startVM,
  stopVM,
  rebootVM,
  pauseVM,
  resumeVM,
  getVMConsole,
  getVMStats,
  listVMSnapshots,
  createVMSnapshot,
  restoreVMSnapshot,
  deleteVMSnapshot,
  getVMTemplates,
  getVMSizes,
  syncVM,
  type VMListParams,
  type CreateVMRequest,
  type UpdateVMRequest,
  type CreateSnapshotRequest,
  type VirtualMachine,
} from '../lib/api/vms';

// Query keys
export const vmKeys = {
  all: ['virtual-machines'] as const,
  lists: () => [...vmKeys.all, 'list'] as const,
  list: (params: VMListParams) => [...vmKeys.lists(), params] as const,
  details: () => [...vmKeys.all, 'detail'] as const,
  detail: (id: string) => [...vmKeys.details(), id] as const,
  stats: (id: string) => [...vmKeys.all, 'stats', id] as const,
  console: (id: string, type: 'vnc' | 'spice') => [...vmKeys.all, 'console', id, type] as const,
  snapshots: (id: string) => [...vmKeys.all, 'snapshots', id] as const,
  templates: () => [...vmKeys.all, 'templates'] as const,
  sizes: () => [...vmKeys.all, 'sizes'] as const,
};

// List VMs
export function useVMs(params: VMListParams = {}) {
  return useQuery({
    queryKey: vmKeys.list(params),
    queryFn: () => listVMs(params),
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every minute for status updates
  });
}

// Get single VM
export function useVM(id: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: vmKeys.detail(id),
    queryFn: () => getVM(id),
    enabled: options.enabled !== false && !!id,
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000, // More frequent updates for detail view
  });
}

// Get VM stats
export function useVMStats(id: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: vmKeys.stats(id),
    queryFn: () => getVMStats(id),
    enabled: options.enabled !== false && !!id,
    staleTime: 5 * 1000,
    refetchInterval: 10 * 1000, // Frequent updates for live stats
  });
}

// Get VM console info
export function useVMConsole(id: string, type: 'vnc' | 'spice' = 'vnc', options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: vmKeys.console(id, type),
    queryFn: () => getVMConsole(id, type),
    enabled: options.enabled !== false && !!id,
    staleTime: 0, // Always fetch fresh ticket
    gcTime: 0, // Don't cache
  });
}

// Get VM snapshots
export function useVMSnapshots(vmId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: vmKeys.snapshots(vmId),
    queryFn: () => listVMSnapshots(vmId),
    enabled: options.enabled !== false && !!vmId,
  });
}

// Get VM templates
export function useVMTemplates() {
  return useQuery({
    queryKey: vmKeys.templates(),
    queryFn: getVMTemplates,
    staleTime: 5 * 60 * 1000, // Templates rarely change
  });
}

// Get VM sizes
export function useVMSizes() {
  return useQuery({
    queryKey: vmKeys.sizes(),
    queryFn: getVMSizes,
    staleTime: Infinity, // Sizes are static
  });
}

// Create VM
export function useCreateVM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateVMRequest) => createVM(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vmKeys.lists() });
    },
  });
}

// Update VM
export function useUpdateVM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateVMRequest }) => updateVM(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: vmKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: vmKeys.lists() });
    },
  });
}

// Delete VM
export function useDeleteVM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteVM(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: vmKeys.lists() });
      queryClient.removeQueries({ queryKey: vmKeys.detail(id) });
    },
  });
}

// VM Actions
export function useStartVM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => startVM(id),
    onMutate: async (id) => {
      // Optimistically update status
      await queryClient.cancelQueries({ queryKey: vmKeys.detail(id) });
      const previousVM = queryClient.getQueryData(vmKeys.detail(id));
      
      queryClient.setQueryData(vmKeys.detail(id), (old: any) => ({
        ...old,
        data: { ...old?.data, status: 'starting' },
      }));

      return { previousVM };
    },
    onError: (_err, id, context) => {
      if (context?.previousVM) {
        queryClient.setQueryData(vmKeys.detail(id), context.previousVM);
      }
    },
    onSettled: (_data, _err, id) => {
      queryClient.invalidateQueries({ queryKey: vmKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: vmKeys.lists() });
    },
  });
}

export function useStopVM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, force = false }: { id: string; force?: boolean }) => stopVM(id, force),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: vmKeys.detail(id) });
      const previousVM = queryClient.getQueryData(vmKeys.detail(id));
      
      queryClient.setQueryData(vmKeys.detail(id), (old: any) => ({
        ...old,
        data: { ...old?.data, status: 'stopping' },
      }));

      return { previousVM };
    },
    onError: (_err, { id }, context) => {
      if (context?.previousVM) {
        queryClient.setQueryData(vmKeys.detail(id), context.previousVM);
      }
    },
    onSettled: (_data, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: vmKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: vmKeys.lists() });
    },
  });
}

export function useRebootVM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => rebootVM(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: vmKeys.detail(id) });
      const previousVM = queryClient.getQueryData(vmKeys.detail(id));
      
      queryClient.setQueryData(vmKeys.detail(id), (old: any) => ({
        ...old,
        data: { ...old?.data, status: 'stopping' },
      }));

      return { previousVM };
    },
    onError: (_err, id, context) => {
      if (context?.previousVM) {
        queryClient.setQueryData(vmKeys.detail(id), context.previousVM);
      }
    },
    onSettled: (_data, _err, id) => {
      queryClient.invalidateQueries({ queryKey: vmKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: vmKeys.lists() });
    },
  });
}

export function usePauseVM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => pauseVM(id),
    onSettled: (_data, _err, id) => {
      queryClient.invalidateQueries({ queryKey: vmKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: vmKeys.lists() });
    },
  });
}

export function useResumeVM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => resumeVM(id),
    onSettled: (_data, _err, id) => {
      queryClient.invalidateQueries({ queryKey: vmKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: vmKeys.lists() });
    },
  });
}

// Snapshots
export function useCreateVMSnapshot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ vmId, data }: { vmId: string; data: CreateSnapshotRequest }) =>
      createVMSnapshot(vmId, data),
    onSuccess: (_data, { vmId }) => {
      queryClient.invalidateQueries({ queryKey: vmKeys.snapshots(vmId) });
    },
  });
}

export function useRestoreVMSnapshot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ vmId, snapshotName }: { vmId: string; snapshotName: string }) =>
      restoreVMSnapshot(vmId, snapshotName),
    onSuccess: (_data, { vmId }) => {
      queryClient.invalidateQueries({ queryKey: vmKeys.detail(vmId) });
      queryClient.invalidateQueries({ queryKey: vmKeys.lists() });
    },
  });
}

export function useDeleteVMSnapshot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ vmId, snapshotName }: { vmId: string; snapshotName: string }) =>
      deleteVMSnapshot(vmId, snapshotName),
    onSuccess: (_data, { vmId }) => {
      queryClient.invalidateQueries({ queryKey: vmKeys.snapshots(vmId) });
    },
  });
}

// Sync VM
export function useSyncVM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => syncVM(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: vmKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: vmKeys.lists() });
    },
  });
}

// Polling hook for VM status
export function useVMPolling(vm: VirtualMachine | undefined, interval = 5000) {
  const queryClient = useQueryClient();

  const isTransitioning = vm?.status && ['starting', 'stopping', 'creating', 'deleting'].includes(vm.status);

  useQuery({
    queryKey: ['vm-polling', vm?.documentId],
    queryFn: async () => {
      if (vm?.documentId) {
        await queryClient.invalidateQueries({ queryKey: vmKeys.detail(vm.documentId) });
      }
      return null;
    },
    enabled: isTransitioning && !!vm?.documentId,
    refetchInterval: interval,
    staleTime: 0,
  });

  return { isTransitioning };
}
