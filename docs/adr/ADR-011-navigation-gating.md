# ADR-011: Navigation Gating — Personas Open Groups, Permissions Open Screens

**Status:** Accepted  
**Decision Date:** 2026-09-08  
**Deciders:** Product, Architecture  
**Affected Component:** `apps/console` — `lib/nav/build-nav.ts`, `lib/nav/persona-manifest.ts`, `components/nav-rail.tsx`

---

## Context

The console's navigation is generated, not authored: the persona manifest
(`docs/METIS_CONSOLE_SPEC.md` Part 2, declared in `lib/nav/persona-manifest.ts`)
is joined with the routes that exist (`lib/nav/routes.generated.ts`, read from
the filesystem) and the signed-in user. The spec tags each **group** with the
personas that own it — Catalogue is the marketer's, Evidence is the compliance
officer's, Administration is the admin's. The platform, meanwhile, authorises by
fine-grained **permission** — `view:offers`, `view:decisions`, `approve:changes`
— enforced server-side and, until this change, used to hide individual nav items.

The two models had to be reconciled in one function, because a rail that
disagrees with the API about what a person may see is a rail that either hides
work they are allowed to do or advertises work they are not.

Two facts about the fixture accounts made the choice concrete:

- The administrator, Marcus Webb, holds `admin` and `architect`. He is not
  tagged compliance, so a persona-only rule hides Evidence from him — the audit
  log and every decision record, from the one account described as "everything".
- Nobody holds `analyst`. Intelligence is tagged Data Scientist, so a
  persona-only rule makes `/experiments`, a built and tested route, unreachable
  from the rail for every account in the product.

## Decision

Three rules, applied in this order by `buildNav`. Each has a unit test in
`apps/console/tests/unit/nav.test.ts` that goes red when it is broken.

1. **A persona opens its group.** A user holding one of a group's tagged roles
   sees every screen in it that exists and carries no permission, plus every
   permissioned screen whose permission they hold.

2. **A screen permission opens only that screen.** A user holding *no* tagged
   role for a group still sees it if they hold a permission on a screen inside
   it — but the group then shows only the screens they are permitted, not its
   whole surface. A compliance officer with `view:offers` gets Catalogue with
   Offers and Creatives in it, and not Objectives, Categories or Schedule.

3. **`admin` passes every persona gate, and no screen permission.** An
   administrator sees every group that has something in it, but a screen that
   requires a permission they lack is still absent. This widens what an admin
   can *see* to what exists, not what they can *do*.

In every case a group with nothing visible inside it is **hidden, not
disabled**. A disabled group is a promise of something the person cannot
reach; an absent one is not.

### Why strict persona gating was rejected

Strict gating — a group is visible if and only if the user holds a tagged
persona — is the literal reading of the spec, and it was the first thing built.
It was rejected for three reasons:

- **It enforces the weaker statement over the stronger one.** A persona tag on
  a group is a design intention about who a screen is *for*. A permission on a
  user is an authorisation decision about what they *may do*, made by whoever
  administers the tenant and enforced by the server. When the two disagree, a
  rail that follows the tag hides a screen the server would happily serve.

- **It made built work unreachable.** `/experiments` for every account, and
  Evidence for the administrator. A route with no path to it from navigation is
  the defect the generated rail exists to make impossible, and
  `nav.test.ts › the administrator reaches every route the rail can express` is
  the test that caught it.

- **It couples navigation to the fixture roster.** The fix under strict gating
  is to add roles to fixture users or personas to spec groups until the holes
  close — either of which edits the product's declared shape to suit whoever
  happens to be in the seed data today.

### Why not permission-only

The opposite simplification — ignore personas, show any screen the user has a
permission for — was also considered. Most screens carry no permission at all;
they are gated by the persona of their group. Dropping personas would either
show every unpermissioned screen to everyone, or require inventing a permission
for each of ninety screens, most of which do not exist yet.

## Consequences

- Rule 2 means a persona tag is not a wall. A tenant administrator who grants
  `view:decisions` to a marketer has put Decisions in that marketer's Evidence
  group, and should expect to.
- Rule 3 means adding a persona-tagged group to the manifest is enough to put
  it in front of the administrator the moment one of its routes exists. There
  is no admin allow-list to maintain.
- The spec's persona tags are the *default* audience of a group, and the
  manifest documents them as such. They are not a security boundary; the
  server's permission checks are.
- A future Data Scientist fixture account should hold `analyst`. Until one
  exists, Intelligence is reachable only by the administrator, and
  `nav-rail.stories.tsx › Operator — nothing built for this persona yet` shows
  what an unserved persona's rail honestly looks like.
