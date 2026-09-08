# METIS Console — Information Architecture and Design Specification

**Binding.** This file defines what screens exist, how they are grouped, what
patterns they use, and what they look like. It does not describe what is built.
Status lives in `docs/CAPABILITIES.md`.

Read alongside `CLAUDE.md`. Where this file and `CLAUDE.md` disagree, `CLAUDE.md`
wins. The vocabulary in `CLAUDE.md` is binding here — this file uses it throughout
and so must every screen, label, route and component name derived from it.

---

## Part 1 — Why the console currently reads as basic

Three causes, all structural, all fixable by specification rather than by taste.

**Flat navigation.** Nothing declared the group structure, so nav was built as a
list. A list of forty items is not navigable; a list of ninety is hostile. Part 2
fixes this.

**No layout vocabulary.** Every screen was invented independently, so every screen
is a page with a heading and a table. Enterprise products earn their density from a
small set of repeated patterns. Part 4 defines six.

**Empty screens with fabricated data.** "Test Offer 1" against three rows reads as
a prototype no matter how well it is built. Part 6 defines the demo bar.

---

## Part 2 — Navigation

Three levels. Group → section → screen. Groups are always visible; the active
group is expanded and others collapse. Icons appear at group level only — an icon
beside every leaf is noise.

```
METIS
│
├─ Overview                                    [all personas]
│
├─ Catalogue                                   [Marketer]
│   ├─ Objectives
│   ├─ Categories
│   ├─ Offers
│   ├─ Creatives                                content for an offer, per channel
│   ├─ Actions                                  an offer made decidable in context
│   ├─ Content library
│   └─ Schedule                                effective dating across catalogue
│
├─ Policy                                      [Marketer, Decision Architect]
│   ├─ Targeting policies
│   │   ├─ Eligibility
│   │   ├─ Relevance
│   │   └─ Suitability
│   ├─ Frequency policy
│   ├─ Consent & permissions
│   └─ Constraints
│
├─ Decisioning                                 [Decision Architect]
│   ├─ Decision flows
│   │   └─ Flow versions                        version, diff, shadow, release state
│   ├─ Ranking functions
│   ├─ Arbitration & boosts                     levels, ranking formula, boosts
│   ├─ Placements
│   └─ Node library                            from installed packages
│
├─ Intelligence                                [Data Scientist]
│   ├─ Models
│   ├─ Adaptive models
│   ├─ Features
│   │   ├─ Definitions
│   │   └─ Freshness
│   ├─ Drift monitors
│   ├─ Experiments
│   └─ Propensity explorer
│
├─ Journeys                                    [Marketer]
│   ├─ Journeys
│   ├─ Triggers & events
│   └─ Journey performance
│
├─ Channels                                    [Marketer, Operator]
│   ├─ Channel packages
│   ├─ Inbound placements
│   ├─ Outbound schedules
│   ├─ Always-on outbound
│   ├─ Paid audiences
│   ├─ Agent assist
│   ├─ Batch runs
│   └─ Delivery log
│
├─ Simulation                                  [Decision Architect, Compliance]
│   ├─ Simulations                              distribution test
│   ├─ Version comparison
│   ├─ Under-served analysis
│   ├─ Bias check
│   ├─ Counterfactual                          replay over the interaction log
│   └─ Test fixtures
│
├─ Evidence                                    [Compliance Officer]  ← north star
│   ├─ Decisions                                the decision records
│   ├─ Trace reader
│   ├─ Replay
│   ├─ Audit log
│   ├─ Bias evidence
│   ├─ Consent evidence
│   ├─ Model documentation
│   └─ Export
│
├─ Releases                                    [Decision Architect, Compliance]
│   ├─ Change sets
│   ├─ Approvals
│   ├─ Environments
│   ├─ Shadow comparison
│   ├─ Release history
│   └─ Rollback
│
├─ Insights                                    [Executive, Marketer]
│   ├─ Performance
│   ├─ Attribution
│   ├─ Value
│   ├─ Cost
│   └─ Adoption
│
├─ Operations                                  [Operator]
│   ├─ Health
│   ├─ Latency & throughput
│   ├─ Degradation
│   ├─ Incidents
│   ├─ Alerts
│   └─ Capacity
│
└─ Administration                              [Admin]
    ├─ Extensibility
    │   ├─ Packs
    │   ├─ Packages
    │   ├─ Package registry
    │   ├─ Integrations                          the connectors
    │   └─ Inbound traffic
    ├─ Appearance
    │   ├─ Themes
    │   ├─ Layouts
    │   └─ Form descriptors
    ├─ Access
    │   ├─ Personas & workspaces
    │   ├─ Roles & permissions
    │   ├─ Users
    │   └─ Agentic AI                           autonomy ladder and guardrails
    ├─ Data
    │   ├─ Data model
    │   ├─ Intake                               land, map, validate, activate
    │   ├─ Profile store
    │   └─ Consent taxonomy
    └─ Tenancy
        ├─ Tenants
        ├─ Residency
        └─ Settings
```

