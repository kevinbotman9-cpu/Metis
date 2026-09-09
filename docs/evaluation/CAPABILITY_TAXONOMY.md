# Capability taxonomy — decisioning and marketing platforms

**Phase E2 of `docs/EVALUATION_BRIEF.md`. Compiled 2026-09-09.**

A vendor-neutral list of what a serious decisioning and marketing platform is
expected to do, mined from the public product documentation of the products
named in the brief. It exists so that E3 has something to score against that was
not written by the people who built the thing being scored.

**Nothing here is a claim about METIS.** No item names a file, a route or a test
in this repository, and none is marked built, absent or planned. Joining this
list to the capability map is E3, and it is a separate session. If you are
reading this looking for a score, you are in the wrong document.

---

## How to read a line item

Each item is a capability someone can exercise, written with a subject and a
verb, at a grain where the answer is yes or no. `4.3` is a requirement you can
put in front of a product and get a demonstration or a refusal:

> **4.3** — A business user can create a new version of an existing offer, alter
> one attribute, and have both versions live with independent effective dates.

`Offer versioning` is not a requirement. It is a category heading that every
product on the list will claim, and the claims will mean five different things.

The subject matters as much as the verb. "A business user can" and "a developer
can" are different requirements with the same verb, and the difference between
them is most of what separates these products from each other.

### Classification

- `TABLE-STAKES` — three or more of the source products have it, and buyers ask
  about it without being prompted. Absence is an evaluation loss, not a gap.
- `DIFFERENTIATING` — one or two have it. Presence wins deals; absence is
  survivable and usually costs a discount.
- `FRONTIER` — nobody does it well. Several products claim it. What they ship is
  a partial answer, a report you have to assemble yourself, or a services
  engagement. These are the openings.

`FRONTIER` is not a synonym for hard, and it is not a wish list. Every item so
marked was reached by finding the claim in a product's own documentation and
then finding the boundary of it — the export you have to do yourself, the
adjacent product you have to buy, the reconciliation nobody automates.

### Vocabulary

Written in the normative vocabulary of `CLAUDE.md` §Vocabulary throughout, which
means some items do not use the words their source product uses. Pega's
three-tier qualification model is here as **eligibility / relevance /
suitability**; its ranking multipliers are **business boosts**; the DAG of
operators it names after strategy is a **decision flow**. Adobe's offer
decisions and selection
strategies are **decision flows** producing **decision records**. Braze's
Canvas is a **journey**; its content blocks are reusable **creative** fragments.
An **artifact** is a compiled decision flow. A **shadow** decides nothing.

This is a translation, not a simplification, and it is the point of a
vendor-neutral taxonomy: three products that each invented a word for the same
thing produce one line item, and a product that has genuinely split a concept
the others merged produces two.

---

## Sources mined

Public product documentation, learning portals and product tours only, per the
brief. Nothing gated was accessed, and no claim below rests on an analyst
report, a review site or a competitor's comparison page.

**Decisioning** — Pega Customer Decision Hub (docs.pega.com, academy.pega.com):
Customer Profile Designer, Adaptive Decision Manager, Impact Analyzer, Value
Finder, Scenario Planner, audience simulation, ethical bias testing, revision
management, 1:1 Operations Manager. Adobe Journey Optimizer (Experience League):
Decisioning, selection strategies, ranking formulas, decision rules, capping,
content management, fragments, AI Assistant. Salesforce Marketing Cloud
Personalization. SAS Customer Intelligence 360, HCL Unica, Zeta, Redpoint at
product-overview depth only — their detailed documentation is largely gated, and
items resting on them alone are marked as such nowhere, because there are none.

**Rules and decision engines** — Camunda DMN (decision tables, hit policies,
FEEL, versioned deployment), Taktile, Provenir, FICO's published responsible-AI
governance position.

**Campaign and journey orchestration** — Braze (Canvas components, experiment
paths, Content Blocks, Connected Content, Global Control Groups, Currents),
Iterable (Frequency Management, Frequency Optimization, Quiet Hours, Send Time
Optimization), Airship, MoEngage, CleverTap, Insider, Bloomreach, Klaviyo.

**Experimentation** — Statsig (sequential testing, CUPED, holdouts, guardrail
metrics, switchback tests), Optimizely (Stats Engine, sequential testing,
Benjamini-Hochberg false discovery rate control), Dynamic Yield (affinity
allocation, AffinityML), Monetate, Ninetailed.

**Data and identity adjacency** — Segment Protocols (tracking plans, violations,
blocking, quarantine), mParticle IDSync, Tealium consent integrations, Amperity
Stitch (survivorship, Amperity ID stability), Adobe Experience Platform
(Real-Time Customer Profile, Identity Service, identity graph viewer, computed
attributes, streaming segmentation, audience overlap, destinations), Salesforce
Data Cloud (zero-copy federation, calculated insights). These set the boundary
of what a decisioning platform must do itself versus consume — a boundary this
taxonomy states but does not decide.

### What this method cannot see

Documentation describes the intended product. It does not show how long the
capability takes to configure, whether it needs professional services, how it
behaves at the tenth million profile, or how often it is switched off in
production because it was too slow. Several `TABLE-STAKES` items below are
present in every product and satisfying in none. A buyer's requirements list has
the same blind spot, which is why matching it is necessary and not sufficient.

---

## 1. Data, profile and identity

