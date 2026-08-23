/**
 * Identitet hooks.
 *
 * `useIdentitetMe` is the source of truth for what the current user may see and do;
 * the layout and pages read it to gate navigation and actions. The management
 * hooks are used only by the root Users page.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  identitetApi,
  type AccessLevel,
  type CreateUserInput,
  type IdentitetMe,
} from '@/lib/api/identitet';

export const identitetKeys = {
  me: ['identitet', 'me'] as const,
  users: ['identitet', 'users'] as const,
  services: ['identitet', 'services'] as const,
  keys: ['identitet', 'keys'] as const,
};

export function useIdentitetMe() {
  return useQuery({
    queryKey: identitetKeys.me,
    queryFn: identitetApi.me,
    // Access rarely changes within a session; keep it warm to avoid flicker in
    // the nav on every route change.
    staleTime: 5 * 60 * 1000,
  });
}

export function useIdentitetUsers() {
  return useQuery({ queryKey: identitetKeys.users, queryFn: identitetApi.listUsers });
}

export function useIdentitetServices() {
  return useQuery({ queryKey: identitetKeys.services, queryFn: identitetApi.services });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => identitetApi.createUser(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: identitetKeys.users }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: number;
      patch: { grants?: Record<string, AccessLevel>; blocked?: boolean };
    }) => identitetApi.updateUser(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: identitetKeys.users }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => identitetApi.deleteUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: identitetKeys.users }),
  });
}

/**
 * Whether the current user may access a service at the given level. Defaults to
 * allowing while `me` is still loading, so the nav does not flash empty; the
 * backend is always the real gate.
 */
export function canAccess(
  me: IdentitetMe | undefined,
  service: string,
  level: AccessLevel = 'read',
): boolean {
  if (!me) return true;
  if (me.isRoot) return true;
  const have = me.grants[service] ?? 'none';
  if (level === 'read') return have === 'read' || have === 'write';
  if (level === 'write') return have === 'write';
  return true;
}

// --- API keys (self-service) ------------------------------------------------

export function useApiKeys() {
  return useQuery({ queryKey: identitetKeys.keys, queryFn: identitetApi.listKeys });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; expiresInDays?: number }) =>
      identitetApi.createKey(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: identitetKeys.keys }),
  });
}

export function useDeleteApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => identitetApi.deleteKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: identitetKeys.keys }),
  });
}
