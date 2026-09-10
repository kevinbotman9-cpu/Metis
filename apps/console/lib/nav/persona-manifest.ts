import type { Role } from '@/components/auth-provider';

/**
 * The navigation tree from docs/METIS_CONSOLE_SPEC.md Part 2, declared once.
 *
 * This is the complete surface area, not the built one. A screen appears in
 * the rail only when its `href` is in lib/nav/routes.generated.ts — the list of
 * page.tsx files that exist — so declaring a screen here is not a claim that it
 * exists. That join is `buildNav` in ./build-nav.ts, and it is the only place
 * the two are put together; there is no other nav array anywhere.
 *
 * Three levels: group → section → screen. A section may itself be a screen
 * (Decision flows is a route and has Flow versions beneath it), or a pure
 * heading (Features has no page of its own). Anything deeper is flattened to a
 * sibling rather than nested a fourth level, which is why Inbound traffic sits
 * beside Connectors rather than under it.
 *
 * Personas gate groups. The spec's bracketed tags map onto the roles the API
 * declares: Marketer → marketer, Decision Architect → architect, Data
 * Scientist and Executive → analyst, Operator → operator, Compliance Officer →
 * compliance, Admin → admin. Permissions gate screens, as they did before.
 *
 * Labels are the words on the page's own heading. The spec was brought into
 * line with the running product on 2026-09-08 rather than the other way round
 * — a rail that says "Decision records" over a screen titled "Decisions" is a
 * rail that lies. If a page is renamed, rename it here in the same change.
 *
 * The group gating rules are ADR-011.
 */

export interface ScreenNode {
  label: string;
  href: string;
  /** Permission required to see this screen. Omitted means any signed-in user. */
  permission?: string;
  /** A count worth interrupting for. Rendered as the pill. */
  badge?: 'approvals';
  /** Screens beneath this one. Only a section carries these. */
  children?: ScreenNode[];
}

/** A heading with no page of its own, holding screens. */
export interface HeadingNode {
  label: string;
  href?: undefined;
  children: ScreenNode[];
}

export type SectionNode = ScreenNode | HeadingNode;

export type GroupIcon =
  | 'overview'
  | 'catalogue'
  | 'policy'
  | 'decisioning'
  | 'intelligence'
  | 'journeys'
  | 'channels'
  | 'simulation'
  | 'evidence'
  | 'releases'
  | 'insights'
  | 'operations'
  | 'administration';

export interface GroupNode {
  label: string;
  icon: GroupIcon;
  /** Roles that own this group. `'all'` means every signed-in persona. */
  personas: readonly Role[] | 'all';
  children: SectionNode[];
}

