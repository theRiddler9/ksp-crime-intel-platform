// ──────────────────────────────────────────────
// Base API client — abstracts Catalyst SDK / fetch
// TODO: Replace with Catalyst Web SDK when connecting to live backend
// ──────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(
    status: number,
    message: string,
    body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  // TODO: Inject Catalyst auth token here
  const authToken = sessionStorage.getItem('ksp_auth_token');
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(response.status, `API ${method} ${endpoint} failed: ${response.statusText}`, errorBody);
  }

  return response.json();
}

/** Simulate network delay for mock data */
export function simulateDelay(ms: number = 400): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
