# ADR-015: Layout manifests declare an instance of a pattern, not an arrangement of regions

**Status:** Accepted
**Date:** 2026-09-11 (proposed)
**Decided:** 2026-09-11
**Deciders:** Product owner
**Owner:** Product owner
**Decision needed by:** — decided

**Accepted as written:** the pattern-instance decision (§1) and the build order
(*Build first, defer*). Of §4's proposals, **Gallery folds into list–detail**, and
**Wizard and Confirm are dialogs, not screens**. **The Form review is held**, as
proposed: `/settings` keeps its route and its hand-built page until design review
decides whether Form is an eighth pattern. Calendar, Reader, Preview + config and
Canvas-lite stay deferred to the review Part 4 already requires, held when each
screen is built.
**Constrains:** `packages/ui-metadata`; every `apps/console/app/**/page.tsx`; check
5 in `scripts/conformance.mjs`; `docs/UX_CONTRACT.md` §2, both its wording and its
`[id]` exemption; Parts 3 and 4 of `docs/METIS_CONSOLE_SPEC.md`; W-041; the
`ui-panel` package kind in W-038; G-004.
**Arises from:** 21 of the 26 standing conformance failures, one per route, and
W-041.

## Context

### The number, and what the check it comes from actually checks

`node scripts/conformance.mjs` today reports 26 failures, and **21** of them are
`[layout-manifests]`, not 20. The extra one is `/objectives`, added by the
taxonomy slice after the baseline was recorded on 2026-09-10; another rule fell
by one, which is why the total did not move. The 21 routes are every page under
`apps/console/app` except `/login`, which renders outside the app shell, and the
four `[id]` routes.

The rule is a **substring match**. `checkLayoutManifests` reads every `.json` and
`.ts` file under `packages/ui-metadata/layouts` into one string, and passes a route
if its path appears anywhere in it (`scripts/conformance.mjs:162`, `:176`). A
single file holding twenty-one route strings, read by nothing, would clear every
failure. That is exactly the format `CLAUDE.md` forbids inventing to move a
number. It is recorded here so nobody does it, and because **the check has to
change with the format** (§5): a check a string list can satisfy is not checking
that a screen is declared.

### What the screens are today

Every screen is a page of 168 to 784 lines that fetches its own data and arranges
`PageHeader`, `Card`, `DataTable` and a few bespoke components by hand. There is
no pattern component except the Cascade rail (`components/cascade-rail.tsx`),
shared by `/performance` and the trace reader.

List–detail, §4.1's "single biggest contributor to feeling like a product rather
than a website", **is implemented nowhere**. Its defining rule — "no page
navigation between list and detail" — is broken by the one screen that comes
closest: `/offers` opens a drawer over its table, and separately navigates to
`/offers/[id]` for the full detail. The other nine are arranged by hand, most as
a table in a card, and none has a detail pane at all.

### What the specification assigns, and where the documents disagree

Part 3 of `METIS_CONSOLE_SPEC.md` names a pattern for every screen. For the 21
routes that need a manifest, it assigns:

| Pattern (§) | Routes | Count |
|---|---|---|
| List–detail (4.1) | `/agentic`, `/experiments`, `/frequency-policy`, `/integrations`, `/objectives`, `/offers`, `/placements` | 7 |
| List–detail with an extension | `/targeting-policies` (+ rule editor), `/creatives` (+ preview), `/arbitration` (+ live preview) | 3 |
| Workbench (4.4) | `/approvals`, `/audit`, `/data-model`, `/data-model/intake`, `/decisions`, `/integrations/traffic` | 6 |
| Dashboard (4.5) | `/` | 1 |
| Canvas + inspector (4.2) | `/decision-flows` | 1 |
| Cascade (4.7) | `/performance` | 1 |
| Split result (4.6) | `/simulations` | 1 |
| Form, which is not one of the seven | `/settings` | 1 |

**Two patterns cover sixteen of twenty-one screens.** That is the whole
leverage question in one line.

Three places in the documents already disagree with each other, and this
decision has to settle them rather than inherit them:

1. **`UX_CONTRACT.md` §2 presumes the answer.** *"A screen is a layout manifest:
   regions, slots, occupancy, persona"* (line 24) describes a screen, not a
   pattern — written before anyone asked the question this ADR is for.
2. **Part 4 says seven patterns and Part 3 uses about seventeen names.**
   *"Seven patterns. Every screen uses one. A screen that needs an eighth is a
   design review, not an invention"* (line 329). Part 3 then assigns Calendar,
   Gallery, Gallery + detail, Gallery + live preview, Preview + config, Reader,
   Wizard, Confirm, Canvas-lite and Form, none of which is among the seven.