### Navigation rules

- Nav is generated from the persona manifest joined with the passing-route set. No
  hand-maintained array. A screen that does not pass conformance does not appear.
- Groups a persona has no permission for are hidden entirely, not disabled.
- Indentation: 12px per level, with a 1px guide rule at `--n-200` running the
  height of the expanded group. The rule is what makes depth legible; whitespace
  alone is not enough at this density. Inside the shell frame the rule is
  `--rail-line`, since the frame does not follow the neutral ramp.
- Group labels: sentence case, `--text-label`, `--text-subtle`, not all-caps and
  not tracked out.
- Width 240px comfortable, 200px compact, collapsible to a 48px icon rail.
- The active screen is marked by a 2px left bar in the accent, not a filled
  background block. Filled blocks at this depth create a stripe pattern.
- Breadcrumb in the page header repeats group › section › screen. The nav shows
  where you can go; the breadcrumb shows where you are.

---

## Part 3 — Screen inventory

Every screen below names its layout pattern from Part 4 and its primary persona.
This is the complete surface area. It is a specification, not a queue — screens are
built when a spine in `docs/JOURNEY_SPINES.md` reaches them.

### Overview
| Screen | Pattern | Notes |
|---|---|---|
| Persona home | Dashboard | Layout manifest per persona. Panels only. |

### Catalogue
| Screen | Pattern | Notes |
|---|---|---|
| Objectives | List–detail | Top of taxonomy. Owns categories. |
| Categories | List–detail | Owns offers. |
| Offers | List–detail | Properties, versions, effective dates, creatives beneath. |
| Creatives | List–detail + preview | The content for an offer on a channel. Channel-shaped preview from the channel package. |
| Actions | List–detail | An offer instance made decidable in a context. Today an offer carries the `key` used as the action; splitting them is a modelling change, not a rename. |
| Content library | Workbench | Assets, versions, approval state, expiry, usage. |
| Schedule | Calendar | Effective dating across every catalogue entity, one view. |

### Policy
| Screen | Pattern | Notes |
|---|---|---|
| Eligibility | List–detail + rule editor | Hard rules. Reason code per rule, shown in trace. |
| Relevance | List–detail + rule editor | Contextual. Distinct reason codes. |
| Suitability | List–detail + rule editor | Customer-interest test. Own audit line. |
| Frequency policy | List–detail | Frequency and suppression: volume, recency, outcome-conditioned. Per channel, period, category. |
| Consent & permissions | Workbench | Consent taxonomy state, fails closed, evidence link. |
| Constraints | List–detail | Diversity, exclusivity, slot constraints. |

### Decisioning
| Screen | Pattern | Notes |
|---|---|---|
| Decision flows | Canvas + inspector | The graph. Live volume overlay. Click node → who took this path. |
| Flow versions | List–detail | Version, diff, shadow, release state. |
| Ranking functions | List–detail + formula editor | Named and versioned. Simulate before save. |
| Arbitration & boosts | List–detail + live preview | Arbitration levels — within category, then across — the per-level ranking function, and business boosts. A boost adjusts ranking; the preview shows simulated movement before save. |
| Placements | List–detail | Named, slot count, per-placement policy. |
| Node library | Gallery | Node types from installed packages, with contracts. |

