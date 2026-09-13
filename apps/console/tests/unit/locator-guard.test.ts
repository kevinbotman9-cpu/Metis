import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';

// `eslint` ships no type declarations and the repository carries none, so it is
// loaded the way `cn.test.ts` loads the Tailwind config: required, and given the
// narrow shape this test actually calls.
interface LintMessage {
  ruleId: string | null;
  message: string;
}
interface ESLintApi {
  lintText(code: string, options: { filePath: string }): Promise<{ messages: LintMessage[] }[]>;
}
const require = createRequire(import.meta.url);
const { ESLint } = require('eslint') as { ESLint: new (options: { cwd: string }) => ESLintApi };

/**
 * Unscoped locators in the e2e suite match exactly, or say they don't mean to.
 *
 * Playwright's `getByLabel`, `getByText` and a `getByRole` name match a
 * case-insensitive **substring** by default. Called on `page`, that reaches
 * every label and every piece of text in the document — the global header
 * included. Three tests were found this month matching something they were not
 * written for, and each read as a regression until somebody read the call log:
 * the last was `page.getByLabel('View')` taking the header's "Overview persona"
 * switch for the data model's select, on the day the switch shipped.
 *
 * The rule, in `.eslintrc.json`'s override for `tests/e2e`, fails an unscoped
 * call given a plain string without `exact: true`. Three ways out, all
 * deliberate:
 *
 * - `{ exact: true }` — the usual answer;
 * - scope the locator to the region, dialog or card it belongs to — a locator
 *   scoped there cannot reach a global control, so scoped calls are not checked;
 * - a **RegExp**, when a substring is what the test means. `/text/` states that
 *   intent in the call itself, which a bare string never did. It is the carve-out,
 *   not a loophole: converting every string to a regex would pass this and fix
 *   nothing, and the migration that introduced the rule did not do that.
 *
 * These lint snippets as if they sat in `tests/e2e`, so the assertions are about
 * the rule the gate runs, not a copy of it.
 */

const ROOT = path.resolve(__dirname, '../..');
const eslint = new ESLint({ cwd: ROOT });

async function flagged(code: string, file = 'tests/e2e/locator-guard-fixture.spec.ts') {
  const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, file) });
  return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax').length;
}

const inATest = (body: string) => `
import { test } from '@playwright/test';
test('fixture', async ({ page }) => {
  const dialog = page.getByRole('dialog');
  ${body}
});
`;

describe('unscoped getByLabel and getByText', () => {
  it('fails a plain string with no exact match', async () => {
    expect(await flagged(inATest(`await page.getByLabel('View').selectOption('paths');`))).toBe(1);
    expect(await flagged(inATest('await page.getByText(`Realised value`).click();'))).toBe(1);
  });

  it('fails an options object that does not ask for an exact match', async () => {
    expect(await flagged(inATest(`page.getByText('Realised value', {});`))).toBe(1);
    expect(await flagged(inATest(`page.getByText('Realised value', { exact: false });`))).toBe(1);
  });

  it('passes an exact match, a RegExp, and a locator scoped to something smaller than the page', async () => {
    expect(
      await flagged(
        inATest(`
          page.getByLabel('View', { exact: true });
          page.getByText(/could be delivered$/);
          dialog.getByLabel('Name');
          page.locator('form').getByText('Create policy');
          page.getByRole('region', { name: 'Evidence', exact: true }).getByText('Reason code');
        `)
      )
    ).toBe(0);
  });
});

describe('unscoped getByRole', () => {
  it('fails a plain-string name with no exact match', async () => {
    expect(await flagged(inATest(`page.getByRole('button', { name: 'Save' });`))).toBe(1);
    expect(await flagged(inATest(`page.getByRole('heading', { level: 1, name: 'The loop' });`))).toBe(1);
  });

  it('passes an exact name, a RegExp name, a role with no name, and a scoped call', async () => {
    expect(
      await flagged(
        inATest(`
          page.getByRole('button', { name: 'Save', exact: true });
          page.getByRole('button', { name: /^Open a decision / });
          page.getByRole('table');
          dialog.getByRole('button', { name: 'Create policy' });
        `)
      )
    ).toBe(0);
  });
});

describe('where the rule applies', () => {
  it('is the e2e suite, not the console', async () => {
    // A component has no `page`; the rule is about Playwright, and must not leak
    // into application code that happens to name a variable that.
    expect(await flagged(`const page = { getByText: (s: string) => s }; page.getByText('x');`, 'components/fixture.tsx')).toBe(0);
  });
});