export const PERSONA_MANIFEST: readonly GroupNode[] = [
  {
    label: 'Overview',
    icon: 'overview',
    personas: 'all',
    children: [{ label: 'Home', href: '/' }],
  },
  {
    label: 'Catalogue',
    icon: 'catalogue',
    personas: ['marketer'],
    children: [
      // Gated the same way as Offers and Creatives below. Without a permission
      // a screen in this group is admitted by persona alone, which would have
      // shown the taxonomy to a marketer and hidden it from a compliance
      // officer who can already see every offer filed under it.
      { label: 'Objectives', href: '/objectives', permission: 'view:offers' },
      // Categories are authored from inside the objective that owns them, per
      // the console spec's "Objectives … owns categories". This entry stays
      // because a flat list across objectives is a different screen and a
      // reasonable one; it has no route yet, so the rail does not show it.
      { label: 'Categories', href: '/categories' },
      { label: 'Offers', href: '/offers', permission: 'view:offers' },
      { label: 'Creatives', href: '/creatives', permission: 'view:offers' },
      { label: 'Actions', href: '/actions' },
      { label: 'Content library', href: '/content-library' },
      { label: 'Schedule', href: '/schedule' },
    ],
  },
  {
    label: 'Policy',
    icon: 'policy',
    personas: ['marketer', 'architect'],
    children: [
      {
        // Rows 8 and 9 of the 2026-09-10 authorisation review. `edit:policies`
        // already gated authoring on both; the read was open to anyone signed
        // in. Sarah gained `view:policies` in the same change — Policy is
        // tagged to her personas and she is the decision architect the group
        // exists for, so a gate that emptied it for her meant the fixture was
        // wrong, not the permission.
        label: 'Targeting policies',
        href: '/targeting-policies',
        permission: 'view:policies',
        children: [
          { label: 'Eligibility', href: '/targeting-policies/eligibility' },
          { label: 'Relevance', href: '/targeting-policies/relevance' },
          { label: 'Suitability', href: '/targeting-policies/suitability' },
        ],
      },
      { label: 'Frequency policy', href: '/frequency-policy', permission: 'view:policies' },
      { label: 'Consent & permissions', href: '/consent' },
      // Boosts are edited on Decisioning › Arbitration & boosts.
      { label: 'Constraints', href: '/constraints' },
    ],
  },
  {
    label: 'Decisioning',
    icon: 'decisioning',
    personas: ['architect'],
    children: [
      {
        label: 'Decision flows',
        href: '/decision-flows',
        permission: 'view:flows',
        children: [{ label: 'Flow versions', href: '/decision-flows/versions' }],
      },
      { label: 'Ranking functions', href: '/ranking-functions' },
      { label: 'Arbitration & boosts', href: '/arbitration', permission: 'view:flows' },
      // Declared because the page already enforces it. `/placements` guarded
      // `view:flows` from the day it was built while the manifest said
      // nothing, so the rail offered the link to anyone in the Decisioning
      // group and the page refused whoever followed it without the
      // permission. The declaration changes who can reach the screen not at
      // all; it stops the rail advertising a wall.
      { label: 'Placements', href: '/placements', permission: 'view:flows' },
      { label: 'Node library', href: '/node-library' },
    ],
  },
  {
    label: 'Intelligence',
    icon: 'intelligence',
    personas: ['analyst'],
    children: [
      { label: 'Models', href: '/models' },
      { label: 'Adaptive models', href: '/adaptive-models' },
      {
        label: 'Features',
        children: [
          { label: 'Definitions', href: '/features/definitions' },
          { label: 'Freshness', href: '/features/freshness' },
        ],
      },
      { label: 'Drift monitors', href: '/drift' },
      { label: 'Experiments', href: '/experiments', permission: 'view:flows' },
      { label: 'Propensity explorer', href: '/propensity' },
    ],
  },
  {
    label: 'Journeys',
    icon: 'journeys',
    personas: ['marketer'],
    children: [
      { label: 'Journeys', href: '/journeys' },
      { label: 'Triggers & events', href: '/journeys/triggers' },
      { label: 'Journey performance', href: '/journeys/performance' },
    ],
  },
  {
    label: 'Channels',
    icon: 'channels',
    personas: ['marketer', 'operator'],
    children: [
      { label: 'Channel packages', href: '/channels' },
      { label: 'Inbound placements', href: '/channels/inbound' },
      { label: 'Outbound schedules', href: '/channels/outbound' },
      { label: 'Always-on outbound', href: '/channels/always-on' },
      { label: 'Paid audiences', href: '/channels/paid' },
      { label: 'Agent assist', href: '/channels/agent-assist' },
      { label: 'Batch runs', href: '/channels/batch' },
      { label: 'Delivery log', href: '/channels/delivery' },
    ],
  },
  {
    label: 'Simulation',
    icon: 'simulation',
    personas: ['architect', 'compliance'],
    children: [
      { label: 'Simulations', href: '/simulations', permission: 'view:flows' },
      { label: 'Version comparison', href: '/simulations/compare' },
      { label: 'Under-served analysis', href: '/simulations/under-served' },
      { label: 'Bias check', href: '/simulations/bias' },
      { label: 'Counterfactual', href: '/simulations/counterfactual' },
      { label: 'Test fixtures', href: '/simulations/fixtures' },
    ],
  },
  {
    label: 'Evidence',
    icon: 'evidence',
    personas: ['compliance'],
    children: [
      { label: 'Decisions', href: '/decisions', permission: 'view:decisions' },
      { label: 'Trace reader', href: '/evidence/trace' },
      { label: 'Replay', href: '/evidence/replay' },
      { label: 'Audit log', href: '/audit', permission: 'view:audit' },
      { label: 'Bias evidence', href: '/evidence/bias' },
      { label: 'Consent evidence', href: '/evidence/consent' },
      { label: 'Model documentation', href: '/evidence/models' },
      { label: 'Export', href: '/evidence/export' },
    ],
  },
  {
    label: 'Releases',
    icon: 'releases',
    personas: ['architect', 'compliance'],
    children: [
      { label: 'Change sets', href: '/change-sets' },
      { label: 'Approvals', href: '/approvals', badge: 'approvals' },
      { label: 'Environments', href: '/environments' },
      { label: 'Shadow comparison', href: '/shadow' },
      { label: 'Release history', href: '/releases' },
      { label: 'Rollback', href: '/rollback' },
    ],
  },
  {
    label: 'Insights',
    icon: 'insights',
    personas: ['analyst', 'marketer'],
    children: [
      { label: 'Performance', href: '/performance', permission: 'view:decisions' },
      { label: 'Attribution', href: '/insights/attribution' },
      { label: 'Value', href: '/insights/value' },
      { label: 'Cost', href: '/insights/cost' },
      { label: 'Adoption', href: '/insights/adoption' },
    ],
  },
  {
    label: 'Operations',
    icon: 'operations',
    personas: ['operator'],
    children: [
      { label: 'Health', href: '/operations/health' },
      { label: 'Latency & throughput', href: '/operations/latency' },
      { label: 'Degradation', href: '/operations/degradation' },
      { label: 'Incidents', href: '/operations/incidents' },
      { label: 'Alerts', href: '/operations/alerts' },
      { label: 'Capacity', href: '/operations/capacity' },
    ],
  },
  {
    label: 'Administration',
    icon: 'administration',
    personas: ['admin'],
    children: [
      {
        label: 'Extensibility',
        children: [
          { label: 'Packs', href: '/admin/packs' },
          { label: 'Packages', href: '/admin/packages' },
          { label: 'Package registry', href: '/admin/package-registry' },
          // `view:integrations` was added to the vocabulary on 2026-09-10
          // rather than gating these on `edit:integrations`. Gating a read
          // behind a write permission means nobody can look without being able
          // to change, which on a compliance-first product is backwards.
          { label: 'Integrations', href: '/integrations', permission: 'view:integrations' },
          { label: 'Inbound traffic', href: '/integrations/traffic', permission: 'view:integrations' },
        ],
      },
      {
        label: 'Appearance',
        children: [
          { label: 'Themes', href: '/admin/themes' },
          { label: 'Layouts', href: '/admin/layouts' },
          { label: 'Form descriptors', href: '/admin/form-descriptors' },
        ],
      },
      {
        label: 'Access',
        children: [
          { label: 'Personas & workspaces', href: '/admin/personas' },
          { label: 'Roles & permissions', href: '/admin/roles' },
          { label: 'Users', href: '/admin/users' },
          // The autonomy ladder and its guardrails: access control for agents.
          { label: 'Agentic AI', href: '/agentic', permission: 'view:autonomy' },
        ],
      },
      {
        label: 'Data',
        children: [
          // Data model stays ungated deliberately: it is the profile *schema*
          // — field names and types — not a customer's values, and the only
          // permission that half fits is `view:flows`, which would be gating it
          // on the wrong thing. Intake is different: it writes.
          { label: 'Data model', href: '/data-model' },
          { label: 'Intake', href: '/data-model/intake', permission: 'view:integrations' },
          { label: 'Profile store', href: '/admin/profile-store' },
          { label: 'Consent taxonomy', href: '/admin/consent-taxonomy' },
        ],
      },
      {
        // `/settings` was filed here and is not a tenancy screen: it is
        // Account, Appearance and Environment — the signed-in user's own
        // identity and theme. It is reached from the account panel in the
        // header band, with the appearance controls it belongs beside. See
        // PERSONAL_ROUTES below.
        label: 'Tenancy',
        children: [
          { label: 'Tenants', href: '/admin/tenants' },
          { label: 'Residency', href: '/admin/residency' },
        ],
      },
    ],
  },
];

/**
 * Screens reached from the account panel rather than the navigation rail.
 *
 * A personal screen is not a smaller administration screen. `/settings` holds
 * the signed-in user's own name, colour scheme, density and which environment
 * they are looking at; it was filed under Administration › Tenancy, beside
 * Tenants and Residency, which put a personal preference behind a heading that
 * reads as a permission boundary and left the 2026-09-10 authorisation review
 * asking what to gate it on. Nothing: it is yours.
 *
 * `tests/unit/nav.test.ts` allows these to be absent from the tree above; every
 * other route must appear in it.
 */
export const PERSONAL_ROUTES: readonly string[] = ['/settings'];
