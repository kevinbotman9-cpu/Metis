# METIS — UX and Configurability Contract

Every rule here is enforced by `npm run conformance`. Rules that cannot be
mechanically checked do not belong in this file — put them in a design review
instead, where a human can apply judgement.

---

## 1. Screens are declared

- Every entity in the OpenAPI schema that a user can create or edit has a **form
  descriptor** in `packages/ui-metadata/src/registry`.
- A descriptor declares: field, type, label, help, validation, conditional
  visibility, required permission, display order, grouping.
- The renderer is generic. `apps/console/app/` contains routing, composition and
  nothing entity-specific.
- **Check:** every schema property has a descriptor entry; every descriptor entry
  has a schema property. Drift in either direction fails.
- **Check:** no file under `apps/console/app/` names an entity field as a string
  literal in a form context.

## 2. Layouts are artefacts

- A screen is a layout manifest: one instance of one of the seven patterns,
  with the pattern's parameters filled and panels placed in the slots the
  pattern declares (ADR-015). A manifest never declares a region of its own,
  and holds no permission or persona — those stay in `apps/console/lib/nav`.
- Manifests live in `packages/ui-metadata/src/layouts/`, beside the descriptors,
  and are versioned in git with a `formatVersion` for the format itself.
- **Check:** a route's `page.tsx` is `<Screen manifest="…" />` and nothing else,
  naming a manifest the registry holds and declared for that route
  (`scripts/conformance.mjs`, `layout-manifests`). A route rendering an
  arrangement of its own fails; so does a path merely written down somewhere.
- **Check:** every manifest names a route that exists, panels that exist and may
  fill the slots they are in, an entity with a descriptor or a pending reason,
  and columns and facets that are that entity's fields
  (`packages/ui-metadata/tests/layouts.test.ts`).

Two exemptions, both narrow and both decided rather than assumed:

- **A dynamic detail route (`[id]`) carries no manifest of its own.** It renders
  inside its parent's list–detail manifest — that pattern is one screen with two
  panes, and §4.1 says selecting a row fills the right pane rather than
  navigating. A detail route with its own manifest would declare a second screen
  where the design has one, and would then have to be kept in step with the
  parent by hand. The parent's manifest is where the detail pane's regions are
  declared. ADR-015 §5.3 narrows this to the `[id]` routes a list–detail
  manifest names as its `detailRoute`; that lands with its third build step, not
  yet, and until then every dynamic route is exempt.
- **Routes outside the app shell are exempt entirely.** Today that is `/login`,
  which renders before there is a session, a persona or a nav — the three things
  a manifest is composed against. A manifest for it would resolve nothing.

## 3. Tokens only

- No hex value, `rgb()`, `px` spacing, font size or duration appears outside the
  token definitions.
- Light/dark, compact/comfortable, and accessibility modes (high contrast, reduced
  motion, dyslexia-friendly type) are orthogonal axes, all four combinations valid.
- **Check:** regex sweep of `apps/` and `packages/ui-kit/` for raw values. Inline
  `style=` attributes fail unless the value derives from a token.

## 4. Every route has all five states

Empty, loading, error, populated, and dense (a realistic worst case — 10,000 rows,
long strings, missing optional fields).

- **Check:** each route has five Storybook or test-rendered states. A route
  handling only the happy path fails.

## 5. Keyboard and accessibility

- Every action reachable by keyboard. Visible focus. No trap.
- WCAG 2.2 AA. Axe run per route, zero critical or serious violations.
- **Check:** `axe-core` per route in CI. Keyboard path asserted in the
  `@screen-only` test for each spine.

## 6. Explanation-first

- Every number displayed in the product links to its trace, its source query, or
  its definition.
- **Check:** any numeric display component not wrapped in an explainable primitive
  fails. This is a component-level check, not a judgement call.

## 7. Mock mode is loud

- A route reading anything other than the generated API client renders
  `<MockModeBanner/>`, unmissable, at the top.
- The banner names what is mocked.
- **Check:** route imports are traced; a route with a non-client data source and no
  banner fails. A banner with no mock source also fails — no vestigial banners.

## 8. Generated client only

- No `fetch`, `axios`, or `XMLHttpRequest` outside `packages/api-client`, which is
  generated from OpenAPI.
- **Check:** grep. Zero exceptions; if the client cannot express something, fix the
  spec.

## 9. Nav is earned

- A capability appears in navigation only when its route passes conformance.
- Nav is generated from the persona manifest plus the passing-route set.
- **Check:** no hand-maintained nav array exists.

## 10. Density and quiet

The design direction is quiet, dense, information-first. Complexity available, not
ambient. Where this competes with a rule above, the rule above wins — but note the
tension in the PR rather than silently degrading the design.

Two things this rules out: decorative motion with no state meaning, and progressive
disclosure so aggressive that an expert user needs four clicks to reach a field
they use daily.
