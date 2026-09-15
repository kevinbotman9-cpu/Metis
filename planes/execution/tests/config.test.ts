import { describe, it, expect } from 'vitest';
import { configFrom } from '../src/config';

/**
 * What a deployment of the decision service must declare, and what it may leave
 * to a default. ADR-016 §4.1 and G-115.
 */

const declared = { METIS_SERVICE_TOKEN: 't', METIS_DATA_CLASS: 'synthetic' };

describe('the decision service configuration', () => {
  it('refuses to start without a credential', () => {
    expect(() => configFrom({ METIS_DATA_CLASS: 'synthetic' })).toThrow(/METIS_SERVICE_TOKEN/);
  });

  it('refuses to start without a declared data class, and never defaults one', () => {
    expect(() => configFrom({ METIS_SERVICE_TOKEN: 't' })).toThrow(/METIS_DATA_CLASS is not set/);
    expect(() => configFrom({ METIS_SERVICE_TOKEN: 't', METIS_DATA_CLASS: '' })).toThrow(/METIS_DATA_CLASS is not set/);
  });

  it('refuses a data class it does not know', () => {
    expect(() => configFrom({ ...declared, METIS_DATA_CLASS: 'production' })).toThrow(/synthetic' or 'real/);
  });

  it('refuses an integration mode and a port it does not know', () => {
    expect(() => configFrom({ ...declared, METIS_INTEGRATIONS: 'recorded' })).toThrow(/METIS_INTEGRATIONS/);
    expect(() => configFrom({ ...declared, PORT: 'eighty' })).toThrow(/PORT/);
  });

  it('defaults what may be defaulted', () => {
    expect(configFrom(declared)).toEqual({
      token: 't',
      dataClass: 'synthetic',
      environment: 'production',
      port: 8080,
      integrations: 'live',
    });
  });
});
