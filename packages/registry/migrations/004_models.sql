-- Model versions: the scorers a flow's score nodes pin. ADR-009 §4, step two.
--
-- A score node has named `{ id, version }` since the compiler first refused an
-- unpinned one, and nothing held the thing it named: the pin was a string the
-- compiler checked the shape of and nobody could look up. So a flow could pin
-- `propensity_accept_v4@4.2.0` and compile, while no such model existed and no
-- declared latency for it could reach the critical path.
--
-- Beside the flow versions rather than in the catalogue, because a model is
-- versioned like a flow and not configured like a connector: a version is bound
-- to its content, republishing identical content changes nothing, and different
-- content under a published version is refused. Append-only, by trigger, for
-- the reason `001_registry.sql` gives — immutability enforced only in the
-- application survives exactly until somebody writes an admin query.
--
-- Still no model behind any of it. Scoring is the seeded function (ADR-009
-- phase one); what a row here declares is what a real scorer will be held to.
--
-- ## How this file changes: it does not
--
-- Version 4. Applied once by `@metis/core/migrate`. A change is `005_*.sql`.

CREATE TABLE registry_models (
    tenant_id      text        NOT NULL,
    model_id       text        NOT NULL,
    version        text        NOT NULL,

    -- The version as published, whole. Stored rather than decomposed for the
    -- reason `registry_versions.artifact` is: the content hash is taken over
    -- this shape.
    body           jsonb       NOT NULL,

    -- Denormalised from the body, so "is this the same content" is a column
    -- comparison.
    content_hash   text        NOT NULL,

    published_at   timestamptz NOT NULL,
    published_by   text        NOT NULL,

    PRIMARY KEY (tenant_id, model_id, version)
);

CREATE INDEX registry_models_by_model
    ON registry_models (tenant_id, model_id, published_at DESC);

CREATE FUNCTION registry_models_are_append_only()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'registry_models is append-only: % is not permitted', TG_OP
        USING HINT = 'A published model version is a fact about what a flow could pin. Publish a new version.',
              ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER registry_models_no_update
    BEFORE UPDATE OR DELETE ON registry_models
    FOR EACH ROW EXECUTE FUNCTION registry_models_are_append_only();