3. **The `[id]` exemption exempts the hero screen.** §2 excuses every dynamic
   route because *"it renders inside its parent's list–detail manifest"* (line
   31). `/decisions/[id]` is the trace reader, the Evidence reader, *"the single
   most important screen in the product"*. `/decision-flows/[id]` is the canvas.
   `/approvals/[id]` is a Workbench item. None of them is a detail pane of a
   list, and the exemption keeps all three away from the check.

### The precedent, and exactly how far it went

The form descriptor registry solved this problem for forms, and it is the
template (ADR-006). A descriptor is **data with no React in it**
(`packages/ui-metadata/src/types.ts`). One generic renderer draws every form. A
drift check fails when a descriptor and its OpenAPI schema disagree in either
direction. A `PENDING` list admits, with a reason each, the entities still
waiting. Data a descriptor needs from elsewhere is named rather than queried —
`OptionSource` (`types.ts:75`) — so the descriptor stays data.

What the precedent did **not** do matters as much for §7 and §8. ADR-006 §2 says
schemas are *"served through the API"*. They are not: the OpenAPI spec has no
descriptor operation, and the console imports the registry at build time. So
Rule 8's *"zero changes under `apps/console/app/`"* is met. *"A customer adds a
field without a vendor ticket"* is not: a field is still a repository change and
a deploy. Whatever manifests do, they should not claim more than that on day one.

## Decision

### 1. A manifest declares one instance of one pattern; the pattern declares its slots

**The case for describing a screen** — regions, slots, what occupies each — is
real. It can express any arrangement, so no screen is ever refused. It is what
`UX_CONTRACT.md` §2 already says. It is exactly what the Dashboard pattern needs
(*"panels occupy slots; admin reorders"*). And an admin reordering panels is a
natural operation on it.

**What it cannot do is carry the patterns.** Part 4's rules are mostly behaviour,
not arrangement:

- list–detail keeps tab state in the URL, moves with `j`/`k` and returns focus
  with `Esc`, and ends its detail pane with a footer showing version, state,
  editor and time;
- Cascade never changes its rail when a stage is selected, and refuses a stage
  whose figure exceeds the one above it;
- the Evidence reader makes every number a link.

A manifest of regions and slots has nowhere to put any of this. So under screen
description, each of the twenty-one screens re-implements its pattern, or
quietly does not, and **improving list–detail is ten separate changes** that
drift apart from the first. Part 4's "an eighth pattern is a design review"
becomes unenforceable too, because every screen manifest *is* its own pattern.

**The case for a pattern instance** is the leverage.

- The list–detail renderer is built once and ten screens get it: the split
  canvas, the keyboard path, the five states `UX_CONTRACT.md` §4 requires, the
  axe pass.
- An eighth pattern becomes a code change to the pattern library, reviewable,
  instead of a manifest that happens to look new.
- A pattern's own rule can become a type. §4.7's *"a rail is earned by having a
  spine"* becomes: a Cascade manifest must declare ordered stages, each a subset
  of the one before it, or it does not validate.
- It is also the shape the precedent proved. A descriptor does not describe a
  form as input boxes at coordinates. It declares an entity's fields in a
  constrained vocabulary — groups, order, conditions — and a renderer that owns
  the rules draws it.

**The case against a pattern instance** is rigidity. Three of the ten list–detail
screens are "list–detail plus something", Part 3 names ten patterns the seven do
not contain, and every pattern is under constant pressure to grow a flag for the
next screen — until it has become a screen description with worse ergonomics.

**Resolution: the pattern instance, with the screen-description vocabulary kept
inside it.** A pattern declares its regions and its **slots**. A manifest names
its pattern, fills the pattern's parameters, and places occupants in the slots
the pattern declares. It never declares a region of its own.

- The three compound screens are list–detail with an occupant in a slot. The
  rule editor, the preview and the live preview are panels in the detail pane's
  tab or aside slots, not new patterns.
- Where the specification genuinely asks for free arrangement — the Dashboard —
  the pattern *is* a slot grid (§3). Screen description survives exactly where
  it is called for, and nowhere else.

**The rule that keeps patterns from growing flags:** a pattern parameter exists
only if two screens use it. Anything one screen needs is a panel in a slot.

**The mistake this prevents** is approving "regions and slots" because it sounds
more flexible. That flexibility is precisely what the seven-pattern rule exists to
remove, and taking it back would reproduce, in data, the twenty-one hand-arranged
pages that exist today in code.

### 2. What a manifest holds

