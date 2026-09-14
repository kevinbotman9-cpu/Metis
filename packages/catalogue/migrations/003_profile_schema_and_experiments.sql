-- The profile schema and experiments: the last two things the console's
-- decisions read that had no store.
--
-- Both lived only in the console's in-memory development store until
-- 2026-09-13, so a restart reverted a tenant's data model and forgot every
-- experiment somebody had drafted. They move here with the rest of what the
-- console authors, so that authoring survives a restart and a decision service
-- reading these tables sees what a person changed.
--
-- Neither is part of the catalogue hash, for different reasons. A decision
-- records the schema version it resolved against, and an experiment's arm
-- reaches the engine as an ordinary field of the hashed input — so both are
-- already in what a decision records, by another route.
--
-- ## How this file changes: it does not
--
-- Version 3. Applied once by `@metis/core/migrate`. A change is `004_*.sql`.

-- One data model per tenant. The engine resolves paths against exactly one, so
-- a table that allowed two would model a state nothing can use.
CREATE TABLE catalogue_profile_schemas (
  tenant_id  text PRIMARY KEY,
  body       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalogue_experiments (
  tenant_id  text NOT NULL,
  id         text NOT NULL,
  -- An arm reaches policies at `experiments.<key>`, so two experiments sharing
  -- a key would write two values to one field of the decision input.
  key        text NOT NULL,
  body       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, key)
);
