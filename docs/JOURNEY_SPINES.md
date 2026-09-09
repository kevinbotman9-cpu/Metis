# METIS — Journey Spines

This file replaces the feature backlog as the work queue. Work is pulled from here,
in order.

## Why spines

A feature list produces a platform where every subsystem is 60% built and nothing
is usable. A spine is a complete path a named person walks from start to finish.
Building spine-first means a capability arrives with its screen, its configuration
surface and its explanation, because the person walking the spine needs all three.

Rules:
- Only one spine is open at a time.
- A spine is closed when its `@screen-only` e2e test passes and every route it
  touches passes conformance.
- A capability is built to the depth this spine needs. Not deeper. Depth arrives
  when a later spine demands it.
- When a spine needs something absent, that becomes a slice inside this spine — it
  does not become a new spine or a deferred ticket.

---

## Spine 1 — The marketer publishes an offer

*Persona: Marketer. This is the product's spine of spines. Nothing else starts
until it closes.*

A logged-in marketer, starting from an empty tenant, can:
1. Create an objective and a category in the taxonomy.
2. Create an offer with properties, from the screen.
3. Add a creative for a channel, with per-channel fields supplied by the channel package.
4. Write an eligibility rule in a rule editor and see it validate.
5. Set effective dates.
6. Run a distribution simulation over a sample audience and read the result.
7. Raise a change set for approval; a second user approves it.
8. Publish. See it live.
9. Open the trace for one decision and see their rule named in it.
10. Roll it back.

**Closes when:** one `@screen-only` test walks all ten steps. Zero API setup.

**What this forces into existence, correctly:** taxonomy, offer catalogue,
creative entity, channel package contract, rule authoring UI, effective dating,
simulation, change-set approval, blue/green publish, trace rendering, rollback.
Every one of them arrives with a screen because the marketer cannot proceed
without it.

---

## Spine 2 — The decision architect shapes arbitration

A decision architect can open a decision flow on the canvas, add and connect nodes,
edit the ranking function as a named versioned artefact, adjust a business
boost and see simulated impact before saving, diff their version against the live
one on a population, and publish behind an approval.

**Closes when:** an architect changes ranking behaviour and proves the change on a
population, clicking only.

---

## Spine 3 — The compliance officer proves a decision

A compliance officer can search decisions by customer, rule, or outcome; open one;
read the trace in the regulator rendering; replay it and see byte-identical
confirmation; run a bias check on a segment; and export evidence.

**Closes when:** "Prove it" works from the screen for a decision made 30 days ago.

---

## Spine 4 — The data scientist ships a model

Upload or register a model, map its features against declared definitions, run it
in shadow scoring, read drift and performance, promote it to champion behind an
approval, and see its feature attributions reach the trace.

---

## Spine 5 — The CSR sees the next best action

An agent-assist surface loads inside a host application in under two seconds,
shows ranked actions with a one-line reason each, captures the outcome, and writes
to the interaction log in time for the next decision.

---

## Spine 6 — The admin makes the product theirs

*This spine is the differentiator and it must not be last in practice — pull the
form-descriptor slice from it into Spine 1.*

An admin can add a custom field to an entity and see it appear in the form with
validation, no code change. Reorder panels on a persona workspace and save it as a
versioned layout. Install a theme package and rebrand. Install a node package and
use the node on the canvas. Scope a role to one objective.

---

## Spine 7 — The operator runs it

Health, throughput, p95 by tenant, cost per thousand decisions, the degradation
ladder visible and testable, incident view, rollback from the operator console.

---

## Spine 8 — The executive sees value

Value delivered, adoption by persona, cost trend, risk posture. Every number on
this screen clicks through to its trace or its source query. No unexplained
figures.

---

## Ordering note

Spines 1–3 in strict order. 4–8 resequence on the product owner's call, with one
exception: the form-descriptor and layout-manifest slices from Spine 6 move into
Spine 1. Building hand-coded forms in Spine 1 and retrofitting metadata later is
the single most expensive mistake available in this codebase.
