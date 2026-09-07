import { describe, it, expect } from 'vitest';
import {
  validateCreativeContent,
  offerMayBeActive,
  SMS_MAX_CHARS,
  SMS_SENDER_MAX_CHARS,
} from '../src/creative';
import type { Creative, CreativeContent } from '../src/domain';

/**
 * Content validation, which until now existed only as a comment.
 *
 * `domain.ts` said the SMS limit was "validated at compile time" and nothing
 * validated it anywhere. TypeScript checks the shape at the boundary of code we
 * wrote; a creative arrives as a JSON body, where it checks nothing. Each rule
 * below is one somebody would otherwise meet in production.
 */

const email = (over: Partial<Record<string, unknown>> = {}): CreativeContent =>
  ({
    channel: 'email',
    subject: 'Your network, unlimited',
    preheader: 'Move to Unlimited 5G for £35 a month',
    body: 'Hi {{first_name}}, you have used more than 80% of your allowance.',
    fromName: 'Meridian Mobile',
    fromAddress: 'offers@meridian.example',
    ...over,
  }) as CreativeContent;

const sms = (over: Partial<Record<string, unknown>> = {}): CreativeContent =>
  ({ channel: 'sms', text: 'Need more data? Add 10GB for £8.', senderId: 'Meridian', ...over }) as CreativeContent;

const web = (over: Partial<Record<string, unknown>> = {}): CreativeContent =>
  ({
    channel: 'web',
    headline: '900Mb full fibre, £45/mo',
    subheadline: 'Free installation.',
    imageUrl: '/assets/offers/fibre-900.jpg',
    ctaLabel: 'Check availability',
    ctaUrl: '/broadband/fibre-900',
    placement: 'homepage_hero',
    ...over,
  }) as CreativeContent;

const fields = (problems: { field: string }[]) => problems.map((p) => p.field).sort();

describe('validateCreativeContent', () => {
  it('accepts a complete creative on every channel', () => {
    expect(validateCreativeContent('email', email())).toEqual([]);
    expect(validateCreativeContent('sms', sms())).toEqual([]);
    expect(validateCreativeContent('web', web())).toEqual([]);
    expect(
      validateCreativeContent('push', {
        channel: 'push',
        title: 'Your data is nearly gone',
        body: 'Add 10GB in two taps.',
        deeplink: 'meridian://addons/data-boost',
      })
    ).toEqual([]);
    expect(
      validateCreativeContent('outbound_call', {
        channel: 'outbound_call',
        script: 'Confirm the contract end date, then offer the loyalty discount.',
        objectionHandling: 'If they mention a competitor price, do not match below floor.',
      })
    ).toEqual([]);
  });

  it('refuses content whose channel disagrees with the creative', () => {
    // Would pass every field check on its own shape and be unrenderable on the
    // channel it claims.
    const problems = validateCreativeContent('web', email());
    expect(fields(problems)).toEqual(['content.channel']);
  });

  it('reports every missing field at once, not the first', () => {
    // A caller fixing one field per round trip is a caller making five.
    const problems = validateCreativeContent('email', email({ subject: '', body: '   ' }));
    expect(fields(problems)).toEqual(['content.body', 'content.subject']);
  });

  it('treats whitespace as missing', () => {
    expect(fields(validateCreativeContent('sms', sms({ text: '   ' })))).toContain('content.text');
  });

  it('refuses an SMS over the segment limit', () => {
    const problems = validateCreativeContent('sms', sms({ text: 'x'.repeat(SMS_MAX_CHARS + 1) }));
    expect(fields(problems)).toEqual(['content.text']);
    expect(problems[0].message).toMatch(/split and billed per segment/);
  });

  it('accepts an SMS exactly at the limit', () => {
    // Off-by-one here would reject a message that is fine, which is the sort of
    // rule people work around by deleting the check.
    expect(validateCreativeContent('sms', sms({ text: 'x'.repeat(SMS_MAX_CHARS) }))).toEqual([]);
  });

  it('refuses a sender id longer than carriers accept', () => {
    const problems = validateCreativeContent(
      'sms',
      sms({ senderId: 'x'.repeat(SMS_SENDER_MAX_CHARS + 1) })
    );
    expect(fields(problems)).toEqual(['content.senderId']);
  });

  it('refuses a from address that is not an address', () => {
    expect(fields(validateCreativeContent('email', email({ fromAddress: 'Meridian Mobile' })))).toEqual(
      ['content.fromAddress']
    );
  });

  it('refuses a call to action that goes nowhere', () => {
    // Looks clickable, is not — worse than having no call to action.
    expect(fields(validateCreativeContent('web', web({ ctaUrl: 'broadband/fibre' })))).toEqual([
      'content.ctaUrl',
    ]);
    expect(validateCreativeContent('web', web({ ctaUrl: 'https://meridian.example/x' }))).toEqual([]);
  });

  it('allows a web creative with no image, and refuses a malformed one', () => {
    // The platform has no content store (W-015), so an image is not required.
    // A path that is neither absolute nor site-rooted is a mistake either way.
    expect(validateCreativeContent('web', web({ imageUrl: '' }))).toEqual([]);
    expect(fields(validateCreativeContent('web', web({ imageUrl: 'offers/fibre.jpg' })))).toEqual([
      'content.imageUrl',
    ]);
  });

  it('refuses a deeplink with no scheme or path', () => {
    const problems = validateCreativeContent('push', {
      channel: 'push',
      title: 'x',
      body: 'y',
      deeplink: 'addons-data-boost',
    });
    expect(fields(problems)).toEqual(['content.deeplink']);
  });

  it('refuses absent content rather than throwing', () => {
    expect(fields(validateCreativeContent('email', undefined))).toEqual(['content']);
  });
});

describe('offerMayBeActive', () => {
  const creative = (active: boolean): Creative =>
    ({ id: 'c1', offerId: 'o1', name: 'c', channel: 'web', content: web(), active, locale: 'en-GB', createdAt: '', updatedAt: '' }) as Creative;

  it('is false with no creatives at all', () => {
    expect(offerMayBeActive([])).toBe(false);
  });

  it('is false when every creative is switched off', () => {
    // Present is not the same as deliverable. An offer whose only creative is
    // inactive can win a decision and render nothing.
    expect(offerMayBeActive([creative(false), creative(false)])).toBe(false);
  });

  it('is true with one active creative', () => {
    expect(offerMayBeActive([creative(false), creative(true)])).toBe(true);
  });
});
