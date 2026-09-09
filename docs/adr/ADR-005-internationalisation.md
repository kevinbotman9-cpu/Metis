# ADR-005: Internationalisation

**Status:** Accepted
**Date:** 2026-09-06 (proposed)
**Decided:** 2026-09-09
**Deciders:** Product owner
**Owner:** Product owner
**Decision needed by:** — decided
**Constrains:** every user-facing string in `apps/console`, and the panel and
theme packages that Stage 23 will add.

## Context

The console's definition of done has always said *"strings in a message
catalogue, never inline in JSX"*. It named `/packages/i18n/messages.json`. That
file never existed. `packages/i18n` was a 55-line stub with about twenty keys
that nothing imported, and it was deleted on 2026-09-05 with thirteen other
packages nothing imported.

So the rule has described nothing for the life of the project, and every string
in the console is inline today. `CLAUDE.md` now says so plainly, and adds an
instruction this ADR exists to honour: *do not add a new one-off i18n mechanism
to satisfy this line; the gap needs a decision, not a workaround.*

**Why it is worth deciding now rather than later.** The backlog puts i18n in
Stage 23, alongside theming and pluggable panels. That is the wrong order. Every
sprint until then adds strings, and the cost of extraction is proportional to
how many exist when someone finally does it. More importantly, Stage 23 adds
*third-party* surface — panels and themes shipped as packages — and a package
author needs to know how their strings reach a catalogue before they write any.
Deciding the mechanism late means deciding it twice.

**What makes this more than picking a library.** Three things in this platform
push back on the obvious answer:

1. **Reason codes are already the translatable layer for decisions.** Denials
   carry a stable code — `ELIGIBILITY_FAILED`, `SUITABILITY_FAILED` — precisely
   so the prose beside them is presentation. Whatever is chosen must render
   those from the code, not translate the English sentence the engine wrote.
2. **Some strings must not be translated.** A chain hash, a version, an
   operation id, a reason code itself. A mechanism that makes every string
   translatable invites someone to translate one of these.
3. **Compliance text is not UI copy.** The trace is the hero surface, and a
   mistranslated explanation of why an offer was denied is a regulatory
   problem, not a cosmetic one. Translations of that text need review by
   someone accountable, which is a workflow question rather than a library
   question.

## Decision

**Recommended: `next-intl`, with the catalogue as the source of truth and a
lint rule holding the line.**

1. Messages live in `apps/console/messages/<locale>.json`, keyed by surface —
   `offers.detail.coverageBar.label` — not by English text. Keying by English
   makes a copy edit a breaking change in every other locale.

2. `en-GB` is the source locale and the only one required to be complete. A
   missing key in another locale falls back to `en-GB` and is reported, never
   rendered blank and never rendered as its key.

3. **Reason codes render from the code.** `messages.reasonCode.ELIGIBILITY_FAILED`,
   with the engine's prose kept as a developer-facing fallback. A test asserts
   every member of the `ReasonCode` union has a message, so adding a code to
   the closed set without adding its text fails the build. This is the same
   shape as the corpus coverage check that already exists for reason codes.

4. **A lint rule fails on a new user-facing literal in JSX**, which is W-042's
   stated done-when. It needs an escape hatch for the strings that must not be
   translated, and that hatch should be an explicit marker rather than a
   comment — something like `untranslated('sha256')` — so the exception is
   greppable and reviewable.

5. **Existing strings are extracted per surface, not in one pass.** A single
   commit touching every file in the console would be unreviewable, and the
   review is where mistranslation-by-omission gets caught. The lint rule
   applies to changed files first, and widens as surfaces are converted.

## Why not the alternatives

**`react-i18next`.** Mature and framework-agnostic, and that is the problem: it
predates the App Router and needs its own arrangement for server components,
which is most of the console. `next-intl` is built for the router this project
already committed to in ADR-010.

**Roll our own.** A `t()` function over a JSON object is thirty lines, and
CLAUDE.md's instruction is aimed squarely at it. It is thirty lines until the
first plural, then the first date format, then the first right-to-left locale.
Those are solved problems and re-solving them badly is how a workaround becomes
permanent.

**Do nothing until a second locale is actually needed.** Defensible on cost, and
it loses the thing that matters: the lint rule. Without a mechanism there is no
rule, without a rule the count grows, and the decision gets harder every sprint.
It also means Stage 23's package authors invent their own conventions first.

## Consequences

**Accepted costs.**

- Every surface gains an indirection between the code and the words. That makes
  a copy change a two-file edit, and it makes the words reviewable in one place,
  which is the trade being made.
- Storybook needs a locale provider, and stories should render `en-GB` by
  default so a missing key shows up in review rather than in production.
- The E2E suite asserts on visible text in many places. Those assertions should
  read from the catalogue rather than duplicating the English, or the suite
  becomes a second place the copy lives.

**What this does not cover.** Locale-aware number and currency formatting is
already partly handled — money is formatted through a helper with a unit test —
and dates are not. Neither is decided here; both follow the mechanism.

**A caution worth recording.** Extraction is exactly the kind of mechanical
change that looks safe and is not: a string moved to the wrong key renders the
wrong text in a compliance surface, and nothing fails. Per-surface commits with
a screenshot, which the definition of done already requires, is the mitigation.

## Status, honestly

**Proposed.** `CLAUDE.md` lists "any change to the i18n structure" as needing
product and design review before code, and says the gap needs a decision rather
than a workaround. This is the recommendation with its reasoning, written so the
decision can be made — not the decision.

Nothing is implemented. `docs/CAPABILITIES.md` continues to record i18n as
missing, and the definition-of-done line in `CLAUDE.md` continues to describe
something that does not exist until this is adopted.
