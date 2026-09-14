-- Drafts: the flow a person is editing, before any of it is published.
--
-- The registry held published versions and environment pointers, and nothing a
-- person had drawn but not shipped. Drafts lived in the console's development
-- store, so a restart put every flow's graph back to the fixture — beside a
-- registry that, once durable, would still hold what that person had published
-- from the graph they lost. A published 2.1.0 next to a draft that has never
-- heard of it is worse than neither surviving.
--
-- Mutable, unlike everything else in this schema. A draft is work in progress:
-- saving it again replaces it, and it becomes a fact only when it is published
-- as a version, which is where immutability starts.
--
-- The draft is stored whole, as jsonb, and the registry does not interpret it.
-- What a draft carries — nodes, edges, candidate keys, and the metadata an
-- editor shows beside them — belongs to whatever edits it; the registry's rules
-- are about versions.
--
-- ## How this file changes: it does not
--
-- Version 2. Applied once by `@metis/core/migrate`. A change is `003_*.sql`.

CREATE TABLE registry_drafts (
    tenant_id   text        NOT NULL,
    flow_name   text        NOT NULL,
    draft       jsonb       NOT NULL,
    updated_at  timestamptz NOT NULL,
    updated_by  text        NOT NULL,
    PRIMARY KEY (tenant_id, flow_name)
);
