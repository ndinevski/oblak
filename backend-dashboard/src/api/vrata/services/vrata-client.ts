/**
 * Vrata Gateway Client
 * HTTP client for the Vrata gateway's route-management API.
 *
 * Only the control plane (the route table) is proxied here. The data plane -
 * actual proxied workload traffic - goes straight to Vrata's proxy port and
 * never through Strapi.
 */

export type VrataRouteKind = 'container' | 'vm' | 'custom';

export interface VrataRoute {
  name: string;
  kind: VrataRouteKind;
  upstream: string;
  host?: string;
  strip_prefix: boolean;
  target?: string;
  created_at: string;
}

export interface VrataCreateRouteRequest {
  name: string;
  kind?: VrataRouteKind;
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

export class VrataError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'VrataError';
  }
}

export class VrataClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeoutMs: number;

  constructor(baseUrl?: string, apiKey?: string, timeoutMs = 30_000) {
    this.baseUrl = (baseUrl || process.env.VRATA_URL || 'http://localhost:8085').replace(/\/$/, '');
    this.apiKey = apiKey || process.env.VRATA_API_KEY;
    this.timeoutMs = timeoutMs;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init.headers as Record<string, string>) || {}),
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/v1${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new VrataError(`Vrata request timed out after ${this.timeoutMs}ms`, 504);
      }
      throw new VrataError(
        `Vrata is unreachable: ${error instanceof Error ? error.message : String(error)}`,
        503
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    if (!response.ok) {
      let message = text.slice(0, 500);
      try {
        const parsed = JSON.parse(text);
        if (parsed?.error) message = parsed.error;
      } catch {
        // keep the raw text
      }
      throw new VrataError(message, response.status);
    }
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  /** Health, over the root path rather than /api/v1. Never throws. */
  async health(): Promise<VrataHealth> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${this.baseUrl}/health`, { signal: controller.signal });
      return (await response.json()) as VrataHealth;
    } catch (error) {
      return {
        service: 'vrata',
        status: 'unavailable',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async listRoutes(): Promise<VrataRoute[]> {
    const body = await this.request<{ routes: VrataRoute[] }>('/routes', { method: 'GET' });
    return body.routes ?? [];
  }

  async getRoute(name: string): Promise<VrataRoute> {
    const body = await this.request<{ route: VrataRoute }>(
      `/routes/${encodeURIComponent(name)}`,
      { method: 'GET' }
    );
    return body.route;
  }

  async createRoute(req: VrataCreateRouteRequest): Promise<VrataRoute> {
    const body = await this.request<{ route: VrataRoute }>('/routes', {
      method: 'POST',
      body: JSON.stringify(req),
    });
    return body.route;
  }

  deleteRoute(name: string): Promise<void> {
    return this.request(`/routes/${encodeURIComponent(name)}`, { method: 'DELETE' });
  }
}

let singleton: VrataClient | null = null;

/** Returns the shared client. */
export function getVrataClient(): VrataClient {
  if (!singleton) {
    singleton = new VrataClient();
  }
  return singleton;
}

/** Test seam: drops the cached client so env changes take effect. */
export function resetVrataClient(): void {
  singleton = null;
}