### Intelligence
| Screen | Pattern | Notes |
|---|---|---|
| Models | List–detail | Registry, lineage, version pinning, ONNX/PMML import. |
| Adaptive models | List–detail + charts | Predictor bins, importance, cold start, learning curve. |
| Feature definitions | Workbench | One definition compiles to online and offline. |
| Feature freshness | Workbench | Per-field staleness, source system, computed-at. |
| Drift monitors | Dashboard | Input and output drift, quarantine state. |
| Experiments | List–detail | Traffic split, significance, promotion. |
| Propensity explorer | Workbench | Distribution by segment. Reads from profile store. |

### Journeys
| Screen | Pattern | Notes |
|---|---|---|
| Journeys | Canvas + inspector | Same canvas as decision flows, different node set. |
| Triggers & events | List–detail | Windowed patterns. |
| Journey performance | Dashboard | Volume by stage, drop-off, goal attainment. |

### Channels
| Screen | Pattern | Notes |
|---|---|---|
| Channel packages | Gallery | Installed channels, creative schema, render contract. |
| Inbound placements | List–detail | Real-time containers, slots, capture. |
| Outbound schedules | List–detail | Segment, volume, throttle, quiet hours, retry. |
| Always-on outbound | List–detail | Continuous evaluation with volume governance. |
| Paid audiences | List–detail | Export with consent filter and suppression applied. |
| Agent assist | Preview + config | The embedded surface, previewed in situ. |
| Batch runs | Workbench | Run history, size, duration, output. |
| Delivery log | Workbench | Per-message, links to its decision record. |

### Simulation
| Screen | Pattern | Notes |
|---|---|---|
| Simulations | Split result | The distribution test: candidate artifact over sampled audience. Who gets what. |
| Version comparison | Split result | Two versions, one population. Winners, losers, unchanged. |
| Under-served analysis | Workbench | No eligible offer, or uniformly low propensity. |
| Bias check | Split result | Protected-attribute parity. Pre-release gate. Result recorded. |
| Counterfactual | Split result | Replay the interaction log through a candidate artifact. |
| Test fixtures | Workbench | Deterministic fixtures, CI-run, pass state visible. |

### Evidence — the hero group
| Screen | Pattern | Notes |
|---|---|---|
| Decisions | Workbench | The decision records. Faceted search: customer, offer, rule, outcome, date, flow version. |
| Trace reader | Evidence reader | **The single most important screen in the product.** See Part 4.3. |
| Replay | Evidence reader | Re-execute. Show identical / divergent, byte level. |
| Audit log | Workbench | Every change set, chained, tamper-evident. |
| Bias evidence | Workbench | Historical bias check results, per release. |
| Consent evidence | Workbench | Consent state at decision time, per record. |
| Model documentation | Reader | Generated from the registry. |
| Export | Wizard | Evidence bundle for a regulator. Signed. |

### Releases
| Screen | Pattern | Notes |
|---|---|---|
| Change sets | List–detail + diff | Human-grade diff. Simulated impact, bias result, cost delta, reasoning. |
| Approvals | Workbench | Queue, quorum, four-eyes, tier. |
| Environments | Dashboard | Dev, UAT, prod. What version is where. |
| Shadow comparison | Split result | Flow version shadow. Disagreement rate, which performed better. |
| Release history | Workbench | Every release, its artifact, its author, its approver. |
| Rollback | Confirm | One action, instant, always available. |

### Insights
| Screen | Pattern | Notes |
|---|---|---|
| Performance | Dashboard | Acceptance, conversion, by offer and segment. |
| Attribution | Dashboard | Contribution by touchpoint. |
| Value | Dashboard | ARPU, CLV movement, incremental value. |
| Cost | Dashboard | Cost per thousand decisions, broken to component. |
| Adoption | Dashboard | Usage by persona. Which screens are used. |

### Operations
| Screen | Pattern | Notes |
|---|---|---|
| Health | Dashboard | Service state, dependency state. |
| Latency & throughput | Dashboard | p50/p95/p99 by tenant and placement. |
| Degradation | Dashboard | Which rung of the ladder is active, and why. |
| Incidents | Workbench | Open, history, post-mortem link. |
| Alerts | List–detail | Rules, routing, silence. |
| Capacity | Dashboard | Headroom, projection. |

