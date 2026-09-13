-- Connectors and placements: the two things a decision reads that had no store.
--
-- Both lived only in the console's in-memory development store until
-- 2026-09-13. That was survivable while the console was the only thing that
-- decided, and it is not once anything else does: ADR-016's decision service
-- reads its stores, and a service that cannot find a connector cannot
-- reproduce a catalogue hash, because connectors are *in* the catalogue the
-- engine hashes. A connector's field mapping changes what a decision sees, so
-- it has to change the hash too (`CatalogueSnapshot.connectors`).
--
-- Placements are the other kind of thing, and stored beside the catalogue for a
-- different reason. A placement configures how a decision is delivered — how
-- many slots, which flow answers — and is deliberately not hashed into the
-- decision. But `decidePlacement` cannot run without one: a website names a
-- slot, not a flow. So it is persisted with the catalogue it is read alongside,
-- and left out of the snapshot the engine hashes, exactly as the domain type
-- says (`packages/core/src/domain.ts`, `Placement`).
--
-- Same shape as the rest of the catalogue: the entity whole, as jsonb, beside
-- the columns an index or a constraint needs.
--
-- ## How this file changes: it does not
--
-- Version 2. Applied once by `@metis/core/migrate` in a transaction with the row
-- that records it. A change to this schema is `003_*.sql`.

CREATE TABLE catalogue_connectors (
  tenant_id  text NOT NULL,
  id         text NOT NULL,
  kind       text NOT NULL,
  body       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE catalogue_placements (
  tenant_id  text NOT NULL,
  id         text NOT NULL,
  -- What a decision request carries and a creative names. Unique per tenant,
  -- because two slots answering to one key would make "which flow decides this
  -- slot" a question with two answers.
  key        text NOT NULL,
  body       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, key)
);
