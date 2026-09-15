# Design references — drafts, not specifications

**The HTML files in this directory are drafts, drawn before the engine was
read.** Every behaviour in them is a proposal, not a description of the
platform. Where a draft and the code disagree, the code is authoritative.

They are kept out of version control on purpose. Four of them —
`metis-cascade-real-nav.html`, `metis-cascade-screens.html`,
`metis-overview-hero.html` and `metis-trace-directions.html` — were committed
before this note was written. Being in git does not make them any more
authoritative than the two that are not.

## Behaviours in them the engine does not have

This list is what has been found so far, not what exists. Each has been built
from once and turned out not to be true; assume there are more.

1. **The tie warning** (`metis-three-visualisations.html`, Arbitration live).
   The engine breaks equal priorities by offer key and raises no warning.
   Recorded in G-125.
2. **The context slider** (same draft). It is dead: in `telco-us` context and
   propensity are the same for every offer, so the weight moves nothing.
   Recorded in G-124 and G-125.
3. **The weight range** (same draft). The 0–2 range is a console convention,
   not an engine rule, and a tenant on the expected-value ranking function has
   no weights at all. Recorded in G-125.
4. **The trace rail's stage labels** (`metis-trace-directions.html`, Cascade).
   The draft stages the rail by policy tier and fills it with reason codes the
   engine does not have (`NO_CONSENT`, `NOT_IN_SEGMENT`, `AGE_RESTRICTED`,
   `ALREADY_HELD`, `RECENT_DECLINE`, `AFFORDABILITY`) and a quote of customer
   refusal text that does not exist. A trace's stages are the nodes the flow
   ran; the built rail is right. Recorded in G-128 and G-057.

## Using them

Take layout, weight and density from them. Take no number, stage, reason code
or sentence from them: those come from the engine, the decision record and
`docs/METIS_CONSOLE_SPEC.md`. When you find another behaviour here the code
does not have, add it to the list above and register it in `docs/gaps.md`.