### Administration
| Screen | Pattern | Notes |
|---|---|---|
| Packs | Gallery + detail | Install, upgrade, rollback, change report. |
| Packages | Gallery + detail | Nodes, channels, model providers, panels, themes, agents. |
| Package registry | Gallery | Available, versions, signatures. |
| Integrations | List–detail | The connectors: ingress, egress, credentials, health. |
| Inbound traffic | Workbench | Calls arriving through the integrations, per source, with timings. |
| Themes | Gallery + live preview | Token sets. Preview applies to the live console. |
| Layouts | Canvas-lite | Regions, slots, occupancy. Versioned and diffable. |
| **Form descriptors** | List–detail | **Add a field to an entity here. No code change.** |
| Personas & workspaces | List–detail | Which groups, which layouts. |
| Roles & permissions | Workbench | Per-objective and per-category scoping. |
| Users | Workbench | |
| Agentic AI | List–detail | The autonomy ladder, L0–L4: per-scope guardrails for what an agent may change without a person, the resolved level per offer, and the agent activity log. |
| Data model | Workbench | Pack-supplied, versioned, migrations generated. |
| Intake | Workbench | Land records as they arrive, map them onto the data model, validate, then activate. |
| Profile store | Workbench | Fields, TTL, source, freshness. |
| Consent taxonomy | List–detail | Pack-supplied. |
| Tenants | List–detail | |
| Residency | List–detail | Tenant-pinned region. |
| Settings | Form | Generated from descriptors like everything else. |

---

## Part 4 — Layout patterns

Six patterns. Every screen uses one. A screen that needs a seventh is a design
review, not an invention.

### 4.1 List–detail (split canvas)

The default for anything with instances. **No page navigation between list and
detail** — selecting a row fills the right pane. This is the single biggest
contributor to feeling like a product rather than a website.

```
┌────────┬──────────────────────┬────────────────────────────────────┐
│        │ ⌕ filter    [+ New]  │  Offer name              [Publish] │
│  nav   │ ──────────────────── │  ───────────────────────────────── │
│        │ ▸ Broadband upgrade  │  Overview │ Creatives │ Policy │ … │
│        │ ▸ Handset upgrade  ● │                                    │
│        │ ▸ Retention save     │  [ tabbed detail content ]         │
│        │ ▸ Loyalty tier       │                                    │
│        │                      │  ───────────────────────────────── │
│        │ 247 offers           │  v4 · live · edited 2h ago · Nadia │
└────────┴──────────────────────┴────────────────────────────────────┘
```

- List pane 320px, resizable, remembers width.
- Faceted filters above the list, with counts. Saved views.
- Detail uses tabs, not accordions. Tab state is in the URL.
- Footer strip in the detail pane always shows version, state, last edit, author.
- Primary action top right, named by its effect.
- Keyboard: `j`/`k` or arrows move the selection, `/` focuses filter, `Enter`
  enters the detail, `Esc` returns focus to the list.

### 4.2 Canvas + inspector

Decision flows and journeys. React Flow centre, node palette left (collapsible),
inspector right (contextual to selection).

- Live volume overlay on edges, from the last 24 hours, toggleable.
- Click a node → inspector shows configuration; a second tab shows which customers
  took that path.
- Minimap bottom right. Zoom controls bottom left. Neither floats over content.
- Zustand for canvas-local state only. Selection and viewport in the URL so a
  canvas position is linkable.
- Undo/redo, keyboard-first, multiplayer presence indicators.

### 4.3 Evidence reader — the hero pattern

The trace is the north star. This screen is where the product wins or loses a
compliance review, and it should be the most designed thing you own.

```
┌──────────────────────────────────────────────────────────────────┐
│  Decision  dr_8f2a91…      2026-09-04 14:22:07.412  ·  38.2 ms   │
│  Customer  cus_4471 (pseudonymised)   Flow v12   Packages 7      │
│                                            [Replay]  [Export]    │
├────────────────────────┬─────────────────────────────────────────┤
│                        │                                         │
│  CANDIDATES      142   │   Source                                │
│  ├ eligibility   −88   │   ───────────────────────────────────   │
│  │   ▸ no_consent  41  │   Rule  el_consent_marketing  v3        │
│  │   ▸ not_in_seg  31  │   Package  metis.pack.reg.uk-gdpr@1.4   │
│  │   ▸ age_gate    16  │                                         │
│  ├ relevance     −29   │   Evaluated against                     │
│  ├ suitability    −7   │   consent.marketing = false             │
│  ├ frequency     −12   │   source  crm · computed 14:19:55       │
│  │                     │                                         │
│  RANKED            6   │   Reason shown to customer              │
│  ├ 1 Handset  0.842 ●  │   "You have opted out of marketing      │
│  ├ 2 Broadband 0.771   │    contact."                            │
│  ├ 3 Loyalty   0.640   │                                         │
│                        │   41 offers removed here.  [Show all]   │
│  chain 9c4e…  prev 2b… │                                         │
└────────────────────────┴─────────────────────────────────────────┘
```

