/**
 * Alert hooks.
 *
 * Rule state changes on the backend's evaluation timer, so the list polls; the
 * rule-type catalogue is static config and does not.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  alertsApi,
  type AlertRuleInput,
} from '@/lib/api/alerts';

export const alertKeys = {
  all: ['alerts'] as const,
  list: () => [...alertKeys.all, 'list'] as const,
  types: () => [...alertKeys.all, 'types'] as const,
  history: (hours: number) => [...alertKeys.all, 'history', hours] as const,
};

export function useAlertRules(options?: { autoRefresh?: boolean }) {
  return useQuery({
    queryKey: alertKeys.list(),
    queryFn: () => alertsApi.list(),
    // Matches the backend's default 60s evaluation cadence: polling faster
    // than rules are evaluated only adds load.
    refetchInterval: (options?.autoRefresh ?? true) ? 30_000 : (false as const),
    staleTime: 10_000,
  });
}

export function useAlertRuleTypes() {
  return useQuery({
    queryKey: alertKeys.types(),
    queryFn: () => alertsApi.types(),
    // The catalogue is compiled into the backend and cannot change at runtime.
    staleTime: Infinity,
  });
}

export function useAlertHistory(hours = 24) {
  return useQuery({
    queryKey: alertKeys.history(hours),
    queryFn: () => alertsApi.history(hours),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useCreateAlertRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AlertRuleInput) => alertsApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alertKeys.all }),
  });
}

export function useUpdateAlertRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<AlertRuleInput> }) =>
      alertsApi.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alertKeys.all }),
  });
}

export function useDeleteAlertRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => alertsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alertKeys.all }),
  });
}

/** Evaluates a draft rule without saving, for the form's preview. */
export function useTestAlertRule() {
  return useMutation({
    mutationFn: (input: Partial<AlertRuleInput>) => alertsApi.test(input),
  });
}

export function useMuteAlertRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, minutes }: { id: number; minutes: number | null }) =>
      alertsApi.mute(id, minutes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alertKeys.all }),
  });
}

export function useEvaluateAlerts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => alertsApi.evaluateAll(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alertKeys.all }),
  });
}