**1.1** — A data engineer can define the schema of a profile store attribute —
name, type, cardinality, allowed values — and have the platform reject an
inbound record that violates it, rather than accepting it and failing later at
decision time. `TABLE-STAKES`

**1.2** — A data engineer can declare a tracking plan for inbound interaction
events and see a running count of events that violated it, per property, without
querying a warehouse. `TABLE-STAKES`

**1.3** — An operator can route violating events to a quarantine stream and
replay them once the producer is fixed, rather than losing them. `DIFFERENTIATING`

**1.4** — A marketer can look up one customer by any known identifier — email,
phone, device id, account number — and see the whole profile as the decision
engine sees it, not a reporting copy of it. `TABLE-STAKES`

**1.5** — An identity owner can define which identifiers are strong enough to
merge two profiles and which are not, and change that policy without an
engineering release. `TABLE-STAKES`

**1.6** — An identity owner can view the identity graph for one customer: which
identifiers stitched to which, by which rule, at what time. `DIFFERENTIATING`

**1.7** — An identity owner can unmerge two profiles that were wrongly stitched
and have every downstream store reflect the split. `FRONTIER`

**1.8** — A data steward can configure survivorship — which source wins for each
attribute, by recency, source priority or completeness — and see which source
supplied each field on a given profile. `DIFFERENTIATING`

**1.9** — A marketer can define a computed attribute — lifetime margin, days
since last interaction, count of accepted offers in ninety days — as a rule over
the interaction log with a stated lookback window, without writing code.
`TABLE-STAKES`

**1.10** — A marketer can see when a computed attribute was last recalculated and
how stale the value on a given profile is. `DIFFERENTIATING`

**1.11** — A decision flow author can read a profile attribute inside a decision
flow and have the compile fail if that attribute is not in the schema, rather
than getting a null at runtime. `TABLE-STAKES`

**1.12** — An operator can ingest a profile change as a stream and have a decision
made one second later read the new value. `TABLE-STAKES`

**1.13** — An operator can ingest a batch file, see the row counts accepted and
rejected, and get the rejected rows back as a file with reasons. `TABLE-STAKES`

**1.14** — An architect can read an attribute that lives in an external warehouse
at decision time without copying it into the profile store first.
`DIFFERENTIATING`

**1.15** — An architect can declare a maximum wait for an externally-sourced
attribute and a default to use when it does not arrive, so a slow source degrades
the decision rather than failing it. `DIFFERENTIATING`

**1.16** — A data engineer can register a feature once and have the decision path
and the model training path read the same definition, so the value scored in
production is the value the model was trained on. `FRONTIER`

**1.17** — A data steward can see which decision flows, targeting policies and
models read a given attribute, before changing or retiring it. `DIFFERENTIATING`

**1.18** — An analyst can replay a historical decision against the profile as it
stood at that moment, rather than as it stands now. `FRONTIER`

**1.19** — A marketer can see one customer's interaction log — every impression,
click, acceptance and refusal — in a single chronological view, across channels.
`TABLE-STAKES`

**1.20** — An administrator can define an entity beside the customer — account,
household, device, subscription — and choose at which level a decision is made.
`DIFFERENTIATING`

**1.21** — A data engineer can version a profile schema and run both versions
during a migration, with each decision naming the version it read. `FRONTIER`

**1.22** — An operator can see, for the profile store as a whole, how many
profiles exist, how many are anonymous, and how many were touched in the last
day. `TABLE-STAKES`

---

## 2. Consent, preference and privacy

**2.1** — A customer can record a channel-level preference and have every decision
honour it within seconds rather than at the next batch. `TABLE-STAKES`

**2.2** — A compliance officer can express consent as a purpose — marketing,
profiling, third-party sharing — rather than as a per-channel flag, and target
on the purpose. `TABLE-STAKES`

**2.3** — A decision flow author can rely on consent being enforced by the
platform on every path, rather than by remembering to add a filter to each flow.
`DIFFERENTIATING`

**2.4** — A compliance officer can see, for one decision that was made, which
consent record was read and what it said at that instant. `FRONTIER`

**2.5** — An operator can ingest consent from an external consent management
platform and have the platform treat that source as authoritative rather than
keeping a second copy that drifts. `TABLE-STAKES`

**2.6** — A compliance officer can configure the platform to fail closed — make no
offer at all — when the consent source is unavailable, rather than defaulting to
permitted. `DIFFERENTIATING`

**2.7** — A privacy officer can execute an erasure request and have the customer
removed from the profile store, the interaction log and every downstream
destination, with evidence for each. `TABLE-STAKES`

**2.8** — A privacy officer can execute a data access request and export
everything held about one customer, including the decisions made about them and
why. `TABLE-STAKES`

**2.9** — An administrator can restrict an attribute to named purposes, so that a
decision flow using it for another purpose fails to compile rather than being
caught in review. `DIFFERENTIATING`

**2.10** — A compliance officer can apply a data residency rule so that one
customer's data is processed only in a named region. `DIFFERENTIATING`

**2.11** — A compliance officer can define a vulnerability or minimum-age
condition that suppresses whole categories of offer, and prove afterwards that
the suppression ran. `DIFFERENTIATING`

**2.12** — A privacy officer can state how long each class of data is retained and
have expiry enforced by the platform rather than by a scheduled script somebody
maintains. `TABLE-STAKES`

