/**
 * Red hooks.
 *
 * Queue depth changes continuously as producers and consumers work, so the
 * list and a queue's stats poll. Receiving messages is imperative (driven by a
 * button on the detail page), not a background query.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { redApi, type CreateQueueInput } from '@/lib/api/red';

export const redKeys = {
  all: ['red'] as const,
  health: () => [...redKeys.all, 'health'] as const,
  queues: () => [...redKeys.all, 'queues'] as const,
  queue: (name: string) => [...redKeys.all, 'queue', name] as const,
  stats: (name: string) => [...redKeys.all, 'stats', name] as const,
  backups: (queue?: string) => [...redKeys.all, 'backups', queue ?? 'all'] as const,
};

export function useRedHealth() {
  return useQuery({
    queryKey: redKeys.health(),
    queryFn: () => redApi.health(),
    staleTime: 30_000,
    retry: false,
  });
}

export function useQueues() {
  return useQuery({
    queryKey: redKeys.queues(),
    queryFn: () => redApi.listQueues(),
    refetchInterval: 10_000,
    staleTime: 3_000,
  });
}

export function useQueue(name: string | undefined) {
  return useQuery({
    queryKey: redKeys.queue(name ?? ''),
    queryFn: () => redApi.getQueue(name as string),
    enabled: Boolean(name),
    refetchInterval: 5_000,
  });
}

export function useCreateQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQueueInput) => redApi.createQueue(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: redKeys.queues() }),
  });
}

export function useDeleteQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => redApi.deleteQueue(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: redKeys.all }),
  });
}

export function usePurgeQueue(name: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => redApi.purge(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: redKeys.all }),
  });
}

export function useSendMessage(queue: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, attributes }: { body: string; attributes?: Record<string, string> }) =>
      redApi.sendMessage(queue, body, attributes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: redKeys.queue(queue) }),
  });
}

/** Receive is imperative: the detail page calls .mutateAsync when asked. */
export function useReceive(queue: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { max_messages?: number; visibility_timeout_seconds?: number }) =>
      redApi.receive(queue, opts),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: redKeys.queue(queue) }),
  });
}

export function useDeleteMessage(queue: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (receiptHandle: string) => redApi.deleteMessage(queue, receiptHandle),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: redKeys.queue(queue) }),
  });
}

export function useBackups(queue?: string) {
  return useQuery({
    queryKey: redKeys.backups(queue),
    queryFn: () => redApi.listBackups(queue),
    staleTime: 10_000,
  });
}

export function useCreateBackup(queue: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => redApi.createBackup(queue),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...redKeys.all, 'backups'] }),
  });
}

export function useDeleteBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => redApi.deleteBackup(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...redKeys.all, 'backups'] }),
  });
}

export function useRestoreBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { backup_id: string; target_queue?: string; confirm: boolean }) =>
      redApi.restoreBackup(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: redKeys.all }),
  });
}

// ---------------------------------------------------------------------------
// Subscriptions (Impuls triggers)
// ---------------------------------------------------------------------------

export function useSubscriptions() {
  return useQuery({
    queryKey: [...redKeys.all, 'subscriptions'] as const,
    queryFn: () => redApi.listSubscriptions(),
    refetchInterval: 5_000,
    staleTime: 3_000,
  });
}

export function useCreateSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; queue: string; function: string; batch_size?: number }) =>
      redApi.createSubscription(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...redKeys.all, 'subscriptions'] }),
  });
}

export function useDeleteSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => redApi.deleteSubscription(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...redKeys.all, 'subscriptions'] }),
  });
}

export function useUpdateQueue(name: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<import('@/lib/api/red').CreateQueueInput>) => redApi.updateQueue(name, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: redKeys.all }),
  });
}

export function useUpdateSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, patch }: { name: string; patch: { enabled?: boolean; batch_size?: number } }) =>
      redApi.updateSubscription(name, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...redKeys.all, 'subscriptions'] }),
  });
}
