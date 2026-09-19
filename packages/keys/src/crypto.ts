import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/**
 * The cipher and the pseudonym — ADR-025 §2.
 *
 * AES-256-GCM with a 96-bit random nonce per encryption, and the row's identity
 * as associated data, so a ciphertext moved to another row fails to open rather
 * than opening as someone else's. HMAC-SHA256 for pseudonyms. Node's OpenSSL,
 * no dependency; the JVM has the same in its standard library.
 *
 * Sealed layout: nonce (12 bytes) · tag (16 bytes) · ciphertext.
 */

export const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export class KeyError extends Error {
  constructor(
    readonly code:
      | 'KEY_LENGTH'
      | 'SEALED_TOO_SHORT'
      | 'DOES_NOT_OPEN'
      | 'TENANT_KEY_REFUSED'
      | 'TENANT_KEY_EXISTS'
      | 'TENANT_KEY_MISSING'
      | 'KMS_NOT_CONFIGURED',
    message: string
  ) {
    super(message);
    this.name = 'KeyError';
  }
}

/** 256 random bits. */
export function newKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

function assertKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) {
    throw new KeyError('KEY_LENGTH', `A key is ${KEY_BYTES} bytes; this one is ${key.length}.`);
  }
}

/**
 * Encrypt `plain` under `key`, bound to `aad` — the identity of the row it will
 * be stored in, e.g. `ledger:decision_records:telco-us:dec_…`.
 */
export function seal(key: Buffer, plain: Buffer, aad: string): Buffer {
  assertKey(key);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), body]);
}

/**
 * Decrypt what `seal` produced, under the same key and the same `aad`.
 *
 * A wrong key, a changed byte and a ciphertext moved to another row all fail the
 * same way: authentication, reported as `DOES_NOT_OPEN`. Nothing is returned
 * that did not authenticate.
 */
export function open(key: Buffer, sealed: Buffer, aad: string): Buffer {
  assertKey(key);
  if (sealed.length < NONCE_BYTES + TAG_BYTES) {
    throw new KeyError('SEALED_TOO_SHORT', 'This is too short to be a sealed value.');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, NONCE_BYTES));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(sealed.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES));
  try {
    return Buffer.concat([decipher.update(sealed.subarray(NONCE_BYTES + TAG_BYTES)), decipher.final()]);
  } catch {
    throw new KeyError('DOES_NOT_OPEN', 'This value does not open under this key for this row.');
  }
}

/** HMAC-SHA256 of `value` under `key`, hex. The pseudonyms of ADR-004's amendment. */
export function pseudonym(key: Buffer, value: string): string {
  assertKey(key);
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}
