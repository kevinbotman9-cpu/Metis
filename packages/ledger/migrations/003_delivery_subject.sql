-- Frequency caps count a customer's contacts from the ledger — ADR-021.
--
-- A cap asks "how often has this customer been contacted on this channel in the
-- last day, week or month". Delivery attempts are bound to a decision and not to
-- a customer, so without this the answer would read every decision the customer
-- was ever part of to find their attempts. The subject goes on the attempt,
-- written by the ledger from the decision it has just read.
--
-- Expand-only, as ADR-016 clause 3.3 requires: a nullable column and an index,
-- nothing dropped, nothing tightened, and the release before this one writes and
-- reads the table exactly as it did.
--
-- Not backfilled. The append-only trigger on `delivery_attempts` refuses the
-- UPDATE a backfill would need, and disabling it inside a migration is exactly
-- the hole the trigger exists to close. An attempt written before this migration
-- carries no subject and is not counted by a cap. Every ledger that can hold one
-- is synthetic and is reset rather than migrated (ADR-019 §7).

ALTER TABLE delivery_attempts ADD COLUMN IF NOT EXISTS subject_hash text;

-- "This customer's contacts on this channel, most recent first", which is the
-- whole of what a cap reads.
CREATE INDEX IF NOT EXISTS delivery_attempts_by_subject
    ON delivery_attempts (tenant_id, subject_hash, channel, at DESC);
