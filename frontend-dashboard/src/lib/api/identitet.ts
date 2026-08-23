/**
 * Identitet API client.
 *
 * Root-only user management plus the current user's effective access, which the
 * dashboard uses to gate navigation and forms.
 */

import { apiClient } from './client';

export type AccessLevel = 'none' | 'read' | 'write';

export interface IdentitetService {
  key: string;
  label: string;
  owned: boolean;
}

export interface IdentitetMe {
  id: number;
  username: string;
  email: string;
  identitetRole: 'root' | 'member';
  isRoot: boolean;
  grants: Record<string, AccessLevel>;
  services: IdentitetService[];
}

export interface IdentitetUser {
  id: number;
  username: string;
  email: string;
  organization: string | null;
  identitetRole: 'root' | 'member';
  grants: Record<string, AccessLevel>;
  blocked: boolean;
  confirmed: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
}

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  organization?: string;
  grants?: Record<string, AccessLevel>;
}

export const identitetApi = {
  me: async (): Promise<IdentitetMe> => {
    const res = await apiClient.get<{ data: IdentitetMe }>('/identitet/me');
    return res.data.data;
  },

  services: async (): Promise<{ services: IdentitetService[]; levels: AccessLevel[] }> => {
    const res = await apiClient.get<{ data: { services: IdentitetService[]; levels: AccessLevel[] } }>(
      '/identitet/services',
    );
    return res.data.data;
  },

  listUsers: async (): Promise<IdentitetUser[]> => {
    const res = await apiClient.get<{ data: IdentitetUser[] }>('/identitet/users');
    return res.data.data;
  },

  createUser: async (input: CreateUserInput): Promise<IdentitetUser> => {
    const res = await apiClient.post<{ data: IdentitetUser }>('/identitet/users', input);
    return res.data.data;
  },

  updateUser: async (
    id: number,
    patch: { grants?: Record<string, AccessLevel>; blocked?: boolean },
  ): Promise<IdentitetUser> => {
    const res = await apiClient.put<{ data: IdentitetUser }>(`/identitet/users/${id}`, patch);
    return res.data.data;
  },

  deleteUser: async (id: number): Promise<void> => {
    await apiClient.delete(`/identitet/users/${id}`);
  },

  listKeys: async (): Promise<ApiKey[]> => {
    const res = await apiClient.get<{ data: ApiKey[] }>('/identitet/keys');
    return res.data.data;
  },

  createKey: async (input: { name: string; expiresInDays?: number }): Promise<CreatedApiKey> => {
    const res = await apiClient.post<{ data: CreatedApiKey }>('/identitet/keys', input);
    return res.data.data;
  },

  deleteKey: async (id: number): Promise<void> => {
    await apiClient.delete(`/identitet/keys/${id}`);
  },
};

export interface ApiKey {
  id: number;
  name: string;
  keyId: string;
  revoked: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  owner: { id: number; email: string } | null;
}

/** Returned once on creation: `key` is the full secret, shown only this once. */
export interface CreatedApiKey extends ApiKey {
  key: string;
}
