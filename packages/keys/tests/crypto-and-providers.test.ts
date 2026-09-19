import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileKeyProvider, KeyError, KmsKeyProvider, newKey, open, providerFor, seal, type KmsClient } from '../src';

describe('the cipher (ADR-025 §2)', () => {
  const key = newKey();
  const row = 'ledger:decision_records:telco-us:dec_1';

  it('opens what it sealed, under the same key and row', () => {
    const sealed = seal(key, Buffer.from('plain'), row);
    expect(open(key, sealed, row).toString()).toBe('plain');
    expect(sealed.includes(Buffer.from('plain'))).toBe(false);
  });

  it('refuses a ciphertext moved to another row', () => {
    const sealed = seal(key, Buffer.from('plain'), row);
    expect(() => open(key, sealed, 'ledger:decision_records:telco-us:dec_2')).toThrow(/does not open/);
  });

  it('refuses a changed byte and a wrong key, the same way', () => {
    const sealed = seal(key, Buffer.from('plain'), row);
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1] ^= 1;
    expect(() => open(key, tampered, row)).toThrow(KeyError);
    expect(() => open(newKey(), sealed, row)).toThrow(KeyError);
  });

  it('refuses a key that is not 256 bits', () => {
    expect(() => seal(Buffer.alloc(16), Buffer.from('x'), row)).toThrow(/32 bytes/);
  });
});

describe('tenant key providers (ADR-025 §1, §4)', () => {
  const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'metis-keys-'));

  it('a file provider wraps, and a second load of the same file unwraps', async () => {
    const file = path.join(dir(), 'telco-us.key');
    const created = FileKeyProvider.create(file);
    const wrapped = await created.wrap(Buffer.from('subject key'), 'aad');
    expect((await FileKeyProvider.load(file).unwrap(wrapped, 'aad')).toString()).toBe('subject key');
  });

  it('never replaces a tenant key that exists', () => {
    const file = path.join(dir(), 'telco-us.key');
    FileKeyProvider.create(file);
    expect(() => FileKeyProvider.create(file)).toThrow(/already exists/);
  });

  it('refuses a key file that is not exactly one key', () => {
    const file = path.join(dir(), 'short.key');
    fs.writeFileSync(file, Buffer.alloc(31));
    expect(() => FileKeyProvider.load(file)).toThrow(/31 bytes/);
  });

  it('a KMS provider with no client refuses to wrap rather than pretending', async () => {
    await expect(new KmsKeyProvider('kms://telco-us').wrap(Buffer.from('k'), 'aad')).rejects.toThrow(/no KMS client/);
  });

  it('a KMS provider uses the client it is given', async () => {
    const key = newKey();
    const client: KmsClient = {
      encrypt: async (_ref, plain, aad) => seal(key, plain, aad),
      decrypt: async (_ref, wrapped, aad) => open(key, wrapped, aad),
    };
    const kms = new KmsKeyProvider('kms://telco-us', client);
    expect((await kms.unwrap(await kms.wrap(Buffer.from('k'), 'aad'), 'aad')).toString()).toBe('k');
  });

  it('refuses a file key for a real tenant, and allows it for a synthetic one', () => {
    const file = FileKeyProvider.create(path.join(dir(), 't.key'));
    expect(() => providerFor('real', file)).toThrow(/must hold its key in a KMS/);
    expect(providerFor('synthetic', file)).toBe(file);
    const kms = new KmsKeyProvider('kms://t');
    expect(providerFor('real', kms)).toBe(kms);
  });
});
