# METIS Console — Agent Implementation Instructions

## Absolute Rules

These are non-negotiable. Every PR must enforce them.

1. **Never hardcode sample data in a component.** Mock data lives only in MSW handlers derived from the OpenAPI spec. If you need sample data, generate it via MSW fixtures and register the mock in the fixture store.

2. **Never call fetch directly from a component.** All data goes through `packages/client`, which is generated from the OpenAPI spec. If an endpoint is not in the spec, it does not exist.

3. **Never add an endpoint to packages/client by hand.** Add it to the OpenAPI spec and regenerate the client. Hand-edited client code is a liability.

4. **Never write a literal colour, spacing or radius value in app code.** Use CSS custom properties mapped to design tokens. If you need a new token, add it to the token system and update all theme axes.

5. **Never build a dialog, menu, combobox or tooltip from scratch.** Use Radix UI. We do not hand-build accessible components.

6. **If a capability is not in the OpenAPI spec and not BUILT in the platform, stop and ask.** Do not invent the API. Register the gap in `/docs/gaps.md` and mock it for development.

---

## Definition of Done for Every PR

- [ ] Storybook story for every new component, covering all four theme axes (light/dark × compact/comfortable)
- [ ] Vitest unit tests for logic; Playwright test for any new user flow
- [ ] axe-core clean (zero WCAG 2.2 AA violations)
- [ ] Full keyboard path verified; visible focus indicators
- [ ] Loading, empty, error and permission-denied states implemented
- [ ] Strings in a message catalogue, never inline in JSX — **not currently
      possible.** This rule named `/packages/i18n/messages.json`, which never
      existed; the stub package it lived in was deleted on 2026-09-05. Every
      string is inline today. Do not add a new one-off i18n mechanism to satisfy
      this line; the gap is registered in `docs/gaps.md` and needs a decision,
      not a workaround.
- [ ] Every displayed number links to its source trace or explains why it cannot
- [ ] Route bundle size within budget (checked in CI)
- [ ] Screenshot attached to the PR description, showing the component in Storybook

---

## Build Order Within a Task

1. **Read the OpenAPI spec** for the endpoints you need. Check existing tokens.
2. **Build in Storybook first** against MSW fixtures, before wiring into a route. Forces states to be enumerated.
3. **Screenshot and self-critique** against the design direction (§5 of the Experience Layer plan) before opening the PR.
4. **Wire into the route**, add Playwright test, run axe.

Building in Storybook first is not optional. It makes output reviewable in seconds, not minutes.

---

## What to Do When the Platform Is Not Ready

The platform will lag the console. This is normal and OK.

1. Add the contract to the OpenAPI spec as a proposed operation
2. Generate the mock via MSW
3. Build the component against the mock
4. Register the gap in `/docs/gaps.md` with the operation ID and brief rationale

**Do not stub inside the component.** The mock goes in MSW, not in your code. The UI always reads from the generated client, which routes to either the real API or the mock depending on the environment.

---

## Vocabulary

Use these terms consistently across the product:

- **artifact** — compiled strategy + metadata
- **strategy** — a DIR (decision graph)
- **action** — named decision outcome (e.g., "upsell_5g")
- **treatment** — the content/offer associated with an action
- **trace** — the audit record of a decision
- **replay** — re-execute a historical decision
- **change request** — the approval interface (like a PR)
- **package** — a distributable unit (node types, themes, packs)
- **pack** — a regulatory or industry-specific package
- **lever** — a tunable weight in an arbitration formula
- **placement** — a content slot in a customer journey

Never use "submit" for buttons. Buttons name their effect ("Publish", "Approve", "Reject", "Replay").

---

## When You Are Blocked

- **Platform API doesn't exist** → register in `/docs/gaps.md`, add to OpenAPI spec as a proposed operation, generate mock
- **Uncertain which audience this screen is for** → check the persona list in the Experience Layer plan
- **Uncertain what state to show** → the Playwright test file has the full state matrix (loading, empty, error, permission-denied, stale-data)
- **Uncertain whether a design decision is right** → check the design direction (§5 of the Experience Layer plan); if it conflicts, flag for product review

---

## Key Decisions Already Made

These are locked in. ADRs exist in `/docs/adr/` if you want the rationale.

- **Framework:** Next.js App Router, `output: standalone`
- **State management:** TanStack Query for server state; URL for navigation state; Zustand for canvas-local state only
- **Styling:** Tailwind mapped onto CSS custom properties (token layer)
- **Primitives:** Radix UI (unstyled, accessible)
- **Graph canvas:** React Flow (xyflow)
- **Testing:** Vitest (unit), Playwright (E2E + visual), axe-core (a11y)
- **Design north star:** Compliance Officer (the trace is the hero)
- **Theme axes:** light/dark × compact/comfortable (2×2 = 4 axes)
- **Panels:** Signed-partner-only in v1; customer-authored (iframe sandbox) deferred

---

## Flag for Review Before Implementing

- Any use of third-party charting beyond Recharts
- Any custom layout algorithm in the canvas
- Any panel-host security model changes
- Any new token (colour, spacing, radius)
- Any change to the i18n structure

These are high-touch and need product/design review before code.

---

**Questions?** Check `/docs/gaps.md` for what's outstanding, or `/docs/EXPERIENCE_LAYER_STATUS.md` for which surfaces are BUILT vs SCAFFOLD vs DESIGN.
