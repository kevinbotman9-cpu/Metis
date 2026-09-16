-- Decision search reads the ledger — ADR-018 clause 1, slice 2b.
--
-- `/decisions` filters by channel, by the winning action, and by whether an
-- offer was made. All three live inside `record`, the stored decision, and this
-- indexes them where they are rather than copying them into columns: a column
-- beside the record would be a second copy of the same fact, and the record is
-- what the chain hash covers.
--
-- Expand-only, as ADR-016 clause 3.3 requires: two indexes added, nothing
-- dropped, nothing tightened, and the release before this one reads the table
-- exactly as it did.

-- "Decisions on this channel, newest first".
CREATE INDEX IF NOT EXISTS decision_records_by_channel
    ON decision_records (tenant_id, ((record->'decision'->>'channel')), occurred_at DESC);

-- "Decisions this action won", and - because the expression is null for a
-- suppressed decision - "decisions that offered something", which is the filter
-- the list opens on.
CREATE INDEX IF NOT EXISTS decision_records_by_winner
    ON decision_records (tenant_id, ((record->'decision'->>'winner')), occurred_at DESC);