---

## 3. Audience and segmentation

**3.1** — A marketer can build an audience from profile attributes and interaction
history in a visual editor and see the count before saving it. `TABLE-STAKES`

**3.2** — A marketer can build an audience that qualifies in real time as events
stream in, not only on an overnight rebuild. `TABLE-STAKES`

**3.3** — A marketer can see the overlap between two audiences before running
anything against either. `DIFFERENTIATING`

**3.4** — A marketer can nest one audience inside another and be warned when the
definition becomes circular. `TABLE-STAKES`

**3.5** — A marketer can see an audience's size history and be alerted when it
moves sharply, since a segment that halves overnight is usually a broken feed
rather than a change in customers. `DIFFERENTIATING`

**3.6** — A marketer can build a lookalike audience from a seed and control how
far the expansion reaches. `DIFFERENTIATING`

**3.7** — A marketer can hold a random sample of an audience out of all activity,
permanently and stably, as a measurement baseline. `TABLE-STAKES`

**3.8** — An analyst can ask why one named customer did or did not qualify for an
audience and get the answer clause by clause. `DIFFERENTIATING`

**3.9** — A marketer can define an audience over an entity other than the customer
— an account, a household — and activate it at that level. `DIFFERENTIATING`

**3.10** — A marketer can compose an audience from data held in an external
warehouse without copying the rows into the platform. `FRONTIER`

**3.11** — An administrator can see which decision flows, journeys and campaigns
depend on an audience before it is edited or deleted. `TABLE-STAKES`

**3.12** — A marketer can schedule an audience to refresh on a cadence and see
when it last ran and how long it took. `TABLE-STAKES`

---

## 4. Offer and action management

**4.1** — A business user can create an offer, place it under an objective and a
category, and save it without engineering involvement. `TABLE-STAKES`

**4.2** — A business user can define offer attributes of their own — price, term,
margin, partner code — without a schema change under version control.
`TABLE-STAKES`

**4.3** — A business user can create a new version of an existing offer, alter one
attribute, and have both versions live with independent effective dates.
`TABLE-STAKES`

**4.4** — A business user can set a validity window on an offer and have the
platform stop offering it after the end date without anyone remembering to.
`TABLE-STAKES`

**4.5** — A business user can retire an offer and have every decision flow naming
it report the break, rather than silently dropping a candidate. `DIFFERENTIATING`

**4.6** — A business user can see, before activating an offer, every placement and
flow in which it will become decidable. `DIFFERENTIATING`

**4.7** — A business user can set a total volume cap across the whole population —
a finite inventory — and see how much of it is left. `DIFFERENTIATING`

**4.8** — A business user can import a catalogue of thousands of offers from a file
and have failures reported per row rather than as one rejection. `TABLE-STAKES`

**4.9** — A business user can search a catalogue of tens of thousands of offers by
name, attribute, status and objective and get results in under a second.
`TABLE-STAKES`

**4.10** — A business user can copy an offer, with its creatives and its targeting,
as the starting point for a new one. `TABLE-STAKES`

**4.11** — A business user can attach a business boost to an offer or category,
expressed as a multiplier carrying a stated reason and an expiry date.
`DIFFERENTIATING`

**4.12** — A business user is prevented from activating an offer that has nothing
to deliver on any channel, and is told which channel is missing.
`DIFFERENTIATING`

**4.13** — A business user can see, from the offer's own screen, every decision it
took part in and its acceptance rate. `DIFFERENTIATING`

**4.14** — A business user can group offers into a bundle that is arbitrated as one
unit, where accepting the bundle accepts every member. `FRONTIER`

---

## 5. Content, creative and asset governance

**5.1** — A content author can create a creative for an offer on a named channel
and have the editor enforce that channel's shape: subject and body for email,
character budget for SMS, title and image for a web placement. `TABLE-STAKES`

**5.2** — A content author can see the character or byte count against the
channel's limit while typing, not after saving. `TABLE-STAKES`

**5.3** — A content author can assemble a creative from reusable blocks that update
everywhere they are used when the block changes. `TABLE-STAKES`

**5.4** — A content author can preview a creative rendered against a named real
profile, with personalisation resolved, before anyone approves it.
`TABLE-STAKES`

**5.5** — A content author can send a proof to themselves and to a review list on
the real channel, so the rendering is the customer's rendering. `TABLE-STAKES`

**5.6** — A content author can insert a personalisation field and be told at
authoring time that the field does not exist in the profile schema, rather than
at send time. `DIFFERENTIATING`

**5.7** — A content author must set a fallback for every personalisation field,
with the platform refusing to publish a creative that has one without.
`DIFFERENTIATING`

**5.8** — A content author can pull content from an external system at send time
and state what happens when that call is slow or fails. `DIFFERENTIATING`

**5.9** — A brand owner can require that a creative pass approval before it can be
delivered, and see everything waiting on them. `TABLE-STAKES`

**5.10** — A brand owner can define brand rules — tone, forbidden claims, required
disclosures — and have the platform check a creative against them automatically
before it reaches approval. `FRONTIER`

**5.11** — A legal reviewer can attach a mandatory disclosure to a category so that
every creative beneath it carries the text and cannot be published without it.
`DIFFERENTIATING`

**5.12** — An asset manager can set an expiry date and a territorial licence on an
image and have the platform refuse to deliver it outside those bounds, rather
than emailing a reminder. `DIFFERENTIATING`