```ts
{
  id: 'targeting-policies',
  route: '/targeting-policies',
  formatVersion: 1,
  pattern: 'list-detail',                    // closed set; §3
  params: {                                  // typed per pattern
    list:   { source: 'targetingPolicies', columns: ['name', 'kind', 'scope', 'active'],
              facets: ['kind', 'active'] },
    detail: { entity: 'TargetingPolicy' },   // its edit form is the descriptor, never repeated
    detailRoute: null,
  },
  slots: {
    'detail.tabs':  [{ id: 'overview', panel: 'core.entity-overview' },
                     { id: 'rule',     panel: 'core.rule-editor' }],   // the "+ rule editor"
    'detail.aside': [],
  },
}
```

- **Data sources are named, not queried** (`source: 'targetingPolicies'`). The
  host resolves the name to a generated-client call, as `OptionSource` is resolved
  today, so a manifest can never call `fetch` (Rule 2) and stays data.
- **No permission and no persona.** `apps/console/lib/nav/route-permissions.ts`
  and `PERSONA_MANIFEST` (`apps/console/lib/nav/persona-manifest.ts:74`) are the single sources
  ADR-011 established, and the check joins them rather than copying them. That
  removes "persona" from §2's list of what a manifest holds.
- **Labels inline**, as descriptors' are. When ADR-005's catalogue exists they
  move with the descriptors, as message keys shaped by surface; a manifest does
  not get an i18n mechanism of its own.
- **Ids for slots and occupants, never positions.** §7 depends on it: an overlay
  that says "second tab" breaks when the vendor adds a first one.

Manifests live in `packages/ui-metadata/src/layouts/`, beside the descriptors, with
their own registry export. A route's `page.tsx` becomes one call — render the
screen with manifest `targeting-policies` — and nothing else.

### 3. The seven patterns, one at a time

| Pattern | Slots it declares | Expressible as a pattern instance? |
|---|---|---|
| **List–detail** (4.1) | `list.toolbar`, `detail.tabs`, `detail.aside`, `detail.actions` | Yes, for all ten screens. The three extensions occupy `detail.tabs` or `detail.aside`. `detailRoute` names the `[id]` route that deep-links a selection, and only a route named there is exempt from its own manifest (§5) |
| **Canvas + inspector** (4.2) | `palette`, `inspector.tabs`, `canvas.overlays` | Yes, around a bespoke centre. The canvas stays hand-built — ADR-006 §4, *"bespoke surfaces remain legal where they earn it"*. The manifest declares the node set and the inspector's tabs; the renderer owns selection and viewport in the URL. `/decision-flows/[id]` becomes this pattern's route |
| **Evidence reader** (4.3) | `header.actions`, `source.sections` | Yes. The funnel and the source pane belong to the renderer, and "every number is a link" becomes a property of the pattern rather than a hope for each screen. It is today exempt from the check through `/decisions/[id]`, which §5 ends |
| **Workbench** (4.4) | `rail.facets`, `toolbar`, `row.actions` | Yes, for all six screens. Per-user column choices (§4.4, *"persists per user per screen"*) are a preference, stored per user, and not part of the manifest |
| **Dashboard** (4.5) | `grid` — a 12-column slot area, spans 3/4/6/12 | Yes, and it is the one pattern whose instance *is* a slot arrangement. The only pattern the specification asks an admin to reorder (§8) |
| **Split result** (4.6) | `setup`, `summary.figures` (three), `result.tabs` | Yes. The winners / losers / unchanged tabs, and the rule that a result is always segmented, belong to the renderer |
| **Cascade** (4.7) | `stage.detail`, `evidence` | Yes, with the tightest type: stages declared in order, each a subset of the one above, and a declared break where one exists. A manifest over a list with no spine does not validate, which is §4.7's own warning made mechanical |

### 4. The patterns Part 3 names that are not among the seven

This ADR does not grow the catalogue by itself. It proposes which names fold into
the seven, and names the one review to hold.

| Name in Part 3 | Proposal |
|---|---|
| Gallery, Gallery + detail, Gallery + live preview | **Fold into list–detail**, with a list-presentation parameter of rows or cards. Used by the Node library, Packages, Packs and Themes — enough screens to earn the parameter under §1's two-screen rule |
| Wizard (Export), Confirm (Rollback) | **Not screens.** Actions inside a screen, in a Radix dialog, as `CLAUDE.md` requires of dialogs. Remove from the pattern column |
| Form (`/settings`) | **The one review to hold now**: it is the only such name with a live route among the 21. A single-pane pattern whose body is a descriptor — the point where the two registries meet. Recommended as the eighth pattern; a design decision, and flagged as one |
| Calendar, Reader, Preview + config, Canvas-lite | **Deferred to the review Part 4 already demands**, held when each screen is built. None has a route today, and deciding their shape without a screen would be deciding blind |

