/**
 * A record of the HTTP traffic the development API served.
 *
 * Why this exists: a caller integrating against METIS — the storefront demo is
 * the current one — has no way to see what it sent or what came back. Browser
 * devtools show it to whoever has the tab open, which is nobody during a demo,
 * and the decision ledger deliberately does not help: a `DecisionRecord` stores
 * `inputSnapshotHash` and never the input values, so "what did that site
 * actually post" is a question the platform's own audit trail cannot answer by
 * design. This answers it at the edge instead.
 *
 * Scope, stated plainly rather than implied: this records traffic to
 * `app/api/[...path]/route.ts`, which is the development API over the mutable
 * mock store. It is not a production capability. Production observability is
 * OpenTelemetry spans (W-048, not built), which is a different thing with
 * different retention. The distinction matters because this buffer holds full
 * request bodies, and decision inputs are the one thing ADR-004 keeps out of
 * durable storage.
 *
 * So it is bounded by construction, not by policy:
 *   - memory only, never written to disk
 *   - a fixed ring, oldest evicted, so it cannot grow
 *   - lost on restart, like the store it describes
 *   - `METIS_CALL_LOG=off` disables recording entirely
 */

/** How many calls are kept. Old ones are evicted, not flushed. */
export const CAPACITY = 250;

/**
 * Per-side body cap. A body over this is stored truncated with a marker, so a
 * large payload costs a fixed amount of memory rather than an unbounded one and
 * the row still shows what the call *was*.
 */
export const MAX_BODY_BYTES = 32_000;

export type CallOrigin = 'storefront' | 'console' | 'unknown';

export interface RecordedBody {
  /** Parsed when the body was JSON, so the UI can render it as a tree. */
  json: unknown | null;
  /** The raw text when it was not JSON, or when it was truncated. */
  text: string | null;
  bytes: number;
  truncated: boolean;
}

export interface ApiCall {
  id: string;
  /** When the request arrived, not when it finished. */
  at: string;
  method: string;
  /** The path as routed, `/api` included, query excluded. */
  path: string;
  query: string | null;
  status: number;
  durationMs: number;
  request: RecordedBody | null;
  response: RecordedBody | null;
  /**
   * Who called. Derived from `Referer`, which the console and the storefront
   * both send. Not authentication — a label, and wrong if someone spoofs it,
   * which costs nothing here.
   */
  origin: CallOrigin;
  /**
   * The decision this call produced, when it produced one. Lifted out of the
   * response body so the row can link to the trace without the UI having to
   * know the shape of every response.
   */
  decisionId: string | null;
  /** The `error` field of a non-2xx body, so a failure reads without expanding. */
  error: string | null;
}

const enabled = process.env.METIS_CALL_LOG !== 'off';

/**
 * The ring. A plain array with a bounded push: at 250 entries the splice cost
 * is irrelevant beside the HTTP work it accompanies, and an index-wrapped
 * buffer would need untangling on every read for no gain.
 */
const calls: ApiCall[] = [];
let seq = 0;

export function isEnabled(): boolean {
  return enabled;
}

/** Newest first, which is the order the page reads them in. */
export function listCalls(limit = CAPACITY): ApiCall[] {
  return calls.slice(-limit).reverse();
}

export function clearCalls(): void {
  calls.length = 0;
}

/**
 * Add a call, evicting from whichever caller is using the most of the ring.
 *
 * Not oldest-first, which is what this did and what made the page useless: an
 * open console polls its own API several times a second, so within a couple of
 * minutes the ring held 250 console reads and every storefront call — the only
 * ones anybody opened the page for — had been pushed out. Observed directly:
 * 250 calls recorded, 0 decisions among them.
 *
 * Evicting from the largest caller instead means console chatter can only
 * displace console chatter. A storefront call is dropped when the storefront
 * is itself the biggest talker, which is the case where dropping it is right.
 * The total is still exactly CAPACITY.
 */
export function record(call: ApiCall): void {
  if (!enabled) return;
  calls.push(call);
  while (calls.length > CAPACITY) {
    const counts = new Map<CallOrigin, number>();
    for (const c of calls) counts.set(c.origin, (counts.get(c.origin) ?? 0) + 1);

    let worst: CallOrigin = calls[0].origin;
    for (const [origin, n] of counts) {
      if (n > (counts.get(worst) ?? 0)) worst = origin;
    }

    calls.splice(
      calls.findIndex((c) => c.origin === worst),
      1
    );
  }
}

