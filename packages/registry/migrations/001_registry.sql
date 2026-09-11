-- METIS artifact registry — version 1, the baseline.
--
-- The application already refuses to overwrite a published version. This
-- schema refuses too, with triggers that reject UPDATE and DELETE outright.
--
-- That duplication is the point. "Immutable" enforced only in application code
-- is a convention: it survives exactly as long as nobody writes a migration
-- script, an admin query, or a second service. Enforced in the database, it
-- survives all three. If the two ever disagree, the database wins and the
-- application finds out loudly rather than silently.
--
-- ## How this file changes: it does not
--
-- Applied once by `@metis/core/migrate`, in a transaction with the row that
-- records it and its checksum. Once a database has run it, the runner refuses
-- to start if the text differs, and `tests/migrations-frozen.test.ts` refuses a
-- pull request that edits it. A change to this schema is `002_*.sql`.
--
-- Rewritten as a plain baseline on 2026-09-11 (G-077). It used to open with
-- conditional blocks — a column rename, two added columns, a widened check —
-- each patching databases that `CREATE TABLE IF NOT EXISTS` could not reach,
-- and one placed where it could not work (G-076). No database whose upgrade
-- path had to be kept existed, so they were deleted rather than carried.

CREATE TABLE registry_versions (
    tenant_id      text        NOT NULL,
    flow_name      text        NOT NULL,
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

    -- The flow's own test cases, run by the flow-test gate at publish.
    tests          jsonb       NOT NULL DEFAULT '[]'::jsonb,

    PRIMARY KEY (tenant_id, flow_name, version)
);

CREATE INDEX registry_versions_by_flow
    ON registry_versions (tenant_id, flow_name, published_at DESC);

-- An environment pointer. The one mutable thing here, because that is what an
-- environment is: a name for whatever is currently running.
CREATE TABLE registry_environments (
    tenant_id        text        NOT NULL,
    flow_name        text        NOT NULL,
    environment      text        NOT NULL,
    active_version   text,
    -- What rollback returns to. Only the immediately previous version: a
    -- deeper history invites rolling back to something nobody remembers.
    previous_version text,
    -- A version running beside the active one and deciding nothing. Null is
    -- the normal state.
    shadow_version   text,
    promoted_at      timestamptz,
    promoted_by      text,

    PRIMARY KEY (tenant_id, flow_name, environment),

    -- An environment may point at nothing, but it may not point at a version
    -- that was never published. Without this the pointer can outlive its
    -- target and "production is running 2.4.0" stops being a fact.
    --
    -- Named rather than left to Postgres. The generated names are built from
    -- the column list and truncated at 63 characters, so a rename of a column
    -- leaves the old name behind — which is how a registry created before the
    -- 2026-09-05 vocabulary rename came to carry `…_strategy_name_…_fkey` for
    -- good (G-077). A later migration that names a constraint needs the name to
    -- be the one written here.
    CONSTRAINT registry_environments_active_version_fkey
        FOREIGN KEY (tenant_id, flow_name, active_version)
        REFERENCES registry_versions (tenant_id, flow_name, version)
        DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT registry_environments_previous_version_fkey
        FOREIGN KEY (tenant_id, flow_name, previous_version)
        REFERENCES registry_versions (tenant_id, flow_name, version)
        DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE registry_events (
    -- Monotonic, assigned by the database. The order is a fact rather than a
    -- sort key: two events can share a timestamp, and a sequence cannot.
    seq           bigserial   PRIMARY KEY,
    at            timestamptz NOT NULL,
    actor         text        NOT NULL,
    type          text        NOT NULL
        CONSTRAINT registry_events_type_check
        CHECK (type IN ('ArtifactPublished', 'PublishRejected', 'VersionPromoted',
                        'VersionRolledBack', 'ShadowStarted', 'ShadowStopped')),
    tenant_id     text        NOT NULL,
    flow_name     text        NOT NULL,
    version       text        NOT NULL,
    environment   text,
    summary       text        NOT NULL,
    -- Present on PublishRejected: what the compiler said about the refusal.
    diagnostics   jsonb
);

CREATE INDEX registry_events_by_tenant
    ON registry_events (tenant_id, seq DESC);
CREATE INDEX registry_events_by_flow
    ON registry_events (tenant_id, flow_name, seq DESC);

-- --------------------------------------------------------------------------
-- Immutability
-- --------------------------------------------------------------------------

CREATE FUNCTION registry_reject_mutation() RETURNS trigger AS $$
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

CREATE TRIGGER registry_versions_append_only
    BEFORE UPDATE OR DELETE ON registry_versions
    FOR EACH ROW EXECUTE FUNCTION registry_reject_mutation();

CREATE TRIGGER registry_events_append_only
    BEFORE UPDATE OR DELETE ON registry_events
    FOR EACH ROW EXECUTE FUNCTION registry_reject_mutation();