### 5. The check changes with the format

1. **A route passes only if its page renders through a manifest.** The check reads
   `page.tsx` and requires that it renders the screen renderer with a manifest id
   the registry holds, and nothing else — not that the route's path appears in a
   file. A string list can no longer clear it.
2. **A registry test, in the descriptors' shape.** Every manifest names a route
   that exists (`lib/nav/routes.generated.ts`). Every occupant names a panel that
   exists. Every `detail.entity` has a descriptor, or is in the descriptor
   registry's `PENDING` with its reason. Every pattern's parameters validate
   against that pattern's type.
3. **The `[id]` exemption narrows** to routes a list–detail manifest names as its
   `detailRoute`. `/decisions/[id]`, `/decision-flows/[id]` and `/approvals/[id]`
   then need manifests. That adds **three** `[layout-manifests]` failures, and it
   should land in the same slice as enough conversions to keep the count from
   rising (§ *Build first*).
4. **No `PENDING` list for routes.** Unlike descriptors, this rule already has a
   ledger: the conformance count, ratcheted against the baseline. A pending list
   would turn 21 failures into 21 excuses without converting a screen, which is
   moving a number. The count falls only as pages are converted.

Each check is to be seen failing before it is trusted, as Rule 9 requires.

### 6. Relation to the form descriptor registry

Same package, same rules, and **a manifest refers to descriptors; it never
repeats them.** A list–detail's edit form is the entity's descriptor; its detail
overview renders the descriptor's fields read-only. The two registries meet at
list–detail's detail pane and at the Form pattern, and a field added to a
descriptor appears in every screen showing that entity with no manifest change.
That is Rule 8 carried one level up.

What differs is what each is checked against: descriptors against the OpenAPI
schema, manifests against the routes, the descriptors and the panels. And each
pattern renderer is bespoke code — ADR-006 §4's rule, applied at the level of the
pattern rather than the screen: generated where the thing is repetitive, hand-built
where the interaction earns it, and never both for the same thing.

### 7. Versioning

- **v1: in the repository.** Git history, plus `formatVersion` for changes to the
  format itself, so a manifest written for format 1 is never silently
  reinterpreted by a format-2 renderer. The same footing descriptors have. No
  claim of tenant editability until something serves and stores them (§ *The
  precedent*).
- **Manifests never enter a decision or catalogue hash.** They govern what a
  screen shows, not what was decided, the same boundary a placement's slot count
  sits behind (G-010).
- **When tenants can edit layouts, they edit overlays, not copies.** An overlay
  refers to slot and occupant ids: hide, reorder within a slot, or occupy a slot
  with an installed panel. It is stored as a registry object with immutable
  versions and approval through change sets — the `packages/registry` pattern,
  and G-004's `publishLayoutManifest`. Because an overlay is never a fork, a
  vendor improvement to the base manifest still reaches a tenant who customised
  it. A copied manifest would freeze that tenant on the day they reordered a tab.

### 8. An admin reordering panes: not in v1

- **Nothing serves or stores UI metadata yet** — not even descriptors (§ *The
  precedent*). Admin reordering needs both, plus per-tenant versioning and an
  approval path. That is a governance design, not a layout one.