export function captureBody(text: string | null): RecordedBody | null {
  if (text === null || text === '') return null;

  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_BODY_BYTES) {
    return {
      json: null,
      text: text.slice(0, MAX_BODY_BYTES),
      bytes,
      truncated: true,
    };
  }

  try {
    return { json: JSON.parse(text), text: null, bytes, truncated: false };
  } catch {
    // Not JSON. Kept as text rather than dropped: an HTML error page from a
    // proxy is exactly the thing somebody debugging needs to see.
    return { json: null, text, bytes, truncated: false };
  }
}

export function originOf(referer: string | null): CallOrigin {
  if (!referer) return 'unknown';
  if (referer.includes('/storefront')) return 'storefront';
  try {
    // Any other page served by this origin is the console itself.
    return new URL(referer).pathname.startsWith('/storefront') ? 'storefront' : 'console';
  } catch {
    return 'unknown';
  }
}

/**
 * Pull the correlation and the failure reason out of a response body without
 * the caller needing to know which shape it is. `decisionId` appears on both
 * `POST /decisions` and the placement slate; `error` is the spec's error shape.
 */
export function summarise(body: RecordedBody | null): {
  decisionId: string | null;
  error: string | null;
} {
  const j = body?.json;
  if (!j || typeof j !== 'object') return { decisionId: null, error: null };
  const o = j as Record<string, unknown>;
  return {
    decisionId: typeof o.decisionId === 'string' ? o.decisionId : null,
    error: typeof o.error === 'string' ? o.error : null,
  };
}

/** The log's own read endpoint. */
export const SELF_PATH = '/api/inbound-calls';

/**
 * Whether a call is worth recording.
 *
 * Reads of the log are not. The traffic page polls every two seconds, and each
 * response carries every call already recorded — so recording the read nests
 * the whole log inside the next one, and the one after that carries both. It
 * fills the ring with copies of itself within a minute of the page being open,
 * which is exactly what happened the first time this ran.
 *
 * The clear is still recorded. It is small, it cannot nest, and a log whose
 * only row says it was just emptied is more honest than one that is silently
 * empty.
 */
export function shouldRecord(method: string, pathname: string): boolean {
  return !(method === 'GET' && pathname.startsWith(SELF_PATH));
}

type Handler = (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>;

/**
 * Wrap a route handler so every call through it is recorded.
 *
 * Bodies are read from clones. The handler still gets an unread stream, which
 * matters because several cases call `req.json()` and a consumed body would
 * turn every write into a 400 — the failure mode this has to not have.
 */
export function recorded(method: string, handler: Handler): Handler {
  if (!enabled) return handler;

  return async (req, ctx) => {
    const started = Date.now();
    const url = new URL(req.url);

    if (!shouldRecord(method, url.pathname)) return handler(req, ctx);

    // Cloned before the handler runs, read after: cloning duplicates the
    // stream, so reading this later does not race the handler reading its own.
    const reqClone = req.clone();

    let res: Response;
    try {
      res = await handler(req, ctx);
    } catch (err) {
      // A throw is the most interesting call there is, so it is recorded and
      // then rethrown rather than swallowed into a row nobody can act on.
      record({
        id: `call_${(++seq).toString(36)}_${started.toString(36)}`,
        at: new Date(started).toISOString(),
        method,
        path: url.pathname,
        query: url.search || null,
        status: 500,
        durationMs: Date.now() - started,
        request: captureBody(await reqClone.text().catch(() => null)),
        response: null,
        origin: originOf(req.headers.get('referer')),
        decisionId: null,
        error: err instanceof Error ? err.message : 'threw a non-Error',
      });
      throw err;
    }

    const request = captureBody(await reqClone.text().catch(() => null));
    const response = captureBody(await res.clone().text().catch(() => null));
    const { decisionId, error } = summarise(response);

    record({
      id: `call_${(++seq).toString(36)}_${started.toString(36)}`,
      at: new Date(started).toISOString(),
      method,
      path: url.pathname,
      query: url.search || null,
      status: res.status,
      durationMs: Date.now() - started,
      request,
      response,
      origin: originOf(req.headers.get('referer')),
      decisionId,
      error,
    });

    return res;
  };
}
