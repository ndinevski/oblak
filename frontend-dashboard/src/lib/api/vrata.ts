/**
 * Vrata API client.
 *
 * The gateway's route table, proxied through Strapi. Routes map an incoming
 * request to a Brod container or Izvor VM so its traffic is traced and logged.
 */

import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RouteKind = 'container' | 'vm' | 'custom';

/** Who created a route: a person, or an auto-discoverer. */
export type RouteSource = 'manual' | 'brod' | '';

export interface Route {
  name: string;
  kind: RouteKind;
  upstream: string;
  host?: string;
  strip_prefix: boolean;
  target?: string;
  source?: RouteSource;
  created_at: string;
}

export interface CreateRouteInput {
  name: string;
  kind?: RouteKind;
  upstream: string;
  host?: string;
  target?: string;
  strip_prefix?: boolean;
}

export interface VrataHealth {
  service: string;
  status: string;
  routes?: number;
  proxy_port?: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/** Unwraps Strapi's `{ data: ... }` envelope. */
async function get<T>(path: string): Promise<T> {
  const response = await apiClient.get<{ data: T }>(`/vrata${path}`);
  return response.data.data;
}

export const vrataApi = {
  health: () => get<VrataHealth>('/health'),

  listRoutes: async (): Promise<Route[]> => {
    const response = await apiClient.get<{ data: Route[] }>('/vrata/routes');
    // The proxy returns the Vrata payload verbatim under `data`; tolerate both
    // a bare array and a `{ routes: [...] }` envelope.
    const data = response.data.data as Route[] | { routes: Route[] };
    return Array.isArray(data) ? data : (data.routes ?? []);
  },

  getRoute: (name: string) => get<Route>(`/routes/${encodeURIComponent(name)}`),

  createRoute: async (input: CreateRouteInput): Promise<Route> => {
    const response = await apiClient.post<{ data: Route }>('/vrata/routes', input);
    return response.data.data;
  },

  deleteRoute: async (name: string): Promise<void> => {
    await apiClient.delete(`/vrata/routes/${encodeURIComponent(name)}`);
  },
};

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

export function routeKindLabel(kind: RouteKind): string {
  switch (kind) {
    case 'container':
      return 'Container';
    case 'vm':
      return 'VM';
    default:
      return 'Custom';
  }
}

/**
 * Source styling. As elsewhere in the dashboard, the label always travels with
 * the colour so state is never carried by colour alone. An empty source is a
 * route created before the field existed, which is treated as manual.
 */
export function routeSourceLabel(source: RouteSource | undefined): string {
  if (source === 'brod') return 'Auto (Brod)';
  return 'Manual';
}

export function routeSourceClass(source: RouteSource | undefined): string {
  if (source === 'brod') {
    return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20';
  }
  return 'bg-muted text-muted-foreground border-border';
}

/** True for a route Vrata manages itself; such a route should not be hand-edited. */
export function isAutoManaged(route: Route): boolean {
  return route.source === 'brod';
}

/**
 * How to reach a route through the gateway, for display. A host route answers
 * on its hostname; a path route answers under /<name> on the proxy port.
 */
export function routeAccessHint(route: Route, proxyPort?: string): string {
  const port = proxyPort || '8090';
  if (route.host) {
    return `Host: ${route.host}`;
  }
  return `:${port}/${route.name}/`;
}
