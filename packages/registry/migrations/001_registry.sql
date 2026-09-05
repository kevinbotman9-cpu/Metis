-- METIS artifact registry.
--
-- The application already refuses to overwrite a published version. This
-- schema refuses too, with triggers that reject UPDATE and DELETE outright.
--
-- That duplication is the point. "Immutable" enforced only in application code
-- is a convention: it survives exactly as long as nobody writes a migration
-- script, an admin query, or a second service. Enforced in the database, it
-- survives all three. If the two ever disagree, the database wins and the
-- application finds out loudly rather than silently.

BEGIN;

-- --------------------------------------------------------------------------
-- Taxonomy rename, 2026-09-05: strategy_name -> flow_name
-- --------------------------------------------------------------------------
--
-- `CREATE TABLE IF NOT EXISTS` below is a no-op against a database created
-- before the rename, so it would leave the old column in place and every
-- query would fail with 42703 — a missing-column error a long way from its
-- cause. This block renames it first, and does nothing on a fresh database.
--
-- Inline rather than as `002_`, because there is no migration runner yet: the
-- schema is applied whole at startup. When a second real migration arrives,
-- that is the moment to add one, and this block should move into it.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'registry_versions' AND column_name = 'strategy_name') THEN
        ALTER TABLE registry_versions RENAME COLUMN strategy_name TO flow_name;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'registry_environments' AND column_name = 'strategy_name') THEN
        ALTER TABLE registry_environments RENAME COLUMN strategy_name TO flow_name;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'registry_events' AND column_name = 'strategy_name') THEN
        ALTER TABLE registry_events RENAME COLUMN strategy_name TO flow_name;
    END IF;
END $$;

ALTER INDEX IF EXISTS registry_versions_by_strategy RENAME TO registry_versions_by_flow;
ALTER INDEX IF EXISTS registry_events_by_strategy RENAME TO registry_events_by_flow;

CREATE TABLE IF NOT EXISTS registry_versions (
    tenant_id      text        NOT NULL,
    flow_name  text        NOT NULL,
    version        text        NOT NULL,

    -- The compiled artifact, exactly as the compiler emitted it. Stored whole
    -- rather than decomposed into columns: the engine executes this shape and
    -- the hash is taken over it, so taking it apart and reassembling it would
    -- put a serialisation between the artifact and its own hash.
    artifact       jsonb       NOT NULL,

    -- Denormalised from artifact->>'artifactHash' so the immutability check is
    -- an indexed comparison rather than a JSON extraction on every publish.
    artifact_hash  text        NOT NULL,

    published_at   timestamptz NOT NULL,
    published_by   text        NOT NULL,

    -- Warnings the version published with. Kept, not discarded on success: a
    -- flow that shipped near its latency budget is a different thing to
    -- explain in six months than one that shipped clean.
    warnings       jsonb       NOT NULL DEFAULT '[]'::jsonb,

    PRIMARY KEY (tenant_id, flow_name, version)
);

CREATE INDEX IF NOT EXISTS registry_versions_by_flow
    ON registry_versions (tenant_id, flow_name, published_at DESC);

-- An environment pointer. The one mutable thing here, because that is what an
-- environment is: a name for whatever is currently running.
CREATE TABLE IF NOT EXISTS registry_environments (
    tenant_id        text        NOT NULL,
    flow_name    text        NOT NULL,
    environment      text        NOT NULL,
    active_version   text,
    -- What rollback returns to. Only the immediately previous version: a
    -- deeper history invites rolling back to something nobody remembers.
    previous_version text,
    promoted_at      timestamptz,
    promoted_by      text,

    PRIMARY KEY (tenant_id, flow_name, environment),

    -- An environment may point at nothing, but it may not point at a version
    -- that was never published. Without this the pointer can outlive its
    -- target and "production is running 2.4.0" stops being a fact.
    FOREIGN KEY (tenant_id, flow_name, active_version)
        REFERENCES registry_versions (tenant_id, flow_name, version)
        DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (tenant_id, flow_name, previous_version)
        REFERENCES registry_versions (tenant_id, flow_name, version)
        DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS registry_events (
    -- Monotonic, assigned by the database. The order is a fact rather than a
    -- sort key: two events can share a timestamp, and a sequence cannot.
    seq           bigserial   PRIMARY KEY,
    at            timestamptz NOT NULL,
    actor         text        NOT NULL,
    type          text        NOT NULL
        CHECK (type IN ('ArtifactPublished', 'PublishRejected', 'VersionPromoted', 'VersionRolledBack')),
    tenant_id     text        NOT NULL,
    flow_name text        NOT NULL,
    version       text        NOT NULL,
    environment   text,
    summary       text        NOT NULL,
    -- Present on PublishRejected: what the compiler said about the refusal.
    diagnostics   jsonb
);

CREATE INDEX IF NOT EXISTS registry_events_by_tenant
    ON registry_events (tenant_id, seq DESC);
CREATE INDEX IF NOT EXISTS registry_events_by_flow
    ON registry_events (tenant_id, flow_name, seq DESC);

-- --------------------------------------------------------------------------
-- Immutability
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION registry_reject_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION
        'append-only: % on % is not permitted',
        TG_OP, TG_TABLE_NAME
        USING HINT =
            'A published version and a registry event are facts about what happened. '
            'Publish a new version, or append a new event.',
            ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS registry_versions_append_only ON registry_versions;
CREATE TRIGGER registry_versions_append_only
    BEFORE UPDATE OR DELETE ON registry_versions
    FOR EACH ROW EXECUTE FUNCTION registry_reject_mutation();

DROP TRIGGER IF EXISTS registry_events_append_only ON registry_events;
CREATE TRIGGER registry_events_append_only
    BEFORE UPDATE OR DELETE ON registry_events
    FOR EACH ROW EXECUTE FUNCTION registry_reject_mutation();

COMMIT;
