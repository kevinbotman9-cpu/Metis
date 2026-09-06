-- METIS decision ledger.
--
-- Three tables and one rule: nothing here is ever updated or deleted. A
-- decision record is a statement about something that happened, and an outcome
-- is another one. Correcting a decision means recording a new decision.
--
-- The triggers duplicate what the application already refuses to do, and the
-- duplication is the point — the same argument as 001_registry.sql. Enforced
-- only in application code, "append-only" survives exactly as long as nobody
-- writes a migration script, an admin query, or a second service.

BEGIN;

CREATE TABLE IF NOT EXISTS decision_records (
    tenant_id     text        NOT NULL,
    -- The engine's decision id, which is a content hash of the decision. Two
    -- decisions cannot share one without being the same decision.
    decision_id   text        NOT NULL,

    -- A one-way, tenant-salted hash of the customer reference. §8 wants
    -- "every decision about this customer" to be an indexed query; it does not
    -- want the audit store to be a second copy of the customer database.
    subject_hash  text        NOT NULL,

    -- From the request, never the clock, so a replay lands on the same
    -- validity windows.
    occurred_at   timestamptz NOT NULL,

    flow_id       text        NOT NULL,
    flow_version  text        NOT NULL,
    chain_hash    text        NOT NULL,

    -- The engine record, whole. Stored rather than decomposed for the same
    -- reason the registry stores an artifact whole: the chain hash is taken
    -- over this exact shape, and taking it apart to reassemble it later would
    -- put a serialisation between the record and its own hash.
    record        jsonb       NOT NULL,

    recorded_at   timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (tenant_id, decision_id)
);

-- §8's access pattern: every decision about this subject, most recent first.
CREATE INDEX IF NOT EXISTS decision_records_by_subject
    ON decision_records (tenant_id, subject_hash, occurred_at DESC);

-- And the operational one: what did this flow decide over this window.
CREATE INDEX IF NOT EXISTS decision_records_by_flow
    ON decision_records (tenant_id, flow_id, occurred_at DESC);

-- --------------------------------------------------------------------------
-- Idempotency
-- --------------------------------------------------------------------------
--
-- Durable rather than in process memory, which is the point of moving it here:
-- a retry arriving after a restart still finds its original decision.

CREATE TABLE IF NOT EXISTS idempotency_keys (
    tenant_id     text        NOT NULL,
    key           text        NOT NULL,

    -- What the caller actually asked. The same key with a different hash is a
    -- caller bug, and answering it with the stored decision would hand them a
    -- decision about someone else's customer.
    request_hash  text        NOT NULL,
    decision_id   text        NOT NULL,
    stored_at     timestamptz NOT NULL,

    PRIMARY KEY (tenant_id, key),

    -- A key must point at a decision that exists. Without this the pointer can
    -- outlive its target and a retry resolves to nothing.
    FOREIGN KEY (tenant_id, decision_id)
        REFERENCES decision_records (tenant_id, decision_id)
);

-- --------------------------------------------------------------------------
-- Outcomes
-- --------------------------------------------------------------------------
--
-- Storage only. Nothing learns from these yet, and a table that quietly fed a
-- model would be the opposite of the point.

CREATE TABLE IF NOT EXISTS outcome_events (
    -- Monotonic and assigned by the database: two events can share a
    -- timestamp, and a sequence cannot.
    seq          bigserial   PRIMARY KEY,
    tenant_id    text        NOT NULL,
    decision_id  text        NOT NULL,
    type         text        NOT NULL
        CHECK (type IN ('impression', 'click', 'acceptance', 'rejection', 'conversion')),
    occurred_at  timestamptz NOT NULL,

    -- Minor units, and null rather than zero where the outcome carries no
    -- value: a click is not a conversion worth nothing, and averaging over
    -- zeros would say it was.
    value_minor  bigint,
    detail       jsonb,

    FOREIGN KEY (tenant_id, decision_id)
        REFERENCES decision_records (tenant_id, decision_id)
);

CREATE INDEX IF NOT EXISTS outcome_events_by_decision
    ON outcome_events (tenant_id, decision_id, seq);

-- --------------------------------------------------------------------------
-- Append-only
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ledger_reject_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION
        'append-only: % on % is not permitted',
        TG_OP, TG_TABLE_NAME
        USING HINT =
            'A decision and an outcome are facts about what happened. '
            'Record a new decision, or append a new outcome.',
            ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS decision_records_append_only ON decision_records;
CREATE TRIGGER decision_records_append_only
    BEFORE UPDATE OR DELETE ON decision_records
    FOR EACH ROW EXECUTE FUNCTION ledger_reject_mutation();

DROP TRIGGER IF EXISTS outcome_events_append_only ON outcome_events;
CREATE TRIGGER outcome_events_append_only
    BEFORE UPDATE OR DELETE ON outcome_events
    FOR EACH ROW EXECUTE FUNCTION ledger_reject_mutation();

-- Idempotency keys are deliberately *not* covered by the trigger.
--
-- They are a cache of a promise, not a record of an event: a key that expires
-- is a normal operational act, and a table nobody can ever prune grows without
-- limit. The promise itself — which decision that key resolved to — is safe
-- because the decision it points at cannot be changed or removed.

COMMIT;
