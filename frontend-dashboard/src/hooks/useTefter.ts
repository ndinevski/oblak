/**
 * Tefter hooks.
 *
 * A newly created instance spends a short while in "creating", and a replica's
 * lag changes continuously, so those views poll. The list of instances and the
 * catalogue of engines and sizes are near-static and do not.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  tefterApi,
  type CreateInstanceInput,
  type RestoreInput,
  type DBInstance,
} from '@/lib/api/tefter';

export const tefterKeys = {
  all: ['tefter'] as const,
  health: () => [...tefterKeys.all, 'health'] as const,
  engines: () => [...tefterKeys.all, 'engines'] as const,
  sizes: () => [...tefterKeys.all, 'sizes'] as const,
  instances: () => [...tefterKeys.all, 'instances'] as const,
  instance: (name: string) => [...tefterKeys.all, 'instance', name] as const,
  replication: (name: string) => [...tefterKeys.all, 'replication', name] as const,
  backups: (instance?: string) => [...tefterKeys.all, 'backups', instance ?? 'all'] as const,
};

/** True while an instance is mid-transition, so callers know to keep polling. */
function isTransient(instance: DBInstance): boolean {
  return (
    instance.status === 'creating' ||
    instance.status === 'starting' ||
    instance.status === 'stopping' ||
    instance.status === 'restoring'
  );
}

export function useTefterHealth() {
  return useQuery({
    queryKey: tefterKeys.health(),
    queryFn: () => tefterApi.health(),
    staleTime: 30_000,
    retry: false,
  });
}

export function useEngines() {
  return useQuery({
    queryKey: tefterKeys.engines(),
    queryFn: () => tefterApi.engines(),
    // The supported engines and versions are build-time configuration.
    staleTime: Infinity,
    retry: false,
  });
}

export function useSizes() {
  return useQuery({
    queryKey: tefterKeys.sizes(),
    queryFn: () => tefterApi.sizes(),
    staleTime: Infinity,
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

export function useInstances() {
  return useQuery({
    queryKey: tefterKeys.instances(),
    queryFn: () => tefterApi.listInstances(),
    // Poll while anything is still settling, otherwise let it rest.
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && data.some(isTransient) ? 3_000 : 20_000;
    },
    staleTime: 5_000,
  });
}

export function useInstance(name: string | undefined) {
  return useQuery({
    queryKey: tefterKeys.instance(name ?? ''),
    queryFn: () => tefterApi.getInstance(name as string),
    enabled: Boolean(name),
    refetchInterval: (query) => (query.state.data && isTransient(query.state.data) ? 3_000 : 15_000),
  });
}

export function useCreateInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInstanceInput) => tefterApi.createInstance(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tefterKeys.instances() }),
  });
}

export function useDeleteInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => tefterApi.deleteInstance(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tefterKeys.all }),
  });
}

export function useInstanceAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, action }: { name: string; action: 'start' | 'stop' }) =>
      action === 'start' ? tefterApi.startInstance(name) : tefterApi.stopInstance(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tefterKeys.all }),
  });
}

// ---------------------------------------------------------------------------
// Replicas
// ---------------------------------------------------------------------------

export function useReplicationStatus(name: string | undefined, enabled = true) {
  return useQuery({
    queryKey: tefterKeys.replication(name ?? ''),
    queryFn: () => tefterApi.replicationStatus(name as string),
    enabled: Boolean(name) && enabled,
    // Lag is live data; a replica that falls behind should show it quickly.
    refetchInterval: 5_000,
    retry: false,
  });
}

export function useCreateReplica() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ source, name, size }: { source: string; name: string; size?: string }) =>
      tefterApi.createReplica(source, { name, size }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tefterKeys.instances() }),
  });
}

export function usePromoteReplica() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => tefterApi.promoteReplica(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tefterKeys.all }),
  });
}

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

export function useBackups(instance?: string) {
  return useQuery({
    queryKey: tefterKeys.backups(instance),
    queryFn: () => tefterApi.listBackups(instance),
    staleTime: 10_000,
  });
}

export function useCreateBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ instance, description }: { instance: string; description?: string }) =>
      tefterApi.createBackup(instance, description),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...tefterKeys.all, 'backups'] }),
  });
}

export function useDeleteBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tefterApi.deleteBackup(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...tefterKeys.all, 'backups'] }),
  });
}

export function useRestoreBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RestoreInput) => tefterApi.restoreBackup(input),
    // A restore can create a pre-restore backup and change instance state, so
    // refresh everything.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tefterKeys.all }),
  });
}
