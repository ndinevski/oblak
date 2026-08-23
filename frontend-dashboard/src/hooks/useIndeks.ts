/**
 * Indeks hooks.
 *
 * Tables and their item counts change as data is written, so the list refetches
 * on a modest interval. Item reads (query/scan) are driven imperatively from
 * the detail page rather than polled, since they depend on user input.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  indeksApi,
  type CreateTableInput,
  type Item,
  type QueryInput,
} from '@/lib/api/indeks';

export const indeksKeys = {
  all: ['indeks'] as const,
  health: () => [...indeksKeys.all, 'health'] as const,
  tables: () => [...indeksKeys.all, 'tables'] as const,
  table: (name: string) => [...indeksKeys.all, 'table', name] as const,
  backups: (table?: string) => [...indeksKeys.all, 'backups', table ?? 'all'] as const,
};

export function useIndeksHealth() {
  return useQuery({
    queryKey: indeksKeys.health(),
    queryFn: () => indeksApi.health(),
    staleTime: 30_000,
    retry: false,
  });
}

export function useTables() {
  return useQuery({
    queryKey: indeksKeys.tables(),
    queryFn: () => indeksApi.listTables(),
    refetchInterval: 20_000,
    staleTime: 5_000,
  });
}

export function useTable(name: string | undefined) {
  return useQuery({
    queryKey: indeksKeys.table(name ?? ''),
    queryFn: () => indeksApi.getTable(name as string),
    enabled: Boolean(name),
    refetchInterval: 15_000,
  });
}

export function useCreateTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTableInput) => indeksApi.createTable(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: indeksKeys.tables() }),
  });
}

export function useDeleteTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => indeksApi.deleteTable(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: indeksKeys.all }),
  });
}

export function usePutItem(table: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: Item) => indeksApi.putItem(table, item),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: indeksKeys.table(table) }),
  });
}

export function useDeleteItem(table: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ partitionValue, sortValue }: { partitionValue: unknown; sortValue?: unknown }) =>
      indeksApi.deleteItem(table, partitionValue, sortValue),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: indeksKeys.table(table) }),
  });
}

/** Runs a query imperatively (the detail page calls .mutateAsync on demand). */
export function useQueryItems(table: string) {
  return useMutation({
    mutationFn: (input: QueryInput) => indeksApi.query(table, input),
  });
}

export function useScanItems(table: string) {
  return useMutation({
    mutationFn: (limit?: number) => indeksApi.scan(table, limit),
  });
}

export function useBackups(table?: string) {
  return useQuery({
    queryKey: indeksKeys.backups(table),
    queryFn: () => indeksApi.listBackups(table),
    staleTime: 10_000,
  });
}

export function useCreateBackup(table: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => indeksApi.createBackup(table),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...indeksKeys.all, 'backups'] }),
  });
}

export function useDeleteBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => indeksApi.deleteBackup(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...indeksKeys.all, 'backups'] }),
  });
}

export function useRestoreBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { backup_id: string; target_table?: string; confirm: boolean }) =>
      indeksApi.restoreBackup(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: indeksKeys.all }),
  });
}
