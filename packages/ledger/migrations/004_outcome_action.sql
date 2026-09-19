-- An outcome names the slate entry it was about — ADR-020 §4.
--
-- A decision on a placement with more than one slot shows more than one offer,
-- and an outcome that names only the decision cannot say which of them the
-- customer saw or acted on. `action_key` is the action of the entry, checked
-- against the decision's recorded slate before the row is written: required
-- when the slate has more than one entry, refused when it names an action the
-- slate did not show.
--
-- Expand-only, as ADR-016 clause 3.3 requires: a nullable column, nothing
-- dropped, nothing tightened. Null on every row written before this migration,
-- and on a single-slot outcome that did not name its action; a reader credits
-- either to slot 1. Not backfilled: the append-only trigger refuses the UPDATE
-- a backfill would need.

ALTER TABLE outcome_events ADD COLUMN IF NOT EXISTS action_key text;
