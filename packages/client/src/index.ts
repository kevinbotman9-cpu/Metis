/**
 * The METIS API client.
 *
 * Types and the operation table are generated from `docs/metis-api.openapi.yaml`
 * into `./generated`. This file is the small hand-written part: URL building,
 * transport and error shape. It has no per-endpoint code, so an endpoint cannot
 * be added here without adding it to the spec first.
 *
 * `packages/client` used to be a placeholder whose `generate` script echoed a
 * string. It is now the reason the spec cannot silently drift from the API.
 */

import {
  OPERATIONS,
  type OperationId,
  type ResponseOf,
} from './generated';

export * from './generated';

export interface RequestOptions {
  /** Values for the operation's `{placeholders}`. */
  path?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

export interface ClientOptions {
  baseUrl: string;
  /** Returns the bearer token, or null when signed out. */
  getToken?: () => string | null;
  /** Injectable for tests and for server-side use. */
  fetch?: typeof globalThis.fetch;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly operationId: OperationId,
    readonly url: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Build the URL for an operation.
 *
 * Exported because the contract test walks every operation and needs the same
 * URL the client would produce, without making the call through it.
 */
export function buildPath(
  operationId: OperationId,
  params: Record<string, string> = {}
): string {
  const op = OPERATIONS[operationId];
  return op.path.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`${operationId}: missing path parameter "${name}"`);
    }
    return encodeURIComponent(value);
  });
}

export function createClient(options: ClientOptions) {
  const doFetch = options.fetch ?? globalThis.fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, '');

  async function call<Id extends OperationId>(
    operationId: Id,
    request: RequestOptions = {}
  ): Promise<ResponseOf[Id]> {
    const op = OPERATIONS[operationId];
    const url = new URL(baseUrl + buildPath(operationId, request.path ?? {}));

    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    const token = options.getToken?.();
    const res = await doFetch(url.toString(), {
      method: op.method,
      headers: {
        ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: request.signal,
    });

    if (!res.ok) {
      // The body may carry a useful message, or may not be JSON at all.
      let detail = res.statusText;
      try {
        // `res.json()` is `Promise<any>` in lib.dom but `Promise<{}>` under
        // the Node types this package is checked with, so the property access
        // has to be narrowed rather than assumed.
        const parsed: unknown = await res.json();
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          'error' in parsed &&
          typeof (parsed as { error: unknown }).error === 'string'
        ) {
          detail = (parsed as { error: string }).error;
        }
      } catch {
        // Keep statusText.
      }
      throw new ApiError(res.status, operationId, url.toString(), detail);
    }

    // No operation declares a 204 today, but a client that throws on an
    // empty body would be a worse failure than one that returns nothing.
    if (res.status === 204) return undefined as unknown as ResponseOf[Id];
    return (await res.json()) as ResponseOf[Id];
  }

  return { call, buildPath };
}

export type MetisClient = ReturnType<typeof createClient>;
