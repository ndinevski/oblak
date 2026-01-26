/**
 * API Types
 * Common types for API responses and pagination
 */

/**
 * Strapi single response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * Strapi paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
}

/**
 * Pagination parameters for list queries
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

/**
 * Strapi error response
 */
export interface ApiErrorResponse {
  data: null;
  error: {
    status: number;
    name: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Base entity attributes (common to all Strapi content types)
 */
export interface BaseEntity {
  id: number;
  documentId: string;
  createdAt: string;
  updatedAt: string;
}
