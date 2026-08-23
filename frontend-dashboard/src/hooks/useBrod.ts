/**
 * Brod hooks.
 *
 * Container state changes on its own (a container can exit at any time), so
 * the lists poll. Repository contents only change on a push, so they do not
 * poll as hard.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { brodApi, type CreateContainerInput } from '@/lib/api/brod';

export const brodKeys = {
  all: ['brod'] as const,
  health: () => [...brodKeys.all, 'health'] as const,
  registry: () => [...brodKeys.all, 'registry'] as const,
  repositories: () => [...brodKeys.all, 'repositories'] as const,
  repository: (name: string) => [...brodKeys.all, 'repository', name] as const,
  images: (repository: string) => [...brodKeys.all, 'images', repository] as const,
  containers: () => [...brodKeys.all, 'containers'] as const,
  container: (id: string) => [...brodKeys.all, 'container', id] as const,
  logs: (id: string) => [...brodKeys.all, 'logs', id] as const,
  stats: (id: string) => [...brodKeys.all, 'stats', id] as const,
};

export function useBrodHealth() {
  return useQuery({
    queryKey: brodKeys.health(),
    queryFn: () => brodApi.health(),
    staleTime: 30_000,
    retry: false,
  });
}

export function useBrodRegistry() {
  return useQuery({
    queryKey: brodKeys.registry(),
    queryFn: () => brodApi.registry(),
    // The registry address is deployment configuration, not runtime state.
    staleTime: Infinity,
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// Repositories
// ---------------------------------------------------------------------------

export function useRepositories() {
  return useQuery({
    queryKey: brodKeys.repositories(),
    queryFn: () => brodApi.listRepositories(),
    // Repositories only change when someone pushes, so a slow poll is enough
    // to notice a new image without hammering the registry, which has to read
    // a manifest per tag to answer.
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useRepositoryImages(repository: string | undefined) {
  return useQuery({
    queryKey: brodKeys.images(repository ?? ''),
    queryFn: () => brodApi.listImages(repository as string),
    enabled: Boolean(repository),
    staleTime: 30_000,
  });
}

export function useCreateRepository() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) =>
      brodApi.createRepository(name, description),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: brodKeys.repositories() }),
  });
}

export function useDeleteRepository() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => brodApi.deleteRepository(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: brodKeys.all }),
  });
}

export function useDeleteImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ repository, tag }: { repository: string; tag: string }) =>
      brodApi.deleteImage(repository, tag),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: brodKeys.all }),
  });
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

export function useContainers(options?: { autoRefresh?: boolean }) {
  return useQuery({
    queryKey: brodKeys.containers(),
    queryFn: () => brodApi.listContainers(true),
    // A container can exit on its own, so the list needs to keep up.
    refetchInterval: (options?.autoRefresh ?? true) ? 10_000 : (false as const),
    staleTime: 5_000,
  });
}

export function useContainer(id: string | undefined) {
  return useQuery({
    queryKey: brodKeys.container(id ?? ''),
    queryFn: () => brodApi.getContainer(id as string),
    enabled: Boolean(id),
    refetchInterval: 10_000,
  });
}

export function useContainerLogs(id: string | undefined, tail = 200, autoRefresh = true) {
  return useQuery({
    queryKey: [...brodKeys.logs(id ?? ''), tail],
    queryFn: () => brodApi.containerLogs(id as string, tail),
    enabled: Boolean(id),
    refetchInterval: autoRefresh ? 5_000 : (false as const),
  });
}

export function useContainerStats(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: brodKeys.stats(id ?? ''),
    queryFn: () => brodApi.containerStats(id as string),
    enabled: Boolean(id) && enabled,
    refetchInterval: 10_000,
  });
}

export function useCreateContainer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContainerInput) => brodApi.createContainer(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: brodKeys.containers() }),
  });
}

export function useDeleteContainer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => brodApi.deleteContainer(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: brodKeys.containers() }),
  });
}

/**
 * One hook for the three lifecycle actions, which differ only in which call
 * they make. Invalidating the whole container tree keeps the detail view and
 * the list in agreement.
 */
export function useContainerAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'start' | 'stop' | 'restart' }) => {
      switch (action) {
        case 'start':
          return brodApi.startContainer(id);
        case 'stop':
          return brodApi.stopContainer(id);
        case 'restart':
          return brodApi.restartContainer(id);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: brodKeys.all }),
  });
}