**5.13** — An asset manager can see every creative and every offer using an asset
before replacing or deleting it. `TABLE-STAKES`

**5.14** — A content author can localise a creative into many languages and see
which locales are missing, and which are stale relative to the source.
`TABLE-STAKES`

**5.15** — A content author can have the platform draft copy from a prompt and a
brand profile, then edit it before use. `DIFFERENTIATING`

**5.16** — A content author can generate several variants of one creative and place
them directly into a content experiment without re-keying them.
`DIFFERENTIATING`

**5.17** — A content author can version a creative, see the difference between two
versions, and roll back to an earlier one. `TABLE-STAKES`

**5.18** — An accessibility reviewer can check a creative for alt text, colour
contrast and reading level before it is approved. `FRONTIER`

**5.19** — A content author can see which creatives have never been delivered, and
which have not been delivered in ninety days, so the library can be pruned on
evidence. `DIFFERENTIATING`

**5.20** — An operator can see, for one delivered message, the exact rendered
content that customer received, rather than the template it came from.
`DIFFERENTIATING`

**5.21** — A content author can author a creative once and have it adapt to
placements of several sizes without re-authoring each. `DIFFERENTIATING`

**5.22** — A brand owner can withdraw a creative from circulation immediately and
have in-flight decisions stop selecting it within seconds. `DIFFERENTIATING`

---

## 6. Eligibility, relevance and suitability

**6.1** — A business user can express an eligibility rule — the hard filter
answering whether the business may offer this at all — in a form they can read
back and understand six months later. `TABLE-STAKES`

**6.2** — A business user can express a relevance rule, deciding whether an offer
should be made now given the customer's situation, as a separate tier from
eligibility. `DIFFERENTIATING`

**6.3** — A business user can express a suitability rule covering affordability and
ethics, separately again, so that "we may" and "we should" are not the same
switch. `DIFFERENTIATING`

**6.4** — A business user can see, for one customer, which offers each tier removed
and on which clause. `DIFFERENTIATING`

**6.5** — A business user can attach a targeting policy at the objective, the
category or the offer, and have the platform apply all three in a defined order.
`DIFFERENTIATING`

**6.6** — A business user can test a targeting policy against a sample population
and see how many customers survive each clause, before publishing it.
`DIFFERENTIATING`

**6.7** — A business user can express a rule as a decision table with a stated hit
policy, rather than as nested conditions. `TABLE-STAKES`

**6.8** — A business user can call an external service inside an eligibility rule
and state the behaviour on timeout. `DIFFERENTIATING`

**6.9** — A business user is prevented from publishing a targeting policy that
excludes everybody, and is shown the count that stopped it. `DIFFERENTIATING`

**6.10** — A compliance officer can mark a rule as regulatory so that changing it
requires a second approver. `DIFFERENTIATING`

**6.11** — A business user can reuse one rule across many offers and see everywhere
it is used before editing it. `TABLE-STAKES`

**6.12** — A business user can express a rule over the interaction log — "has not
been offered this in ninety days" — without writing a query. `TABLE-STAKES`

---

## 7. Arbitration and ranking

**7.1** — A business user can see the ranking function written out — every term,
its weight, and its current value for one named customer. `DIFFERENTIATING`

**7.2** — A business user can change the weight of a term and see the effect on a
sample population before publishing the change. `DIFFERENTIATING`

**7.3** — A business user can apply a business boost to a category for a stated
period and reason and have it expire automatically rather than persisting until
someone notices. `DIFFERENTIATING`

**7.4** — An analyst can see the full ranked candidate list for one decision, not
only the winner. `DIFFERENTIATING`

**7.5** — An analyst can see, for each losing candidate, the specific term that
cost it the position. `FRONTIER`

**7.6** — A business user can guarantee a minimum share of decisions to a strategic
objective without switching arbitration off for it. `DIFFERENTIATING`

**7.7** — A business user can arbitrate across objectives — retention against
acquisition — in one ranking rather than by running them in sequence and letting
the first win. `DIFFERENTIATING`

**7.8** — A business user can fill a multi-slot placement with a ranked set that
respects diversity rules, so three offers from one category do not take every
slot. `DIFFERENTIATING`

**7.9** — A decision flow author can compose arbitration from operators on a canvas
and have the flow compile or fail with a named reason. `TABLE-STAKES`

**7.10** — An operator can see the decision, the artifact version that produced it,
and the inputs it read, as one immutable record. `DIFFERENTIATING`

**7.11** — An analyst can replay a historical decision against its recorded inputs
and get an identical result, so the record can be proved rather than trusted.
`FRONTIER`

**7.12** — A business user can express the ranking function in monetary terms —
expected margin — rather than in an abstract score nobody can defend to finance.
`DIFFERENTIATING`

---

## 8. Predictive and adaptive models

**8.1** — A data scientist can attach a propensity model to an offer and have its
output enter the ranking function without engineering work. `TABLE-STAKES`

**8.2** — A business user can launch an offer with no response history and have the
platform explore it rather than never showing it. `DIFFERENTIATING`

**8.3** — A data scientist can see each model's predictor list and which predictors
the platform has deactivated for weak predictive power. `DIFFERENTIATING`

**8.4** — A data scientist can see a model's performance trend over time and be
alerted when it degrades. `TABLE-STAKES`

