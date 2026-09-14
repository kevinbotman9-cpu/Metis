-- Governance: change sets and the audit log.
--
-- Both lived in arrays in the console's development store until 2026-09-14,
-- while the catalogue they change and the flows they describe had become
-- durable. That split was worse than neither persisting: after a restart an
-- approved change set came back pending over a catalogue that already held its
-- edit, approving it again applied the diff twice, and the audit screen had
-- lost the approval of an edit the store still held.
--
-- ## Change sets are decided once
--
-- A change set is mutable in exactly one way: from `pending` to a decision.
-- The trigger below refuses any update to a row that is no longer pending, and
-- any delete. The store's decide is a conditional UPDATE on `status = 'pending'`,
-- so two approvals racing each other cannot both succeed — which is what makes
-- "an approved change set applies its diff once" a property of the database
-- rather than of the handler that happened to check first.
--
-- ## The audit log is append-only
--
-- Enforced by trigger, like the registry's and the catalogue's event logs.
-- `seq` is the order and nothing else: an event's identity is its `id`, which
-- the application assigns and which is unique per tenant, so a restored log
-- keeps the ids its events were cited by.
--
-- Stored whole as jsonb beside the columns a query needs, the same shape as the
-- catalogue: the console serves these objects as they are, and decomposing them
-- would put a serialisation between the record and what was recorded.
--
-- ## How this file changes: it does not
--
-- Version 1, the baseline. Applied once by `@metis/core/migrate` and recorded
-- with its checksum; `tests/migrations-frozen.test.ts` refuses a pull request
-- that edits it. A change to this schema is `002_*.sql`.

CREATE TABLE governance_change_sets (
  tenant_id    text NOT NULL,
  id           text NOT NULL,
  status       text NOT NULL,
  requested_at timestamptz NOT NULL,
  body         jsonb NOT NULL,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT governance_change_sets_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn'))
);

CREATE INDEX governance_change_sets_by_request
  ON governance_change_sets (tenant_id, requested_at DESC, id DESC);

CREATE FUNCTION governance_change_sets_are_decided_once()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'governance_change_sets keeps every change set: DELETE is not permitted';
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'change set % was already %: a decision is final', OLD.id, OLD.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER governance_change_sets_decided_once
  BEFORE UPDATE OR DELETE ON governance_change_sets
  FOR EACH ROW EXECUTE FUNCTION governance_change_sets_are_decided_once();

CREATE TABLE governance_audit_events (
  seq         bigserial PRIMARY KEY,
  tenant_id   text NOT NULL,
  id          text NOT NULL,
  occurred_at timestamptz NOT NULL,
  body        jsonb NOT NULL,
  CONSTRAINT governance_audit_events_tenant_id_key UNIQUE (tenant_id, id)
);

CREATE INDEX governance_audit_events_by_tenant
  ON governance_audit_events (tenant_id, seq DESC);

CREATE FUNCTION governance_audit_events_are_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'governance_audit_events is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER governance_audit_events_no_update
  BEFORE UPDATE OR DELETE ON governance_audit_events
  FOR EACH ROW EXECUTE FUNCTION governance_audit_events_are_append_only();
