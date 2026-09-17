import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { selectSlate } from '@metis/runtime';
import type { DecisionRequest } from '@metis/runtime/deterministic/types';
import { decide, type DecideDeps, type DecideOutcome } from './decide';
import type { LoadResult } from './state';
import type { IntegrationMode } from './gateways';

export interface ServiceOptions extends DecideDeps {
  /**
   * The one credential this unit accepts. ADR-016's build order makes the first
   * unit refusable and no more: identity — who a caller is, which tenant it may
   * act for, how a credential is issued and revoked — is G-115, and deciding it
   * here would decide it for every boundary the platform has.
   */
  token: string;
  /** Null until loading has finished; the service answers 503 until then. */
  loaded: () => LoadResult | null;
  /** Reported on `/health`, so a caller-only deployment cannot pass for a live one. */
  integrations: IntegrationMode;
  /** Reported on `/health`: what kind of data this deployment declared it holds. ADR-016 §4. */
  dataClass: 'synthetic' | 'real';
}

/** The largest request body read. A decision request is small; a large one is a mistake or an attack. */
const MAX_BODY_BYTES = 1_000_000;

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

/** Compared through fixed-length digests, so the comparison takes the same time whatever was sent. */
function authorised(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(token).digest();
  return presented.length > 0 && timingSafeEqual(a, b);
}