**8.5** — A data scientist can see the distribution of scores a model is producing
now and compare it against the distribution it was trained on. `DIFFERENTIATING`

**8.6** — A data scientist can run a new model beside the live one, scoring without
deciding, and compare the two before switching. `DIFFERENTIATING`

**8.7** — A data scientist can register a model trained elsewhere and have
decisions call it under a stated latency budget. `DIFFERENTIATING`

**8.8** — A compliance officer can obtain, for one decision, the model inputs and
their contributions, in a form that can be handed to a regulator without a data
science translation. `FRONTIER`

**8.9** — A compliance officer can test a model for bias across protected
characteristics and see the result before the model goes live.
`DIFFERENTIATING`

**8.10** — A compliance officer can block a model from production when a bias
threshold is breached, rather than being notified after it has run.
`FRONTIER`

**8.11** — A data scientist can see how much of a model's learning came from
exploration rather than exploitation, and what that exploration cost.
`FRONTIER`

**8.12** — A data scientist can retrain or reset a model from the screen, with the
action recorded and attributed to them. `DIFFERENTIATING`

**8.13** — A business user can read a plain statement of what a model predicts and
which customer response counts as success. `DIFFERENTIATING`

**8.14** — A data scientist can version a model, keep the previous version
reachable, and determine which version scored any historical decision.
`DIFFERENTIATING`

---

## 9. Experimentation and measurement

**9.1** — A marketer can split traffic between two creatives for one offer and see
which won, with a stated confidence rather than a raw difference in rates.
`TABLE-STAKES`

**9.2** — A marketer can split traffic between two versions of a decision flow, so
that the logic itself is under test and not only the content.
`DIFFERENTIATING`

**9.3** — An analyst can declare the primary metric before the experiment starts
and have the platform refuse to change it afterwards. `DIFFERENTIATING`

**9.4** — An analyst can declare guardrail metrics that stop an experiment
automatically when they degrade, rather than relying on someone watching.
`DIFFERENTIATING`

**9.5** — An analyst can look at results at any time without inflating the false
positive rate, because the platform applies a sequential correction rather than
asking for discipline. `DIFFERENTIATING`

**9.6** — An analyst can see results corrected for multiple comparisons when an
experiment carries many metrics and many arms. `DIFFERENTIATING`

**9.7** — An analyst can reduce the sample size required by using pre-period data,
without designing the variance reduction themselves. `DIFFERENTIATING`

**9.8** — An analyst can see the minimum detectable effect and the required
duration before launching, rather than discovering the experiment was
underpowered when it ends. `TABLE-STAKES`

**9.9** — An analyst can hold a permanent global control group out of all activity
and read cumulative incremental value against it. `TABLE-STAKES`

**9.10** — An analyst can hold a group out of one offer or one objective while
leaving the rest of the programme intact for those customers.
`DIFFERENTIATING`

**9.11** — An analyst can confirm that assignment was balanced across arms, and be
warned automatically when the split does not match what was configured.
`DIFFERENTIATING`

**9.12** — An analyst can segment experiment results after the fact and have the
platform distinguish the pre-registered cut from the exploratory ones.
`DIFFERENTIATING`

**9.13** — A marketer can run a bandit that shifts traffic toward the leading arm
during the experiment rather than only at the end of it. `DIFFERENTIATING`

**9.14** — An analyst can see what the bandit's exploration cost, stated in the same
units as the value it won. `FRONTIER`

**9.15** — An analyst can run an experiment where the unit of assignment is a region
and a time window rather than a customer, for effects that leak between
customers. `FRONTIER`

**9.16** — An analyst can measure an experiment on an outcome that lands days later
— retention, a second purchase — with the platform holding the window open
rather than reporting the click. `TABLE-STAKES`

**9.17** — An analyst can stop an experiment and record why, so that the decision is
legible to the next person who asks. `DIFFERENTIATING`

**9.18** — An analyst can prevent two experiments from overlapping on one population
when their interaction would confound both. `DIFFERENTIATING`

**9.19** — An analyst can see every experiment ever run against an offer, its
result, and whether the change was adopted. `DIFFERENTIATING`

**9.20** — An analyst can export the raw assignment and exposure records and redo
the analysis independently of the platform. `TABLE-STAKES`

**9.21** — An analyst can run an experiment whose arms differ in targeting rather
than in content, and read the result as reach traded against value.
`FRONTIER`

**9.22** — An analyst is shown, when an experiment ends, the decision the result
supports — ship, hold, iterate — rather than a table they must interpret alone.
`FRONTIER`

---

## 10. Journeys and orchestration

**10.1** — A marketer can build a multi-step journey on a canvas with waits,
branches and message steps, without code. `TABLE-STAKES`

**10.2** — A marketer can set entry criteria for a journey and control whether and
how soon a customer may re-enter. `TABLE-STAKES`

**10.3** — A marketer can branch a journey on an attribute, on behaviour, or on a
random split, and see the counts taking each branch. `TABLE-STAKES`

**10.4** — A marketer can preview the path one named customer would take through a
journey before publishing it. `DIFFERENTIATING`

**10.5** — A marketer can start a journey from an inbound event within seconds of
that event arriving. `TABLE-STAKES`

**10.6** — A marketer can call the decision engine from inside a journey step, so
the offer is chosen at the moment of send rather than fixed at entry.
`DIFFERENTIATING`

