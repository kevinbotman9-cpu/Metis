# The storefront demo

A partner website that gets its offers from METIS. Built for showing the
platform to a customer who wants to see decisions arriving in their own site
rather than in the console.

```bash
npm run dev -w @metis/console
```

Then open **http://localhost:3000/storefront/index.html**.

The console starts with no decision history, so the first decisions anywhere in
it are the ones this page makes. Expect every slot to render and the loop to
show nothing acted on until someone presses a call to action — that is the loop
working, not broken (G-143). For the generated history behind the page, start the
console with `npm run dev:seeded -w @metis/console` instead.

The whole thing is one file — `apps/console/public/storefront/index.html` — and
it is deliberately not part of the console. It uses none of the token layer and
none of the console's components, because it is standing in for somebody else's
site.

---

## What it actually does

The page asks for slots by name, and nothing else:

1. `POST /api/placements/{tenantId}/{key}/decisions` — what fills this slot, for
   this visitor, now. Which flow answers is configuration held by the platform,
   not by the website.
2. `GET /api/offers/{tenantId}/{offerId}` — the creative to render each with.

Nothing about an offer is written into the page: if the platform has no creative
for the channel, the slot says so rather than inventing copy.

Four placements, configured in the catalogue rather than in this file:

| Placement | Slots | Flow | Why |
|---|---|---|---|
| `homepage_hero` | 1 | `next-best-action` | The hero slot |
| `homepage_grid` | 3 | `next-best-action` | The slot that needs a slate — the three scenarios are read here |
| `account_dashboard_hero` | 1 | `next-best-action` | The customer is known |
| `usage_page_inline` | 1 | `next-best-action` | A cross-sell slot |

**The grid is the one to point at.** It asks for three and gets up to three,
ranked, from a *single* decision — every candidate that reached ranking is
already in that decision with its priority, so the slate is a projection of it
rather than three decisions that might disagree. The panel shows the one
decision id behind every card. Ordering by priority is the whole composition
rule; diversity and mutual exclusion are W-028.

---

## The three scenarios, and what each one shows

Open the panel (**Decided by METIS**, top right) to switch between them. Every
figure in the panel comes from the decision the platform returned — which was
untrue from 2026-09-07 to 2026-09-12, when the panel rendered an empty div
([G-087](gaps.md)).

They are the customer brief's own three, and **one customer** in all three: the
scenarios are meant to differ by her address and what she holds, nothing else.

| Preset | What to point at |
|---|---|
| **Eva — fibre available** | All five offers qualify. FIOS leads, 5G Home second, Gaming Plus third — the brief's own order, and every position carries a distinct priority because two declared boosts break what would otherwise be a three-way tie at business value 100 |
| **Eva — moved, no fibre** | The same customer, one field different. `fios_gigabit — ELIGIBILITY_FAILED · pol_fios_serviceable`, and 5G Home takes the top slot. The refused field arrives from `conn_serviceability`, so the trace names the system that supplied the evidence |
| **Eva — after accepting 5G Home** | Both broadband offers are gone and the cross-sell opens: Gaming Plus, Disney+, Netflix. The suppression comes from **what she now holds**, not from the interaction log — the platform records no acceptance of its own, and the panel names `pol_not_on_5g_home` doing it |

`brief-scenarios.spec.ts` asserts all three rankings, both refusals, and that
the first two slates differ — the contrast the demo rests on was showing the
same refusal twice until 2026-09-12 ([G-094](gaps.md)).

The consent switches and the contact-history counters re-decide every placement
on the page, so suppression by consent or by a frequency cap is one click away.
**Not interested** on any offer starts its 30-day rest period, which is the
brief's reject rule and became real on 2026-09-11 ([G-086](gaps.md)).
**Show placements** outlines the decisioned slots and reveals the asset path
each creative names.

---

## What is real here, and what is not

**Real.** The decisions, the eliminations with their reason codes, the scores and
the ranking formula, the chain hash, the connector provenance, and the catalogue
and creatives. Integration resolution runs on this path: fields the site does not
send are fetched before the engine runs and recorded as coming from a named
connector.

**Not built, and not faked.** There is no embed SDK (W-016), so the page calls
the API directly and reports its own outcomes: an impression when a slot renders
an offer, a click when a call to action is pressed, each to `POST /outcomes`
against the decision's id. That id is all it sends, so a click on the second or
third card of the grid is credited to the first card's offer
([ADR-020](adr/ADR-020-a-slate-is-recorded-as-shown.md) §4). *(Until 2026-09-17
this paragraph said the page recorded nothing when a slot rendered; it has
reported impressions since 2026-09-09.)* A slot the platform cannot fill is
left empty and counted, never padded. There is no content store
(W-015), so `imageUrl` names an asset nothing serves and the slot shows a
placeholder.

**A decision made here cannot be replayed, and never could.** The record keeps a
hash of the inputs, never the values (ADR-004), and fields this page does not
send are resolved from connectors whose values are kept nowhere — so neither the
platform nor the page holds what was hashed. The path from this page ends at the
trace, which says "Cannot be re-executed here" ([G-009](gaps.md)). The decisions
the console can replay are the seeded ones, whose inputs the generator holds.

**The catalogue is the demo tenant's.** `telco-us` — the five offers the customer's brief names. No prices: the brief supplies none and none was invented ([G-089](gaps.md)). The
storefront renders whatever the catalogue says, so a demo for a different market
means a different tenant's catalogue, which regenerates the conformance corpora
and is a deliberate change rather than a switch to flip.

---

## Re-branding it

Four custom properties at the top of the file — `--brand-ink`, `--brand-accent`,
`--brand-accent-ink`, `--brand-font` — and the wordmark in the header. Nothing
else in the page assumes a brand. Meridian Mobile is fictional; do not ship a
customer's own marks in this file without their say-so.