- A funnel, not a log. The count falling from 142 to 6 is the story.
- Every stage expands to its reason codes with counts. Every reason code expands
  to the offers it removed.
- Selecting anything on the left fills the source pane on the right: which rule,
  which package version, which field value, which source system, what time it was
  computed.
- Colour carries meaning here and only here. See Part 5.
- `Replay` runs and reports identical or divergent, at byte level, with the diff
  if divergent.
- Every number on this screen is a link. That is the product's whole thesis
  rendered as a screen.

### 4.4 Workbench

Dense data grid with faceted filters, saved views, column configuration, bulk
select. For audit log, decision records, delivery log, users, features.

- 28px rows compact, 32px comfortable. Never taller.
- Sticky header, sticky first column, virtualised body.
- Numeric columns right-aligned, tabular figures, mono face.
- Facets in a left rail with counts. Filter state in the URL.
- Column config persists per user per screen.

### 4.5 Dashboard

Layout manifest driven. Panels occupy slots. Admin reorders and saves as a
version. Recharts only.

- 12-column grid, panels span 3/4/6/12.
- Every panel has a title, a time range, and a link to the screen that owns its
  data. No orphan numbers.
- Panel loading state is a skeleton at the panel's real dimensions, never a
  spinner that collapses the layout.

### 4.6 Split result

Simulation and comparison output. Left pane the setup, right pane the result, with
a persistent summary bar across the top holding the three numbers that matter.

- Result is always segmented — a single aggregate number is not an answer.
- Winners, losers and unchanged as three tabs with counts in the tab label.
- Export the result set. Every simulation result is itself versioned and addressable
  by ID.

---

## Part 5 — Visual specification

The product is read by a compliance officer who must trust it, an architect who
must extend it, and a marketer who lives in it eight hours a day. Quiet, dense,
information-first. Complexity available, not ambient.

### Palette

Cool neutrals, not tinted black and not warm cream. The ground recedes so data
carries.

**The token layer already exists.** `apps/console/app/globals.css` holds 143
tokens: a `--n-50`…`--n-900` neutral ramp, semantic surfaces aliased onto it, and
a state family. Colours are stored as **bare RGB channels**, not hex, so Tailwind
can compose them with opacity — `rgb(var(--surface) / <alpha-value>)` is what
makes `bg-surface/50` work. This section names those tokens. It does not
introduce a parallel scheme, and a screen must never reach past them.

| Role | Token | Value (light) | Value (dark) |
|---|---|---|---|
| Page ground | `--page` | `var(--n-100)` · 244 247 249 | `var(--n-100)` · 19 27 34 |
| Panes, cards | `--surface` | 255 255 255 | `var(--n-150)` · 24 34 43 |
| List rails, table headers | `--surface-sunken` | `var(--n-150)` · 237 241 244 | `var(--n-200)` · 34 48 58 |
| Table rules, pane edges | `--border` | `var(--n-300)` · 203 213 220 | `var(--n-300)` · 51 69 79 |
| Control boundaries (SC 1.4.11, 3:1) | `--border-strong` | `var(--n-400)` · 126 141 153 | `var(--n-400)` · 92 114 128 |
| Nav guide rules | `--n-200` | 227 233 237 | 34 48 58 |
| Body text | `--text` | `var(--n-900)` · 22 34 44 | `var(--n-900)` · 231 238 243 |
| Secondary text | `--text-muted` | `var(--n-700)` · 62 80 94 | `var(--n-700)` · 186 202 213 |
| Tertiary text, table meta | `--text-subtle` | `var(--n-600)` · 94 111 124 | `var(--n-600)` · 143 162 175 |
| Selection, focus, primary action | `--accent` | 37 99 199 | 99 168 232 |

The text ramp has three steps, not two. Anything at label size sits on
`--surface-sunken` often enough that both `--text-muted` and `--text-subtle` are
measured against it; `--text-subtle` is the floor at 4.58:1 and nothing quieter
exists on purpose.