- **The specification asks for it in one pattern**: the Dashboard (*"Admin
  reorders and saves as a version"*, line 433), and there is one dashboard route,
  `/`. The Layouts admin screen it needs (Part 3, Canvas-lite) does not exist.
- **What v1 must do to keep it possible** is §2's rule: stable ids for slots and
  occupants. That costs nothing now and is the whole difference between overlays
  being possible later and every manifest having to be rewritten.

### 9. What W-038's package system needs

A `ui-panel` package declares:

- its id and version;
- the **slot types** it can fill — `list-detail.detail.tabs` for entity `Offer`,
  `dashboard.grid`, `evidence.source.sections`;
- its **data contract**, as the generated-client operations it calls;
- the permission it requires, and its size in the slot types that take one.

**Installing a package places nothing.** A panel appears only when a manifest, or
later an overlay, puts it in a slot, so what a screen shows is always a reviewable
declaration rather than a side effect of an install.

This is where the choice in §1 pays most. Under screen description a package
would have to name screens and regions, and would break whenever a screen was
rearranged. Under pattern slots, a panel written for "a detail tab of an Offer"
works on every screen that shows an Offer in list–detail, and survives redesigns
of all of them.

What this ADR does **not** decide is the panel host's security model. `CLAUDE.md`
fixes v1 panels as signed-partner-only, defers customer-authored panels in an
iframe sandbox, and flags any change to the host model for review. The slot
declaration above is compatible with all of that and decides none of it.

## Build first, defer

**First: the format, the list–detail renderer, and two screens.**

- The manifest types and registry. The list–detail pattern renderer: the split
  canvas, the keyboard path, all five states, Storybook across the four theme
  axes, and axe clean.
- `/placements` and `/objectives` converted. Both are already descriptor-driven,
  so the conversion tests the pattern rather than the forms.
- The new check from §5, seen to fail.

**The second screen is the point.** It should cost a manifest and no component
code. If it needs component code, the pattern is wrong, and the time to find out
is at two screens, not ten. Failures go from 21 to 19, honestly.

**Second: Workbench,** six screens, the same way.

**Third: the `[id]` exemption narrowed,** with the Evidence reader and Canvas +
inspector as patterns and `/decisions/[id]` and `/decision-flows/[id]` converted
in the same slice. The hero screen comes under the check, and the count does not
rise.

**Then** the remaining list–detail screens. `/offers` folds its drawer and its
`[id]` page into the split canvas; `/creatives`, `/arbitration` and
`/targeting-policies` put their extensions in slots.

**Deferred, with the reason:**

- **Admin reordering and overlays** (§8). A governance design, and it needs served
  and stored UI metadata first.
- **Serving manifests through the API.** Not before descriptors are, since the two
  should arrive together.
- **`ui-panel` packages.** W-038, which waits on real capabilities to package. The
  slot types are defined now as part of the format, so W-038 has something to
  target.
- **The Form pattern**, until design review decides it (§4).
- **Calendar, Reader, Preview + config and Canvas-lite**, until their screens are
  built.
- **Dashboard's slot grid**, until a second dashboard exists. `/` is the only one,
  and a grid with one user is a guess.

## Consequences

**The first thing to go wrong** will be a screen that almost fits. `/arbitration`
edits weights as sliders and lists boosts beside a live preview. It will press for
a list–detail parameter that only it uses, and §1's two-screen rule says to make
it a panel in a slot instead. Whoever converts it will be tempted to add the
parameter, because it is faster.

**Every page is rewritten** as one line, and its data fetching moves behind named
sources. That is the largest cost, repeated across twenty-one screens. The
end-to-end tests assert against the DOM, so each conversion has to keep its
`@screen-only` test green, and a conversion that needs the test changed is
changing what the screen does as well as how it is declared.

**Some screens change visibly.** `/offers` loses its drawer to the split canvas —
what the specification asks for, a user-visible change, and one the demo will
notice. Bespoke touches on individual screens get flattened into their pattern,
and some of that is loss.

**The conformance count rises by three** when the exemption narrows. Stated here,
so it lands deliberately, in a slice that converts enough screens to offset it.

**Two documents need editing after acceptance, not in this change.**
`UX_CONTRACT.md` §2 — its wording and its exemption. `METIS_CONSOLE_SPEC.md` Part
3 — the pattern names §4 folds. And the descriptor registry's `PENDING` reason for
`Layout` changes, from "do not exist" to "declared in the repository; not
editable until overlays".

## Alternatives considered

**Describe the screen: regions, slots, occupancy.** Argued in §1. It is the most
flexible option, and flexibility is what the seven-pattern rule exists to remove.
It has nowhere to put a pattern's behaviour, so each screen re-implements it or
drops it. It makes improving list–detail ten changes. And it gives packages
coordinates to target that move whenever a screen does.

**A pattern component library with no manifest.** The strongest alternative, and
honestly most of the value: build `<ListDetail>` once, and have each page compose
it with props in code. It delivers the leverage, and a check can still verify that
each page uses exactly one pattern. It loses the other two things W-041 is for.
A package cannot place a panel into code, and a tenant's reordering cannot be an
overlay on code. If neither were ever going to exist, this would be enough. Both
are in the plan — W-038, and §4.5 of the specification — so the manifest stays,
but the build order reflects this alternative: the renderer is the product, and
the manifest is its props as data.

**A free-form grid for every screen**, with a third-party grid layout library.
Screen description plus a dependency. Third-party layout is flagged for review in
`CLAUDE.md`, and the Dashboard is the only place a grid is asked for.

**A "custom" pattern as an escape hatch.** It becomes the default within a month.
Spine 6 recorded 311 of 314 capability rows as not configurable without code on
2026-09-10 (`docs/JOURNEY_SPINES.md`), which is what escape hatches accumulate
into.

**Clearing the count with a file listing the routes.** The rule as written would
accept it (§ *Context*). Listed so that nobody tries it.