**10.7** — A marketer can see, for a running journey, how many customers are sitting
at each step right now. `TABLE-STAKES`

**10.8** — A marketer can change a live journey without ejecting the customers
already inside it, and see which version each is following.
`DIFFERENTIATING`

**10.9** — A marketer can wait until a condition becomes true, with a maximum wait
and a defined path for those who never satisfy it. `TABLE-STAKES`

**10.10** — A marketer can end a journey for a customer the moment its goal is met,
and see how many exited that way rather than by completing it.
`TABLE-STAKES`

**10.11** — A marketer can see which journeys one named customer is currently in and
remove them from a specific one. `DIFFERENTIATING`

**10.12** — A marketer can coordinate journeys so that a customer in a service
recovery journey is not simultaneously pursued by a sales journey.
`FRONTIER`

---

## 11. Channels and delivery

**11.1** — A developer can ask the platform for the next best action for a customer
in a named placement, over an API, and get an answer within a stated latency
budget. `TABLE-STAKES`

**11.2** — A marketer can deliver to email, SMS, push and web placements from one
catalogue, without duplicating the offer per channel. `TABLE-STAKES`

**11.3** — A contact-centre agent can see the recommended actions for the customer
on the line, with the reason for each, inside their own desktop rather than a
second window. `DIFFERENTIATING`

**11.4** — An agent can record the outcome of a conversation — accepted, refused,
deferred — and have the next decision for that customer reflect it immediately.
`DIFFERENTIATING`

**11.5** — A marketer can activate an audience to a paid media destination and see
how many identifiers the destination matched. `TABLE-STAKES`

**11.6** — A marketer can suppress existing customers from a paid acquisition
audience automatically rather than by exporting a list each month.
`TABLE-STAKES`

**11.7** — An operator can run a batch decision across the whole customer base
overnight and deliver the output as a file to a partner system.
`TABLE-STAKES`

**11.8** — An operator can see delivery status per message — sent, delivered,
bounced, failed — with the provider's own reason attached. `TABLE-STAKES`

**11.9** — An operator can retry or reroute a failed delivery without re-running the
decision that produced it. `DIFFERENTIATING`

**11.10** — A marketer can define a placement once and let several decision flows
answer it, with the platform resolving which applies. `DIFFERENTIATING`

**11.11** — An operator can add a delivery provider through configuration rather
than waiting for a platform release. `DIFFERENTIATING`

**11.12** — A marketer can hold a send until the moment each individual is most
likely to engage, rather than sending to everyone at once.
`DIFFERENTIATING`

**11.13** — A marketer can set quiet hours in each customer's own time zone and have
late sends held until the window opens rather than dropped. `TABLE-STAKES`

**11.14** — An operator can throttle outbound volume to a rate a downstream provider
can absorb, and see the queue depth while it drains. `TABLE-STAKES`

---

## 12. Frequency, suppression and fatigue

**12.1** — A marketer can cap how many messages a customer receives per channel per
period and have every decision honour the cap. `TABLE-STAKES`

**12.2** — A marketer can set a global cap across all channels, so that four
channels at three each is not twelve. `TABLE-STAKES`

**12.3** — A marketer can set a cooldown so the same offer is not repeated within a
stated period. `TABLE-STAKES`

**12.4** — A marketer can mark a message as transactional so it bypasses the
frequency & suppression policy, and can list everything that bypassed it.
`TABLE-STAKES`

**12.5** — A marketer can suppress an offer for a customer who has refused it a
stated number of times, for a stated period. `DIFFERENTIATING`

**12.6** — An analyst can see how many decisions each policy suppressed, and what
was suppressed, rather than only the sends that survived. `DIFFERENTIATING`

**12.7** — A marketer can let the platform choose each individual's message volume
within a range, based on that person's engagement history.
`DIFFERENTIATING`

**12.8** — An analyst can see fatigue evidence — falling engagement against rising
volume — for a cohort rather than as a single aggregate that hides it.
`FRONTIER`

**12.9** — A marketer can cap by category rather than by channel, so that six
different retention offers do not each pass a per-channel cap.
`DIFFERENTIATING`

**12.10** — An analyst can see what a customer would have been offered had a cap not
blocked it, so the cost of the policy is visible alongside its benefit.
`FRONTIER`

---

## 13. Simulation, testing and pre-production QA

**13.1** — A business user can run a proposed targeting policy against a sample
population and see how many customers each clause removes. `DIFFERENTIATING`

**13.2** — A business user can compare two configurations side by side on the same
population before choosing between them. `DIFFERENTIATING`

**13.3** — A business user can see the projected distribution of offers across the
base before publishing, and spot one offer taking almost everything.
`DIFFERENTIATING`

**13.4** — A business user can find the customers who would receive nothing at all,
or only low-value actions, under a proposed configuration.
`DIFFERENTIATING`

**13.5** — A business user can run a simulation without it touching live decisions
or writing to the interaction log. `TABLE-STAKES`

**13.6** — A business user can project the value a configuration would produce
against a target and see the gap stated in money. `DIFFERENTIATING`

**13.7** — A tester can send one synthetic customer through the live configuration
and read the complete trace of what happened. `TABLE-STAKES`

**13.8** — A tester can save a set of customer scenarios as a regression suite and
re-run it automatically after every change. `FRONTIER`