async function readJson(req: IncomingMessage): Promise<{ ok: true; body: unknown } | { ok: false; status: number; message: string }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return { ok: false, status: 413, message: 'Request body is too large' };
    chunks.push(chunk as Buffer);
  }
  try {
    return { ok: true, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch {
    return { ok: false, status: 400, message: 'Request body must be JSON' };
  }
}

/** The request as the engine takes it, from the body the spec declares. */
function toDecisionRequest(body: Partial<DecisionRequest>, placement: string): DecisionRequest {
  return {
    tenantId: body.tenantId as string,
    customerId: body.customerId as string,
    channel: body.channel as DecisionRequest['channel'],
    placement,
    occurredAt: body.occurredAt as string,
    input: body.input ?? {},
    contactHistory: body.contactHistory,
    consent: body.consent,
    idempotencyKey: body.idempotencyKey,
    correlationId: body.correlationId,
  };
}

function missing(body: Partial<DecisionRequest>): string[] {
  return (['tenantId', 'customerId', 'channel', 'occurredAt'] as const).filter(
    (f) => typeof body[f] !== 'string' || (body[f] as string).trim() === ''
  );
}

function answer(res: ServerResponse, outcome: DecideOutcome, shape: (o: Exclude<DecideOutcome, { kind: 'error' }>) => unknown): void {
  if (outcome.kind === 'error') return send(res, outcome.status, outcome.body);
  send(res, 200, shape(outcome));
}

/**
 * The decision service. ADR-016 §1.
 *
 * - `GET /health` — unauthenticated, so an orchestrator can probe it; 503 until
 *   loading has finished.
 * - `POST /api/decisions` — `{ artifactId, request }`, one decision.
 * - `POST /api/placements/{tenantId}/{placementKey}/decisions` — `{ request }`,
 *   the same decision delivered as a slate for a configured slot.
 */
export function createService(options: ServiceOptions): Server {
  const handler: Handler = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://service');
    const segments = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && url.pathname === '/health') {
      const loaded = options.loaded();
      if (!loaded) return send(res, 503, { status: 'loading', engine: 'typescript', integrations: options.integrations, dataClass: options.dataClass });
      return send(res, 200, {
        status: 'ok',
        engine: 'typescript',
        integrations: options.integrations,
        dataClass: options.dataClass,
        tenants: [...loaded.tenants.values()].map((t) => ({
          tenantId: t.tenantId,
          catalogueSnapshotHash: t.catalogueSnapshotHash,
          artifacts: [...t.artifacts.keys()].sort(),
          placements: t.record.placements.filter((p) => p.decidable).map((p) => p.key).sort(),
        })),
        refused: loaded.refused,
      });
    }

    if (req.method !== 'POST' || segments[0] !== 'api') return send(res, 404, { error: 'not_found' });
    if (!authorised(req, options.token)) return send(res, 401, { error: 'unauthorised' });

    const loaded = options.loaded();
    if (!loaded) return send(res, 503, { error: 'not_ready', message: 'The service has not finished loading.' });

    const parsed = await readJson(req);
    if (!parsed.ok) return send(res, parsed.status, { error: 'bad_request', message: parsed.message });
    const body = (parsed.body ?? {}) as { artifactId?: unknown; request?: Partial<DecisionRequest> };
    if (!body.request || typeof body.request !== 'object') {
      return send(res, 400, { error: 'bad_request', message: 'Missing required field: request' });
    }
    const absent = missing(body.request);
    if (absent.length > 0) {
      return send(res, 400, { error: 'bad_request', message: `Missing required field(s): ${absent.map((f) => `request.${f}`).join(', ')}` });
    }

    // POST /api/decisions
    if (segments.length === 2 && segments[1] === 'decisions') {
      const tenant = loaded.tenants.get(body.request.tenantId as string);
      if (!tenant) return send(res, 404, { error: 'unknown_tenant', message: `No tenant '${body.request.tenantId}' is loaded.` });
      const artifactId = typeof body.artifactId === 'string' ? body.artifactId : '';
      const artifact = tenant.artifacts.get(artifactId);
      if (!artifact) return send(res, 404, { error: 'unknown_flow', message: `No active flow '${artifactId}' for tenant '${tenant.tenantId}'.` });
      const request = toDecisionRequest(body.request, body.request.placement as string);
      const outcome = await decide(options, tenant, artifact, request);
      return answer(res, outcome, (o) => ({ ...o.record, replayed: o.kind === 'replay' }));
    }

    // POST /api/placements/{tenantId}/{placementKey}/decisions
    if (segments.length === 5 && segments[1] === 'placements' && segments[4] === 'decisions') {
      const [, , tenantId, placementKey] = segments;
      const tenant = loaded.tenants.get(tenantId);
      if (!tenant) return send(res, 404, { error: 'unknown_tenant', message: `No tenant '${tenantId}' is loaded.` });
      const placement = tenant.record.placements.find((p) => p.key === placementKey && p.decidable);
      if (!placement) return send(res, 404, { error: 'unknown_placement', message: `No active placement '${placementKey}'.` });
      if (body.request.tenantId !== tenantId) {
        return send(res, 400, { error: 'bad_request', message: `Request names tenant '${body.request.tenantId}' and the path names '${tenantId}'.` });
      }
      if (body.request.placement && body.request.placement !== placementKey) {
        return send(res, 400, { error: 'bad_request', message: `Request names placement '${body.request.placement}' and the path names '${placementKey}'.` });
      }
      const artifact = tenant.artifacts.get(placement.artifactId);
      if (!artifact) {
        return send(res, 404, { error: 'unknown_flow', message: `Placement '${placementKey}' is answered by flow '${placement.artifactId}', which is not active.` });
      }
      const request = toDecisionRequest(body.request, placement.key);
      const outcome = await decide(options, tenant, artifact, request);
      if (outcome.kind === 'error') return send(res, outcome.status, outcome.body);

      const record = outcome.record;
      const slate = selectSlate(record.decision, placement.slotCount);
      if (outcome.kind === 'decided') {
        // ADR-013 §1: what the platform did about getting the decision to
        // somebody. A slot nothing delivers still decides, and says so.
        const suppressed = !placement.delivery ? 'no_adapter' : placement.delivery.mode === 'adapter' ? 'adapter_not_built' : null;
        await options.ledger.recordDelivery({
          tenantId,
          decisionId: record.id,
          placementKey: placement.key,
          channel: placement.channel,
          state: suppressed ? 'suppressed' : 'dispatched',
          // When the decision happened, not the wall clock: this hand-over is
          // part of the same request, and the seed already stamps it so (G-151).
          at: record.decision.occurredAt,
          reason: suppressed,
          permanent: null,
          providerRef: null,
        });
      }
      const offerByKey = new Map(tenant.snapshot.offers.map((o) => [o.key, o.id]));
      return send(res, 200, {
        placement: placement.key,
        slotCount: placement.slotCount,
        decisionId: record.id,
        chainHash: record.chainHash,
        replayed: outcome.kind === 'replay',
        entries: slate.entries.map((e) => ({ ...e, offerId: offerByKey.get(e.action) ?? null })),
      });
    }

    return send(res, 404, { error: 'not_found' });
  };

  return createServer((req, res) => {
    handler(req, res).catch((e: unknown) => {
      // An engine refusal or a store failure is not the caller's fault and is
      // never answered as a decision.
      if (!res.headersSent) send(res, 500, { error: 'internal', message: (e as Error).message });
    });
  });
}
