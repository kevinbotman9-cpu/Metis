/**
 * What makes a creative deliverable, checked rather than assumed.
 *
 * `CreativeContent` is a discriminated union of five channel shapes, and until
 * now nothing verified one. TypeScript checks the shape at the boundary of code
 * we wrote; it cannot check a JSON body, which is where creatives actually
 * arrive. So an SMS of 400 characters, an email with no subject, or a web
 * creative whose call to action has no link would all be stored and rendered as
 * an empty string in front of a customer.
 *
 * The rules below are deliberately few, and each one is a rule somebody would
 * otherwise discover in production. Nothing here is a house style check: a
 * creative with a dull headline is a marketing problem, and a creative with no
 * headline is a delivery failure.
 *
 * `domain.ts` used to say the SMS limit was "validated at compile time". It was
 * not validated anywhere. This is where that becomes true.
 */

import type { Channel, Creative, CreativeContent } from './domain';
import { PLACEMENT_TYPES } from './domain';

export interface CreativeProblem {
  /** Dotted path into the creative, so a caller can point at the field. */
  field: string;
  message: string;
}

/**
 * The GSM limit for a single SMS segment.
 *
 * Longer messages are not rejected by networks — they are split, billed per
 * segment, and can arrive out of order on some routes. A platform that silently
 * turned one message into three would be spending the customer's money without
 * telling them, so this is a refusal rather than a warning.
 */
export const SMS_MAX_CHARS = 160;

/**
 * The GSM limit for an alphanumeric sender id.
 *
 * Eleven characters, and it is a hard limit at the carrier rather than a
 * convention: a longer id is truncated or the message is rejected outright,
 * depending on the route.
 */
export const SMS_SENDER_MAX_CHARS = 11;

const blank = (v: unknown): boolean => typeof v !== 'string' || v.trim().length === 0;

/**
 * Fields whose absence breaks delivery, per channel.
 *
 * The test is not "the renderer shows it" — that was the first version of this
 * list and it required five fields on a web creative, including a subheadline
 * and a placement. The test is: **what is broken if this is empty?**
 *
 * An empty headline renders an empty heading, and an empty SMS is not a
 * message. An empty subheadline renders a shorter card, which is a design
 * choice somebody is entitled to make. A creative refused for a field nobody
 * needed is a rule that gets worked around, and the ones that matter get worked
 * around with it.
 *
 * What each channel omits, and why:
 *
 * - **email** — `preheader` is the inbox preview line, and an inbox that has
 *   none shows the first line of the body. `fromName` absent shows the address,
 *   which is worse-looking and not broken.
 * - **web** — `subheadline` and `imageUrl` are optional by the same argument;
 *   there is no content store, so an image reference is often nothing anyone
 *   can supply yet. `placement` is a *preference*: a site asks a slot and takes
 *   the creative that names it, falling back to any creative on the channel, so
 *   an unnamed one still delivers. The call to action is handled below.
 * - **push** — a notification with no `deeplink` opens the app, which is what
 *   most of them do.
 * - **outbound_call** — `objectionHandling` is a second script for a
 *   conversation that may not need one.
 */
const REQUIRED: Record<Channel, readonly string[]> = {
  email: ['subject', 'body', 'fromAddress'],
  sms: ['text', 'senderId'],
  web: ['headline'],
  push: ['title', 'body'],
  outbound_call: ['script'],
};

/**
 * Fields that are optional alone and required together.
 *
 * A call to action is the case. Neither half is required — a web creative can
 * be a banner that says something and asks nothing. But a label with no link is
 * a control that looks clickable and is not, and a link with no label is a
 * button with no accessible name. Either half alone is the defect; both or
 * neither is the rule.
 */
const PAIRED: Partial<Record<Channel, readonly [string, string][]>> = {
  web: [['ctaLabel', 'ctaUrl']],
};

/**
 * Check a creative's content against its channel.
 *
 * Returns every problem rather than the first, because a caller fixing one
 * field at a time is a caller making five round trips.
 */