Dark mode inverts the ground/surface relationship; it does not merely darken.
Surfaces get *lighter* than ground, as they do in light mode. The dark theme
carries three depths — chrome below page below surface — because two put the page
and the card within one step of each other and the console read as flat.

The shell frame is its own family (`--rail-*`, `--chrome`, `--header-*`) and does
not follow the ramp: the frame is dark in both themes, so a token measured against
a light panel does not hold on it. Focus rings inside the frame take
`--on-header` / `--rail-fg` rather than `--accent` for exactly this reason.

### Decision semantics — the only place colour is loud

These five appear in the trace reader, the simulation results and nowhere else.
Spending the palette's boldness on decision outcomes is the whole point.

Nothing in the existing 143 tokens covers this domain, so these are new. They take
values that are already measured elsewhere in the file, which is the established
pattern here — `--l3` and `--hold` are the same amber, `--l1` and `--info` the same
cyan — because a semantic separation is a naming problem, not a reason to invent an
unmeasured colour.

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--eligible` | 23 124 85 | 63 191 140 | passed |
| `--filtered` | 140 90 0 | 240 168 92 | removed by relevance or suitability |
| `--suppressed` | 195 58 46 | 240 115 106 | removed by frequency, consent or constraint |
| `--ranked` | 14 110 122 | 79 201 216 | entered ranking |
| `--winner` | 22 34 44 | 231 238 243 | the decision, marked by weight not hue |

Each pairs with an explicit tint rather than an alpha of itself, so the pair can be
measured:

| Token | Light | Dark |
|---|---|---|
| `--eligible-subtle` | 232 245 237 | 12 46 33 |
| `--filtered-subtle` | 253 243 224 | 58 40 10 |
| `--suppressed-subtle` | 251 237 236 | 62 22 22 |
| `--ranked-subtle` | 226 242 244 | 14 46 51 |
| `--winner-subtle` | 237 241 244 | 34 48 58 |

**`--ranked` is deliberately not the accent.** The accent means "you can interact
with this", and a funnel stage rendered in it reads as clickable. The same argument
already removed `#2563C7` from the autonomy ladder. Cyan is the file's established
"informational, not interactive" cool colour, so `--ranked` takes it.

**`--winner` is `--text`.** The winning row is marked by weight, position and a
glyph — not by hue. A sixth colour here would compete with the four that carry the
funnel.

Never carried by colour alone: each pairs with a glyph and a label. Every value
above clears 4.5:1 against `--surface`, `--page` and `--surface-sunken` in both
themes, and against its own tint. `scripts/check-contrast.mjs` is where that is
asserted; a pair added here without a row there is not added.

### Type

Two families, held in `--font-sans` and `--font-mono`.

- `--font-sans` — all interface text. Currently **Inter Tight**, self-hosted by
  `next/font` so no request leaves the machine, chosen for "one family, tight
  vertical rhythm, no personality budget spent on the interface".
- `--font-mono` — identifiers, chain hashes, scores, timestamps, durations, field
  values in the source pane. Functional, not decorative: hashes must be comparable
  character by character. Currently a system stack, `ui-monospace` first.

**Sizes are density-scoped, not fixed.** Two size tokens exist, and both change
with `[data-density]` — a fixed five-step scale would contradict the density axis
this product has. Two roles have no token yet; the names below follow the existing
`--text-*` family rather than starting a `--font-size-*` one.

| Role | Token | Comfortable | Compact | Status |
|---|---|---|---|---|
| Group labels, table meta | `--text-label` | 0.75rem / 12px | 0.6875rem / 11px | exists |
| Body, table cells, form fields, detail prose | `--text-body` | 0.875rem / 14px | 0.8125rem / 13px | exists |
| Screen title | `--text-title` | 1.125rem / 18px | 1rem / 16px | **proposed** |
| The one number on a panel | `--text-figure` | 1.5rem / 24px | 1.25rem / 20px | **proposed** |

Line height is `1.5` from `body` and is not tokenised per step.

Weights 400, 500, 600. Nothing heavier. No all-caps labels. No tracked-out
eyebrows above headings. Sentence case throughout.

### Density

Two axes crossed with light/dark, four combinations, all valid, all storied.
Density changes spacing and type size; it never changes colour.

