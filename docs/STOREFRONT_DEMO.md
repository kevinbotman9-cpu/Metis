# The storefront demo

A partner website that gets its offers from METIS. Built for showing the
platform to a customer who wants to see decisions arriving in their own site
rather than in the console.

```bash
npm run dev -w @metis/console
```

Then open **http://localhost:3000/storefront/index.html**.

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
| `homepage_hero` | 1 | `inbound-web-offers` | Anonymous acquisition |
| `homepage_grid` | 3 | `next-best-action` | The slot that needs a slate |
| `account_dashboard_hero` | 1 | `next-best-action` | The customer is known |
| `usage_page_inline` | 1 | `inbound-web-offers` | A cross-sell slot |

**The grid is the one to point at.** It asks for three and gets up to three,
ranked, from a *single* decision — every candidate that reached ranking is
already in that decision with its priority, so the slate is a projection of it
rather than three decisions that might disagree. The panel shows the one
decision id behind every card. Ordering by priority is the whole composition
rule; diversity and mutual exclusion are W-028.

---

## The five visitors, and what each one shows

Open the panel (**Decided by METIS**, top right) to switch between them. Every
figure in the panel comes from the decision the platform returned.

| Preset | What to point at |
|---|---|
| **Anonymous — fibre at the address** | Full Fibre wins the hero. The trace shows the two consent fields arriving from `conn_consent_registry`, which is the platform fetching what the site did not send |
| **Anonymous — no fibre** | The same visitor, one field different. `acq_fibre_900 — ELIGIBILITY_FAILED · pol_fibre_available`, and SIM Only takes the slot. This is the cheapest way to show the cascade doing real work |
| **Signed in — near the data cap** | The data boost passes the relevance gate that refuses it for lighter users, and still loses the ranking to the 5G upgrade. Both scores are in the panel, so "why not the other one" is answerable |
| **Signed in — contract ends in 40 days** | The 5G upsell is suppressed as irrelevant (they already hold it), retention wins — **and has no web creative**, so the slot says that instead of rendering something. An honest content gap, W-015 |
| **Signed in — high bill-to-income** | Every growth offer fails suitability. The slot falls back to the site's own content and the panel names the policy. This is the compliance story: a refusal that is legible after the fact |

The consent switches and the contact-history counters re-decide every placement
on the page, so suppression by consent or by frequency cap is one click away.
**Show placements** outlines the decisioned slots and reveals the asset path each
creative names.

---

## What is real here, and what is not

**Real.** The decisions, the eliminations with their reason codes, the scores and
the ranking formula, the chain hash, the connector provenance, and the catalogue
and creatives. Integration resolution runs on this path: fields the site does not
send are fetched before the engine runs and recorded as coming from a named
connector.

**Not built, and not faked.** There is no embed SDK and no impression capture
(W-016), so the page calls the API directly and records nothing when a slot
renders — a real integration would do both. A slot the platform cannot fill is
left empty and counted, never padded. There is no content store
(W-015), so `imageUrl` names an asset nothing serves and the slot shows a
placeholder. A decision made here can be traced through the API but not replayed;
see `gaps.md`.

**The catalogue is the demo tenant's.** `telco-uk` — UK products, sterling. The
storefront renders whatever the catalogue says, so a demo for a different market
means a different tenant's catalogue, which regenerates the conformance corpora
and is a deliberate change rather than a switch to flip.

---

## Re-branding it

Four custom properties at the top of the file — `--brand-ink`, `--brand-accent`,
`--brand-accent-ink`, `--brand-font` — and the wordmark in the header. Nothing
else in the page assumes a brand. Meridian Mobile is fictional; do not ship a
customer's own marks in this file without their say-so.
