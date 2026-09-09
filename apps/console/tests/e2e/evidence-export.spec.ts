import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { login, ACCOUNTS } from './helpers';

/**
 * The compliance officer's last step.
 *
 * `Export PDF` and `Export JSON` were enabled `<Button>` elements with no
 * `onClick` for the life of this screen. They looked exactly like the controls
 * that work, and clicking them did nothing at all — no file, no dialog, no
 * error. The coherence review found them by clicking, which is the only way
 * they could have been found: every suite passed, because nothing asserted a
 * control that does nothing.
 *
 * So these tests do what a person does. Nothing is set up through the API. The
 * test signs in, finds a decision by clicking, exports it, and then **reads the
 * file off disk** — because an export that opens a dialog and writes nothing is
 * the same defect wearing a different coat.
 *
 * The other half is the convention. Where there is no feature behind a control,
 * this product disables it and says why, and it did that in three places and
 * not in five. These tests hold the five.
 */

test.describe('exporting evidence @screen-only', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.priya);
  });

  test('a compliance officer reaches a decision by clicking, and exports the record', async ({
    page,
  }) => {
    await page.goto('/decisions');

    // Everything the test needs, it creates by clicking: no seeded id, no API
    // call to find one. The first row is whatever the corpus put there.
    const firstRow = page.getByRole('row').nth(1);
    await expect(firstRow).toBeVisible();
    await firstRow.click();

    await expect(page).toHaveURL(/\/decisions\/dec_[0-9a-f]+$/);
    const decisionId = page.url().split('/').pop()!;

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON' }).click();
    const file = await download;

    const path = await file.path();
    expect(path, 'the browser wrote no file').not.toBeNull();
    const record = JSON.parse(readFileSync(path!, 'utf8'));

    // The name is part of the feature: evidence gets filed and emailed, and a
    // file called `download.json` is lost the moment it lands. Checked against
    // the record's own timestamp rather than a date scraped off the screen.
    expect(file.suggestedFilename()).toBe(
      `decision-${decisionId}-${record.timestamp.slice(0, 10)}.json`
    );

    // What a regulator asks for first, and what a summary export would drop.
    expect(record.id).toBe(decisionId);
    expect(record).toHaveProperty('chainHash');
    expect(record).toHaveProperty('artifactVersion');
    expect(record).toHaveProperty('eliminations');
    expect(record).toHaveProperty('scores');
    expect(record.arbitration).toHaveProperty('formula');

    // The exported record is the one on screen, not a second fetch that might
    // disagree with what the person read.
    await expect(page.getByText(record.chainHash)).toBeVisible();
  });

  test('the export is the whole record, so every candidate that lost is in it', async ({
    page,
  }) => {
    await page.goto('/decisions');
    // A decision that made an offer has candidates that did not win, which is
    // the part of a trace an appeal turns on.
    const offered = page.getByRole('row').filter({ hasNotText: 'no offer' }).nth(1);
    await offered.click();
    await expect(page).toHaveURL(/\/decisions\/dec_/);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON' }).click();
    const record = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));

    expect(Object.keys(record.scores).length).toBeGreaterThan(0);
    expect(record.candidateCount).toBeGreaterThan(0);
  });

  test('Export PDF is disabled and says what is missing, rather than doing nothing', async ({
    page,
  }) => {
    await page.goto('/decisions');
    await page.getByRole('row').nth(1).click();
    await expect(page).toHaveURL(/\/decisions\/dec_/);

    const pdf = page.getByRole('button', { name: 'Export PDF' });
    await expect(pdf).toBeVisible();
    await expect(pdf).toBeDisabled();
    // The reason reaches the person, not just a reader of the source.
    await expect(pdf).toHaveAttribute('title', /Not built/);
    await expect(pdf).toHaveAttribute('title', /W-053/);
  });
});

test.describe('exporting a compiled flow @screen-only', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
  });

  test('a flow that compiled exports its artifact, hash and pinned versions', async ({
    page,
  }) => {
    await page.goto('/decision-flows');
    // The list navigates by row click, not by link, so this is what a person
    // does rather than what a URL would do.
    await page.getByRole('row').filter({ hasText: 'Next Best Action' }).first().click();
    await expect(page).toHaveURL(/\/decision-flows\/[a-z-]+$/);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export DIR' }).click();
    const dir = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));

    // A DIR that cannot be run is not a DIR. These four are what make it one.
    expect(dir.nodes.length).toBeGreaterThan(0);
    expect(dir).toHaveProperty('edges');
    expect(dir).toHaveProperty('candidateKeys');
    expect(dir.artifactHash).toMatch(/^[0-9a-f]{8,}$/);
    expect(Object.keys(dir.packageVersions).length).toBeGreaterThan(0);

    // The hash on screen and the hash in the file are the same artifact.
    await expect(page.getByText(dir.artifactHash.slice(0, 16))).toBeVisible();
  });

  test('Version history is disabled and says what is missing', async ({ page }) => {
    await page.goto('/decision-flows/next-best-action');
    const history = page.getByRole('button', { name: 'Version history' });
    await expect(history).toBeDisabled();
    await expect(history).toHaveAttribute('title', /Not built/);
  });

  test('New flow is disabled and points at the control that does work', async ({ page }) => {
    await page.goto('/decision-flows');
    const create = page.getByRole('button', { name: 'New flow' });
    await expect(create).toBeVisible();
    await expect(create).toBeDisabled();
    // Not merely "not built": it names Edit graph, which is how a new version
    // is actually drafted today.
    await expect(create).toHaveAttribute('title', /Edit graph/);
  });

});
