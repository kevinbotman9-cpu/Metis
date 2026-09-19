import fs from 'node:fs';
import { KEY_BYTES, KeyError, newKey, open, seal } from './crypto';

/**
 * Where a tenant key lives — ADR-025 §1.
 *
 * The tenant key is a key-encryption key. It is never stored in the database:
 * it wraps and unwraps the keys that are. A provider is chosen per tenant at
 * provisioning, and its kind follows the tenant's data class (§4).
 */
export interface TenantKeyProvider {
  readonly kind: 'file' | 'kms';
  wrap(plain: Buffer, aad: string): Promise<Buffer>;
  unwrap(wrapped: Buffer, aad: string): Promise<Buffer>;
}

/** Whether a tenant's data describes real people. ADR-016 §4, per tenant under ADR-025 §4. */
export type DataClass = 'synthetic' | 'real';

/**
 * A 256-bit key in a file outside the repository. Acceptable for a synthetic
 * tenant, where losing the file loses a demonstration; refused for a real one.
 */
export class FileKeyProvider implements TenantKeyProvider {
  readonly kind = 'file' as const;

  private constructor(private readonly key: Buffer) {}

  /**
   * Create a new tenant key at `path`. Refuses a path that already exists:
   * overwriting a tenant key would make every key wrapped under it unreadable,
   * which is erasure of the whole tenant by accident.
   */
  static create(path: string): FileKeyProvider {
    const key = newKey();
    try {
      fs.writeFileSync(path, key, { flag: 'wx', mode: 0o600 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new KeyError('TENANT_KEY_EXISTS', `A tenant key already exists at ${path}; it is not replaced.`);
      }
      throw e;
    }
    return new FileKeyProvider(key);
  }

  /** Read the tenant key at `path`, refusing anything that is not exactly one key. */
  static load(path: string): FileKeyProvider {
    if (!fs.existsSync(path)) {
      throw new KeyError('TENANT_KEY_MISSING', `No tenant key at ${path}.`);
    }
    const key = fs.readFileSync(path);
    if (key.length !== KEY_BYTES) {
      throw new KeyError('KEY_LENGTH', `The tenant key at ${path} is ${key.length} bytes, not ${KEY_BYTES}.`);
    }
    return new FileKeyProvider(key);
  }

  async wrap(plain: Buffer, aad: string): Promise<Buffer> {
    return seal(this.key, plain, aad);
  }

  async unwrap(wrapped: Buffer, aad: string): Promise<Buffer> {
    return open(this.key, wrapped, aad);
  }
}

/** What a managed KMS must do for a tenant key held in it. One per cloud, behind this. */
export interface KmsClient {
  encrypt(keyRef: string, plain: Buffer, aad: string): Promise<Buffer>;
  decrypt(keyRef: string, wrapped: Buffer, aad: string): Promise<Buffer>;
}

/**
 * A reference to a tenant key held in a managed KMS. Required for a real tenant.
 *
 * Which KMS is a deployment choice (ADR-025 §1). Until a deployment supplies a
 * client, this refuses every use rather than pretending: a real tenant with no
 * KMS behind it cannot hold data, and says so.
 */
export class KmsKeyProvider implements TenantKeyProvider {
  readonly kind = 'kms' as const;

  constructor(
    readonly keyRef: string,
    private readonly client?: KmsClient
  ) {}

  private kms(): KmsClient {
    if (!this.client) {
      throw new KeyError(
        'KMS_NOT_CONFIGURED',
        `Tenant key ${this.keyRef} is held in a KMS, and this deployment has no KMS client configured.`
      );
    }
    return this.client;
  }

  async wrap(plain: Buffer, aad: string): Promise<Buffer> {
    return this.kms().encrypt(this.keyRef, plain, aad);
  }

  async unwrap(wrapped: Buffer, aad: string): Promise<Buffer> {
    return this.kms().decrypt(this.keyRef, wrapped, aad);
  }
}

/**
 * The provider a tenant may use, given its data class — ADR-025 §4.
 *
 * A real tenant's key must be held in a KMS. A file is refused for it here, at
 * the point of use, and not only at provisioning, so a tenant row edited by
 * hand cannot slip a file key under real data.
 */
export function providerFor(dataClass: DataClass, provider: TenantKeyProvider): TenantKeyProvider {
  if (dataClass === 'real' && provider.kind !== 'kms') {
    throw new KeyError(
      'TENANT_KEY_REFUSED',
      'A real tenant must hold its key in a KMS; a key in a file is for synthetic tenants only (ADR-025 §4).'
    );
  }
  return provider;
}
