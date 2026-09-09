-- The catalogue: taxonomy, offers, creatives, policies, boosts, ranking.
--
-- Everything here lived in the console's in-memory store until 2026-09-06,
-- which meant a restart lost authored state. A marketer edits a boost, the
-- process recycles, and the next decision is made against a catalogue nobody
-- chose. That is a correctness problem, not tidiness.
--
-- Two deliberate choices about shape:
--
--   1. **Entities are stored whole, as jsonb, beside the few columns a query
--      needs.** The same reasoning as the registry's compiled artifact and the
--      ledger's decision record: the engine consumes these as a snapshot whose
--      hash is recorded, and decomposing an offer into thirty columns would
--      put a serialisation between the catalogue and its own hash. The columns
--      beside it are not a second copy of the truth — they are what an index
--      can be built on.
--
--   2. **Foreign keys, not application checks alone.** `Catalogue` refuses an
--      offer in a missing category so the rule holds in memory too, but the
--      database is the only place that can be *sure*. A concurrent delete
--      between the check and the write is exactly the race an application
--      check cannot close.
--
-- The edit log is append-only and enforced by trigger, like the registry's.
-- A catalogue is what the engine decided from; a change with no record of who
-- made it is the first thing an auditor asks about.

BEGIN;

CREATE TABLE IF NOT EXISTS catalogue_objectives (
  tenant_id   text NOT NULL,
  id          text NOT NULL,
  name        text NOT NULL,
  body        jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS catalogue_categories (
  tenant_id    text NOT NULL,
  id           text NOT NULL,
  objective_id text NOT NULL,
  name         text NOT NULL,
  body         jsonb NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, objective_id)
    REFERENCES catalogue_objectives (tenant_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS catalogue_offers (
  tenant_id   text NOT NULL,
  id          text NOT NULL,
  category_id text NOT NULL,
  -- What a decision flow selects on. Unique per tenant, because two offers
  -- sharing a key make a flow's candidate list ambiguous.
  key         text NOT NULL,
  status      text NOT NULL,
  body        jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, key),
  FOREIGN KEY (tenant_id, category_id)
    REFERENCES catalogue_categories (tenant_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS catalogue_creatives (
  tenant_id  text NOT NULL,
  id         text NOT NULL,
  offer_id   text NOT NULL,
  channel    text NOT NULL,
  body       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  -- RESTRICT rather than CASCADE: deleting an offer should not silently
  -- destroy the content somebody wrote for it.
  FOREIGN KEY (tenant_id, offer_id)
    REFERENCES catalogue_offers (tenant_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS catalogue_targeting_policies (
  tenant_id  text NOT NULL,
  id         text NOT NULL,
  kind       text NOT NULL,
  body       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS catalogue_frequency_policies (
  tenant_id  text NOT NULL,
  id         text NOT NULL,
  body       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS catalogue_boosts (
  tenant_id  text NOT NULL,
  id         text NOT NULL,
  body       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

-- One ranking function per tenant. The engine reads exactly one, so a table
-- that allowed two would be modelling a state the engine cannot represent.
CREATE TABLE IF NOT EXISTS catalogue_arbitration (
  tenant_id  text PRIMARY KEY,
  body       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalogue_events (
  seq       bigserial PRIMARY KEY,
  tenant_id text NOT NULL,
  at        timestamptz NOT NULL,
  actor     text NOT NULL,
  entity    text NOT NULL,
  entity_id text NOT NULL,
  action    text NOT NULL,
  summary   text NOT NULL
);

CREATE INDEX IF NOT EXISTS catalogue_events_tenant_seq
  ON catalogue_events (tenant_id, seq DESC);

CREATE INDEX IF NOT EXISTS catalogue_offers_tenant_status
  ON catalogue_offers (tenant_id, status);

CREATE INDEX IF NOT EXISTS catalogue_creatives_offer
  ON catalogue_creatives (tenant_id, offer_id);

-- The edit log is a record of what happened. The application refusing to
-- rewrite it is not enough on its own: anything holding the connection string
-- could, and "the code does not do that" is not an answer to an auditor.
CREATE OR REPLACE FUNCTION catalogue_events_are_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'catalogue_events is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalogue_events_no_update ON catalogue_events;
CREATE TRIGGER catalogue_events_no_update
  BEFORE UPDATE OR DELETE ON catalogue_events
  FOR EACH ROW EXECUTE FUNCTION catalogue_events_are_append_only();

COMMIT;