export function validateCreativeContent(
  channel: Channel,
  content: CreativeContent | undefined
): CreativeProblem[] {
  const problems: CreativeProblem[] = [];

  if (!content || typeof content !== 'object') {
    return [{ field: 'content', message: 'Content is required.' }];
  }

  // The discriminant has to agree with the creative that carries it. A web
  // creative holding email content would pass every field check below and be
  // unrenderable on the channel it claims.
  if (content.channel !== channel) {
    problems.push({
      field: 'content.channel',
      message: `Creative is on channel '${channel}' and its content declares '${content.channel}'.`,
    });
    // Field names differ per channel, so checking them against the wrong shape
    // would produce a list of problems that are all the same problem.
    return problems;
  }

  const record = content as unknown as Record<string, unknown>;
  for (const field of REQUIRED[channel]) {
    if (blank(record[field])) {
      problems.push({ field: `content.${field}`, message: `${field} is required.` });
    }
  }

  for (const [a, b] of PAIRED[channel] ?? []) {
    const hasA = !blank(record[a]);
    const hasB = !blank(record[b]);
    if (hasA !== hasB) {
      const missing = hasA ? b : a;
      const given = hasA ? a : b;
      problems.push({
        field: `content.${missing}`,
        message: `${given} is set, so ${missing} is required — a call to action needs both a label and a link, or neither.`,
      });
    }
  }

  switch (content.channel) {
    case 'sms':
      if (typeof content.text === 'string' && content.text.length > SMS_MAX_CHARS) {
        problems.push({
          field: 'content.text',
          message: `SMS is ${content.text.length} characters; the limit is ${SMS_MAX_CHARS}. Longer messages are split and billed per segment.`,
        });
      }
      if (
        typeof content.senderId === 'string' &&
        content.senderId.length > SMS_SENDER_MAX_CHARS
      ) {
        problems.push({
          field: 'content.senderId',
          message: `Sender id is ${content.senderId.length} characters; carriers allow ${SMS_SENDER_MAX_CHARS}.`,
        });
      }
      break;

    case 'email':
      // Not a full address grammar — that argument has no end. Enough to catch
      // a name where an address belongs, which is the mistake people make.
      if (typeof content.fromAddress === 'string' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(content.fromAddress)) {
        problems.push({
          field: 'content.fromAddress',
          message: `'${content.fromAddress}' is not an email address.`,
        });
      }
      break;

    case 'web':
      // A closed set, so a value outside it is a typo or a stale import rather
      // than a design somebody meant. Blank is allowed: a creative designed for
      // no particular shape can fill any slot on the channel.
      if (
        !blank(content.placement) &&
        !PLACEMENT_TYPES.some((p) => p.id === content.placement)
      ) {
        problems.push({
          field: 'content.placement',
          message: `'${content.placement}' is not a placement type. One of: ${PLACEMENT_TYPES.map((p) => p.id).join(', ')}.`,
        });
      }

      // A call to action that goes nowhere is worse than no call to action: it
      // looks clickable and is not.
      for (const field of ['ctaUrl', 'imageUrl'] as const) {
        const value = record[field];
        if (typeof value === 'string' && value.trim() !== '' && !/^(https?:\/\/|\/)/.test(value)) {
          problems.push({
            field: `content.${field}`,
            message: `'${value}' is neither an absolute URL nor a site-root path.`,
          });
        }
      }
      break;

    case 'push':
      // Blank is allowed — a notification with no deeplink opens the app — so
      // only a deeplink that was actually supplied is checked for shape.
      if (!blank(content.deeplink) && !/^[a-z][a-z0-9+.-]*:|^\//i.test(content.deeplink)) {
        problems.push({
          field: 'content.deeplink',
          message: `'${content.deeplink}' is not a deeplink: expected a scheme like 'app://' or a path.`,
        });
      }
      break;

    case 'outbound_call':
      break;
  }

  return problems;
}

/**
 * Whether an offer may be active, given the creatives it has.
 *
 * `domain.ts` says "at least one is required to go active" and nothing enforced
 * it, so an offer could be active, win a decision, and have nothing to render —
 * which is exactly what the storefront's "no creative for this channel" state
 * is showing when it appears.
 *
 * Active rather than merely present: a creative that exists and is switched off
 * cannot be delivered, so it cannot be the reason an offer is deliverable.
 */
export function offerMayBeActive(creatives: Creative[]): boolean {
  return creatives.some((c) => c.active);
}
