import type { ApiErrorBody } from '@shared/api-types';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | undefined,
    public readonly issues?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !(init.body instanceof FormData)) headers.set('content-type', 'application/json');
  const res = await fetch(path, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const body = (data ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(body.error ?? `Erreur ${res.status}`, res.status, body.code, body.issues);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => fetchJson<T>(path),
  post: <T>(path: string, body?: unknown) => fetchJson<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => fetchJson<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => fetchJson<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T = void>(path: string) => fetchJson<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData) => fetchJson<T>(path, { method: 'POST', body: form }),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Une erreur est survenue';
}