**13.9** — A tester can be told which live decisions a pending change set would
alter, before it is released. `FRONTIER`

**13.10** — A business user can run a new configuration in shadow against live
traffic, deciding nothing, and compare its choices with the active one.
`DIFFERENTIATING`

**13.11** — A business user can see how long a simulation will take and what it will
cost before starting it. `FRONTIER`

---

## 14. Analytics, attribution and reporting

**14.1** — A marketer can see, for any offer, impressions, acceptances and
acceptance rate over a period they choose. `TABLE-STAKES`

**14.2** — A marketer can break any reported number down by channel, placement,
objective, category and audience. `TABLE-STAKES`

**14.3** — An analyst can click any reported number and reach the decision records
that produced it, rather than being asked to trust the aggregate.
`FRONTIER`

**14.4** — An analyst can see the decision funnel as counts — candidates in, removed
by eligibility, by relevance, by suitability, by the frequency & suppression
policy, ranked, delivered. `DIFFERENTIATING`

**14.5** — An analyst can see that same funnel for one named customer as well as in
aggregate. `DIFFERENTIATING`

**14.6** — An analyst can compare performance across periods and be told whether a
movement is outside normal variation rather than eyeballing a line.
`DIFFERENTIATING`

**14.7** — An analyst can attribute an outcome to the decisions preceding it using a
stated attribution model. `TABLE-STAKES`

**14.8** — An analyst can compare several attribution models over the same data and
see how the credit shifts between them. `DIFFERENTIATING`

**14.9** — An analyst can use an algorithmic attribution model, not only rule-based
ones such as first touch and last touch. `DIFFERENTIATING`

**14.10** — An analyst can set the attribution window per objective, because a
broadband switch takes longer to land than a data add-on.
`DIFFERENTIATING`

**14.11** — An analyst can read incremental value measured against a holdout rather
than gross value only. `TABLE-STAKES`

**14.12** — An analyst can see value in money, sourced from a named field, rather
than a count of clicks standing in for revenue. `TABLE-STAKES`

**14.13** — An analyst can stream every decision record and interaction event to
their own warehouse continuously, not as a nightly extract.
`TABLE-STAKES`

**14.14** — An analyst can reconcile the platform's reported totals against their
own warehouse and locate the difference when the two disagree.
`FRONTIER`

**14.15** — An analyst can build a report the vendor did not anticipate without
raising a ticket. `DIFFERENTIATING`

**14.16** — An analyst can schedule a report and have it delivered to named
recipients on a cadence. `TABLE-STAKES`

**14.17** — An executive can see, on one screen, the value the platform produced
this period against the target it was given. `DIFFERENTIATING`

**14.18** — An analyst can see performance by cohort — customers acquired in a given
month, followed forward — and not only by reporting period.
`DIFFERENTIATING`

**14.19** — An analyst can see which offers are never chosen and why they lose,
rather than only the performance of those that win. `DIFFERENTIATING`

**14.20** — An analyst can see the contribution of each term in the ranking function
to realised value, so the function can be tuned on evidence rather than
argument. `FRONTIER`

**14.21** — An analyst can see the latency and compute cost of decisions beside the
value they produced, so an expensive decision flow earning little is visible.
`FRONTIER`

**14.22** — An analyst is told when a reported number is provisional because
late-arriving responses are still landing against it. `FRONTIER`

---

## 15. Governance, approval, environments and audit

**15.1** — A business user can group related edits into a change set and send the
whole set for approval as one unit. `TABLE-STAKES`

**15.2** — An approver can see exactly what changed in a change set, field by field
and before against after, rather than a list of object names.
`TABLE-STAKES`

**15.3** — An approver can reject a change set with a reason that reaches the author
inside the platform. `TABLE-STAKES`

**15.4** — An administrator can require more than one approver for changes touching
rules marked regulatory. `DIFFERENTIATING`

**15.5** — A release manager can promote an approved change set from development
through test to production along a defined pipeline. `TABLE-STAKES`

**15.6** — A release manager can roll a release back and know precisely which state
the platform returns to. `DIFFERENTIATING`

**15.7** — An auditor can see who changed what, when, and what the value was before,
for every object in the platform. `TABLE-STAKES`

**15.8** — An auditor can verify that the audit log is append-only and has not been
altered, rather than being asked to assume it. `FRONTIER`

**15.9** — An operator can determine which artifact version was live at any past
moment. `DIFFERENTIATING`

**15.10** — A business user can get a change into production within a working day
without a platform release. `DIFFERENTIATING`

**15.11** — An administrator can separate who may author, who may approve and who
may release, and prevent one person doing all three.
`TABLE-STAKES`

**15.12** — An operator can reduce the platform's autonomy in an incident — pause a
flow, force a fallback — with the action recorded and attributed.
`DIFFERENTIATING`

**15.13** — An operator can list, for a past incident window, every decision that was
affected by it. `FRONTIER`

**15.14** — An administrator can export a configuration as a package and install it
into another environment or another tenant. `DIFFERENTIATING`

---

## 16. Administration, extensibility and screen configurability

**16.1** — An administrator can add a field to an entity and have it appear on the
screen, in validation, and in the API, without a code change or a vendor
release. `FRONTIER`

**16.2** — An administrator can define who sees which screen, with what a person may
not use hidden rather than shown greyed out. `DIFFERENTIATING`

