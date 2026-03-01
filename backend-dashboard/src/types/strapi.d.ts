/**
 * Strapi Type Definitions
 * Type declarations for Strapi v5 custom APIs
 */

import type { Core } from '@strapi/strapi';

// Re-export Core.Strapi as the main Strapi type
export type StrapiInstance = Core.Strapi;

// Koa context type for controllers
export interface StrapiContext {
  request: {
    body: unknown;
    query: Record<string, string | string[] | undefined>;
    params: Record<string, string>;
    files?: Record<string, unknown>;
  };
  params: Record<string, string>;
  query: Record<string, string | string[] | undefined>;
  state: {
    user?: {
      id: number;
      documentId: string;
      email: string;
      username: string;
      provider?: string;
      confirmed?: boolean;
      blocked?: boolean;
      role?: {
        id: number;
        name: string;
        type: string;
      };
    };
    auth?: {
      credentials?: unknown;
    };
  };
  body: unknown;
  badRequest: (message?: string, details?: unknown) => void;
  unauthorized: (message?: string, details?: unknown) => void;
  forbidden: (message?: string, details?: unknown) => void;
  notFound: (message?: string, details?: unknown) => void;
  internalServerError: (message?: string, details?: unknown) => void;
  send: (body: unknown, status?: number) => void;
}

// Entity types for the custom content types
export interface VMEntity {
  id: number;
  documentId: string;
  cores?: number;
  memoryMB?: number;
  diskGB?: number;
  [key: string]: unknown;
}

export interface BucketEntity {
  id: number;
  documentId: string;
  totalSize?: string;
  [key: string]: unknown;
}

// Helper type for reduce callbacks
export interface ReduceCallback<T, R> {
  (accumulator: R, current: T, index: number, array: T[]): R;
}

declare global {
  type Strapi = Core.Strapi;

  // Make StrapiInstance available globally
  namespace Strapi {
    type Strapi = Core.Strapi;
  }
}

export {};
