import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';
import { login, ACCOUNTS } from './helpers';

/**
 * @screen-only
 *
 * The contract line on `/settings` is the contract.
 *
 * It read "OpenAPI 3.1 · 30 operations" while the spec declared 71 — a count
 * written down in the page, beside a heading claiming every call in the console
 * maps to an operationId in the spec, on the page an administrator opens to find
 * out what this console is. Nothing read that number, so nothing noticed it
 * had fallen to less than half the truth.
 *
 * The expected values come from parsing `docs/metis-api.openapi.yaml` here,
 * independently of the generated client the page reads. So this fails if the
 * page hardcodes a number again, and it also fails if the generated client ever
 * stops matching the spec it claims to describe.
 */

const SPEC = path.resolve(__dirname, '../../../../docs/metis-api.openapi.yaml');
const METHODS = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);

function declared(): { version: string; operations: number } {
  const spec = load(fs.readFileSync(SPEC, 'utf8')) as {
    openapi: string;
    paths: Record<string, Record<string, { operationId?: string }>>;
  };
  let operations = 0;
  for (const item of Object.values(spec.paths)) {
    for (const [method, op] of Object.entries(item)) {
      if (METHODS.has(method) && op?.operationId) operations++;
    }
  }
  return { version: spec.openapi, operations };
}

test.describe('settings describes the console as it is @screen-only', () => {
  test('states the spec version and operation count the spec declares', async ({ page }) => {
    const { version, operations } = declared();
    // Not vacuous: a moved or unparsable spec would otherwise expect "0 operations".
    expect(operations).toBeGreaterThan(50);

    await login(page, ACCOUNTS.marcus);
    await page.goto('/settings');

    const contract = page.getByRole('listitem').filter({ hasText: 'Contract' });
    await expect(contract).toContainText(`OpenAPI ${version} · ${operations.toLocaleString('en-US')} operations`);
  });
});