**16.3** — An administrator can compose a role from named permissions rather than
choosing among fixed roles the vendor shipped. `TABLE-STAKES`

**16.4** — An administrator can run several brands or business units in one platform
with separate catalogues and shared infrastructure. `TABLE-STAKES`

**16.5** — A partner can install a package that adds operators, screens or content
types without forking the platform. `DIFFERENTIATING`

**16.6** — An administrator can install a regulatory or industry pack and receive
its rules, attributes and reports as one governed unit.
`DIFFERENTIATING`

**16.7** — A developer can extend a decision flow with a custom operator that runs
inside the engine under a stated resource limit. `DIFFERENTIATING`

**16.8** — An administrator can change the labels a screen uses to match the words
the organisation actually uses. `DIFFERENTIATING`

**16.9** — A user can choose which columns a list shows and have that choice persist
for them. `TABLE-STAKES`

**16.10** — An administrator can theme the console to the organisation's brand
without editing stylesheets. `DIFFERENTIATING`

**16.11** — A developer can reach every capability the console offers through a
documented API generated from the same contract the console itself consumes.
`DIFFERENTIATING`

**16.12** — An administrator can connect an identity provider for single sign-on and
map its groups onto platform roles. `TABLE-STAKES`

**16.13** — An administrator can see a screen as another role sees it before granting
that role to anyone. `FRONTIER`

---

## 17. Operations, reliability and cost

**17.1** — An operator can see the decision endpoint's latency distribution, median
and tail, in real time rather than as a daily average.
`TABLE-STAKES`

**17.2** — An operator can set a latency budget for a decision and have the platform
return a defined fallback rather than exceeding it. `DIFFERENTIATING`

**17.3** — An operator can see which stage of a decision flow consumed the time, for
an individual slow decision rather than in aggregate. `FRONTIER`

**17.4** — An operator can see the throughput the platform is sustaining and how
close that is to its limit. `TABLE-STAKES`

**17.5** — An operator can send the same request twice and be certain it produced one
decision rather than two. `DIFFERENTIATING`

**17.6** — An operator can keep deciding when a downstream data source is
unavailable, under a degradation policy stated in advance rather than improvised
during the incident. `DIFFERENTIATING`

**17.7** — An operator can see the cost of decisions by tenant, flow or channel and
attribute spend to the team that caused it. `FRONTIER`

**17.8** — An operator can be alerted when acceptance rate, decision volume or error
rate departs from that metric's own history, without setting a fixed threshold
by hand. `DIFFERENTIATING`

**17.9** — An operator can drain and restart a node without losing decisions in
flight. `TABLE-STAKES`

**17.10** — An operator can see how far behind real time the interaction log is
running. `DIFFERENTIATING`

**17.11** — An operator can reprocess a period of interaction events after an outage
without double-counting the responses. `DIFFERENTIATING`

**17.12** — An operator can prove the platform made no outbound network call it was
not configured to make. `FRONTIER`

---

## Counts

250 line items across 17 domains. Recount rather than trust these: each is the
number of lines in this file matching the classification tag inside a numbered
item.

- `TABLE-STAKES` — 91
- `DIFFERENTIATING` — 123
- `FRONTIER` — 36

By domain: 1 (22), 2 (12), 3 (12), 4 (14), 5 (22), 6 (12), 7 (12), 8 (14),
9 (22), 10 (12), 11 (14), 12 (10), 13 (11), 14 (22), 15 (14), 16 (13), 17 (12).

The four weighted domains — 1, 5, 9 and 14 — hold 88 items, 35% of the list.

---

## Notes on the shape of the result

**The `FRONTIER` items cluster.** Eighteen of the thirty-six sit in four
places: explaining a single decision (7.5, 7.11, 8.8, 14.3), proving what
happened after the fact (1.18, 2.4, 15.8, 15.13, 17.12), knowing the cost of a
policy or a mechanism (9.14, 12.8, 12.10, 14.21, 17.7), and letting a
non-engineer change the shape of the product (13.8, 13.9, 16.1, 16.13). Every
product in the source list ranks well; none of them can tell you cheaply why one
particular customer got one particular offer, or what the rules cost you.

**`DIFFERENTIATING` outnumbers `TABLE-STAKES` by a third.** That is not a sign
the market is immature. It reflects that these products grew from different
starting points — a rules engine, a campaign tool, a tag manager, a web testing
tool — and each carried its origin forward. The capabilities all of them have
are the ones every origin needed.

**The identity and content domains are where the boundary sits.** Domains 1 and
5 contain the most items that a decisioning platform might reasonably decline to
build, on the grounds that a CDP or a DAM already does them. That is a product
decision, not a taxonomy decision, and this document deliberately does not make
it: the items are listed because a buyer will ask, and answering "our partner
does that" is a legitimate answer that still has to be given out loud. E3 should
record such an answer as a stated boundary with the partner named, not as a
capability.

**Three source products contributed less than their listing implies.** SAS
Customer Intelligence 360, HCL Unica and Redpoint publish product overviews but
gate the detailed documentation, so their contribution here is at the level of
domain structure rather than individual line items. No item rests on them alone.
A reviewer who has access to those manuals should expect to find items this list
is missing, most likely in domains 11 and 14, where all three have long
histories in batch campaign management that the newer products do not.

---

**Next:** E3 joins this document to `docs/CAPABILITIES.md`. It is a separate
session and it changes exactly one existing file.
