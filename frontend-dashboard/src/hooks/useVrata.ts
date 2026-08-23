/**
 * Vrata hooks.
 *
 * The route table changes both when a person edits it and when auto-discovery
 * reconciles it against Brod, so the list polls at a modest rate to pick up
 * discovered routes without hammering the gateway.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { vrataApi, type CreateRouteInput } from '@/lib/api/vrata';

export const vrataKeys = {
  all: ['vrata'] as const,
  health: () => [...vrataKeys.all, 'health'] as const,
  routes: () => [...vrataKeys.all, 'routes'] as const,
};

export function useVrataHealth() {
  return useQuery({
    queryKey: vrataKeys.health(),
    queryFn: () => vrataApi.health(),
    staleTime: 30_000,
    retry: false,
  });
}

export function useRoutes() {
  return useQuery({
    queryKey: vrataKeys.routes(),
    queryFn: () => vrataApi.listRoutes(),
    // Auto-discovery reconciles against Brod on its own schedule, so a slow
    // poll surfaces new or removed routes without constant refetching.
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
}

export function useCreateRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRouteInput) => vrataApi.createRoute(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: vrataKeys.routes() }),
  });
}

export function useDeleteRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => vrataApi.deleteRoute(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: vrataKeys.all }),
  });
}