| Token | Comfortable | Compact |
|---|---|---|
| `--row-h` | 2.75rem / 44px | 2.125rem / 34px |
| `--cell-y` | 0.625rem / 10px | 0.3125rem / 5px |
| `--cell-x` | 0.875rem / 14px | 0.625rem / 10px |
| `--card-p` | 1.25rem / 20px | 0.875rem / 14px |
| `--stack` | 1.25rem / 20px | 0.75rem / 12px |

Shape and elevation are `--radius-sm` / `--radius` / `--radius-lg` and
`--shadow-sm` / `--shadow` / `--shadow-lg`. On the dark canvas the shadows become
a ring of light rather than a drop shadow; that is already in the token, so a
screen never branches on theme to get depth right.

### Motion

Motion answers an action and shows what changed. Panel opens, row expands, value
updates. Nothing fades in on load. Nothing animates on hover beyond a 100ms
background change. `prefers-reduced-motion` removes all of it.

### Forbidden

These are the tells that make a build read as generated. None of them appear.

- Identical rounded cards with the same soft grey shadow under each.
- Gradient washes as decoration.
- All-caps tracked eyebrow labels.
- Meta strings joined with middle dots.
- `→` appended to link and button text.
- Emoji in the interface.
- A spinner where a skeleton belongs.
- "Submit" on any button. Buttons name their effect.

---

## Part 6 — Demo readiness

A screen is not demo-fit because it is built. Most of what reads as "basic" is
emptiness and fabricated content, not craft.

### The seeded tenant

One tenant, `demo-telco-uk`, seeded and reproducible from a fixed seed. Every
screen in Part 3 that is built must be populated from it.

- **Names are real-shaped.** "Unlimited 5G upgrade — existing handset", not
  "Test Offer 1". Authors are named people. Dates are recent and irregular.
- **Volumes create texture.** 240+ offers so the list scrolls and facets have
  counts. 10k+ decision records so search is meaningful. Enough history that charts
  have shape rather than three points.
- **Realistic distribution.** Pareto value concentration, seasonality, a churn
  cohort. A flat uniform dataset makes every chart look fake.
- **Some things are wrong on purpose.** One drifting model. One offer with a bias
  warning. One incident last Tuesday. A demo where nothing is ever wrong
  demonstrates nothing about how the product handles being wrong.

### The eight-minute path

Written down, tested, and kept passing as a `@screen-only` test. If it breaks, the
demo is broken and you find out in CI rather than in the room.

1. Overview as Compliance Officer. One number is unexpected. Click it.
2. It lands in decision records, filtered. Open one.
3. The trace reader. 142 candidates to 6. Expand `no_consent`. Show the rule, its
   package version, the field value and where it came from.
4. `Replay`. Identical, byte level. This is the moment the room goes quiet.
5. Switch persona to Decision Architect. Open the decision flow. Live volume on
   the edges.
6. Change a business boost. Simulated movement previews before saving.
7. Version comparison against live. Winners, losers, bias check green.
8. Raise a change set. Show the diff, the simulated impact, the cost delta.
   Approve as a second user. Release. Then roll back in one action.

### The bar per screen

Before a screen is demo-fit: populated from the seeded tenant; all five states
built (empty, loading, error, permission-denied, populated) plus the dense case;
keyboard path verified end to end; axe clean at WCAG 2.2 AA; storied across all
four theme axes; every displayed number linking to its source or explaining why it
cannot.

---

## Part 7 — How to work through this

Do not build Part 3 in order. It is a map, not a queue.

Pull from `docs/JOURNEY_SPINES.md`. A spine crosses this map diagonally, touching
eight or ten screens, and each is built to the depth the spine needs. That is what
keeps the product coherent instead of ninety screens each 40% done.

Two structural jobs come before any screen, because retrofitting either is
expensive and gets worse weekly:

1. **Form descriptors.** Until the metadata registry exists, every form is
   hand-built and the Administration → Appearance → Form descriptors screen is a
   lie. Build the registry and the generic renderer first, then every subsequent
   screen is nearly free.

2. **Nav generation.** Build the persona manifest and generate nav from it joined
   with the passing-route set. Doing this second means hand-maintaining an array
   that grows to ninety entries and drifts from reality within a week.
