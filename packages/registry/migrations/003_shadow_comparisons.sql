-- Shadow comparisons: what a shadow version would have decided, against what
-- the active version did.
--
-- The shadow *pointer* has persisted since the registry did — it is
-- `registry_environments.shadow_version`. The evidence it collects did not: the
-- console held comparisons in an array in its development store, so a shadow
-- that ran for a week had nothing to show after a restart, beside a registry
-- still saying it was shadowing. The pointer and its evidence with different
-- lifetimes is the same failure as a change set coming back pending over an
-- edit the catalogue kept.
--
-- Append-only, enforced by trigger, like `registry_events`: a comparison is a
-- record of something that happened, and an agreement rate somebody could edit
-- is not evidence for a cutover.
--
-- The comparison itself is stored whole, as jsonb, and the registry does not
-- interpret it — the registry deliberately does not depend on the engine that
-- produces it. The columns beside it are what the report filters on: a report
-- is about one pair of versions in one environment, and comparisons from an
-- earlier pair describe a different question.
--
-- Both versions reference a published version. A comparison against a version
-- that was never published would be evidence about nothing.
--
-- ## How this file changes: it does not
--
-- Version 3. Applied once by `@metis/core/migrate`. A change is `004_*.sql`.

CREATE TABLE registry_shadow_comparisons (
    seq             bigserial   PRIMARY KEY,
    tenant_id       text        NOT NULL,
    flow_name       text        NOT NULL,
    environment     text        NOT NULL,
    active_version  text        NOT NULL,
    shadow_version  text        NOT NULL,
    recorded_at     timestamptz NOT NULL,
    comparison      jsonb       NOT NULL,

    CONSTRAINT registry_shadow_comparisons_active_version_fkey
        FOREIGN KEY (tenant_id, flow_name, active_version)
        REFERENCES registry_versions (tenant_id, flow_name, version),
    CONSTRAINT registry_shadow_comparisons_shadow_version_fkey
        FOREIGN KEY (tenant_id, flow_name, shadow_version)
        REFERENCES registry_versions (tenant_id, flow_name, version)
);

CREATE INDEX registry_shadow_comparisons_by_pair
    ON registry_shadow_comparisons (tenant_id, flow_name, environment, active_version, shadow_version, seq);

CREATE FUNCTION registry_shadow_comparisons_are_append_only()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'registry_shadow_comparisons is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER registry_shadow_comparisons_no_update
    BEFORE UPDATE OR DELETE ON registry_shadow_comparisons
    FOR EACH ROW EXECUTE FUNCTION registry_shadow_comparisons_are_append_only();
