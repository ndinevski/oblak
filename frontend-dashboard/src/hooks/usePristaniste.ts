/**
 * Pristaniste hooks.
 *
 * Container state changes on its own (a container can exit at any time), so
 * the lists poll. Repository contents only change on a push, so they do not
 * poll as hard.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pristanisteApi, type CreateContainerInput } from '@/lib/api/pristaniste';

export const pristanisteKeys = {
  all: ['pristaniste'] as const,
  health: () => [...pristanisteKeys.all, 'health'] as const,
  registry: () => [...pristanisteKeys.all, 'registry'] as const,
  repositories: () => [...pristanisteKeys.all, 'repositories'] as const,
  repository: (name: string) => [...pristanisteKeys.all, 'repository', name] as const,
  images: (repository: string) => [...pristanisteKeys.all, 'images', repository] as const,
  containers: () => [...pristanisteKeys.all, 'containers'] as const,
  container: (id: string) => [...pristanisteKeys.all, 'container', id] as const,
  logs: (id: string) => [...pristanisteKeys.all, 'logs', id] as const,
  stats: (id: string) => [...pristanisteKeys.all, 'stats', id] as const,
};

export function usePristanisteHealth() {
  return useQuery({
    queryKey: pristanisteKeys.health(),
    queryFn: () => pristanisteApi.health(),
    staleTime: 30_000,
    retry: false,
  });
}

export function usePristanisteRegistry() {
  return useQuery({
    queryKey: pristanisteKeys.registry(),
    queryFn: () => pristanisteApi.registry(),
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
    queryKey: pristanisteKeys.repositories(),
    queryFn: () => pristanisteApi.listRepositories(),
    // Repositories only change when someone pushes, so a slow poll is enough
    // to notice a new image without hammering the registry, which has to read
    // a manifest per tag to answer.
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useRepositoryImages(repository: string | undefined) {
  return useQuery({
    queryKey: pristanisteKeys.images(repository ?? ''),
    queryFn: () => pristanisteApi.listImages(repository as string),
    enabled: Boolean(repository),
    staleTime: 30_000,
  });
}

export function useCreateRepository() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) =>
      pristanisteApi.createRepository(name, description),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pristanisteKeys.repositories() }),
  });
}

export function useDeleteRepository() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => pristanisteApi.deleteRepository(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pristanisteKeys.all }),
  });
}

export function useDeleteImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ repository, tag }: { repository: string; tag: string }) =>
      pristanisteApi.deleteImage(repository, tag),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pristanisteKeys.all }),
  });
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

export function useContainers(options?: { autoRefresh?: boolean }) {
  return useQuery({
    queryKey: pristanisteKeys.containers(),
    queryFn: () => pristanisteApi.listContainers(true),
    // A container can exit on its own, so the list needs to keep up.
    refetchInterval: (options?.autoRefresh ?? true) ? 10_000 : (false as const),
    staleTime: 5_000,
  });
}

export function useContainer(id: string | undefined) {
  return useQuery({
    queryKey: pristanisteKeys.container(id ?? ''),
    queryFn: () => pristanisteApi.getContainer(id as string),
    enabled: Boolean(id),
    refetchInterval: 10_000,
  });
}

export function useContainerLogs(id: string | undefined, tail = 200, autoRefresh = true) {
  return useQuery({
    queryKey: [...pristanisteKeys.logs(id ?? ''), tail],
    queryFn: () => pristanisteApi.containerLogs(id as string, tail),
    enabled: Boolean(id),
    refetchInterval: autoRefresh ? 5_000 : (false as const),
  });
}

export function useContainerStats(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: pristanisteKeys.stats(id ?? ''),
    queryFn: () => pristanisteApi.containerStats(id as string),
    enabled: Boolean(id) && enabled,
    refetchInterval: 10_000,
  });
}

export function useCreateContainer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContainerInput) => pristanisteApi.createContainer(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pristanisteKeys.containers() }),
  });
}

export function useDeleteContainer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pristanisteApi.deleteContainer(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pristanisteKeys.containers() }),
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
          return pristanisteApi.startContainer(id);
        case 'stop':
          return pristanisteApi.stopContainer(id);
        case 'restart':
          return pristanisteApi.restartContainer(id);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pristanisteKeys.all }),
  });
}
