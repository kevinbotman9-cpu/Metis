-- The key store — ADR-025.
--
-- Three tables. Two hold keys, wrapped: nothing here opens without the tenant
-- key, which is never in this database (ADR-025 §1). The third records that a
-- key was destroyed, and is the only thing about an erased subject that
-- remains.

-- One row per tenant: the key its tenant pseudonyms are computed under,
-- wrapped under the tenant key. Unwrapped once per process, so a tenant key
-- held in a KMS is asked once per start, not once per decision.
CREATE TABLE key_tenants (
    tenant_id      text        PRIMARY KEY,
    pseudonym_key  bytea       NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);

-- One row per subject: that subject's key, wrapped under the tenant key, found
-- by the tenant pseudonym HMAC(tenant pseudonym key, customerRef).
--
-- The one mutable table in the design (ADR-004): erasure deletes a row here and
-- touches nothing anywhere else. Deliberately not append-only — an erasure that
-- could not delete the key would not erase anything.
CREATE TABLE subject_keys (
    tenant_id   text        NOT NULL,
    pseudonym   text        NOT NULL,
    wrapped     bytea       NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, pseudonym)
);

-- One row per erasure: who asked, when, under what request, and the two
-- pseudonyms needed to re-apply it after a restore and to check it held. No
-- identifier and no key. Backed up apart from the data (ADR-025 §3), so a
-- restore of the data cannot roll it back.
CREATE TABLE erasures (
    seq             bigserial   PRIMARY KEY,
    tenant_id       text        NOT NULL,
    pseudonym       text        NOT NULL,
    subject_column  text        NOT NULL,
    erased_at       timestamptz NOT NULL,
    erased_by       text        NOT NULL,
    request_ref     text        NOT NULL,
    had_key         boolean     NOT NULL
);

CREATE INDEX erasures_by_tenant ON erasures (tenant_id, seq);

CREATE FUNCTION keys_reject_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION
        'append-only: % on % is not permitted',
        TG_OP, TG_TABLE_NAME
        USING HINT =
            'An erasure is a fact about what was destroyed. '
            'It is recorded once and never changed.',
            ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER erasures_append_only
    BEFORE UPDATE OR DELETE ON erasures
    FOR EACH ROW EXECUTE FUNCTION keys_reject_mutation();
