import type { Meta, StoryObj } from '@storybook/react';
import { NavRail } from './nav-rail';
import { buildNav } from '@/lib/nav/build-nav';
import { PERSONA_MANIFEST } from '@/lib/nav/persona-manifest';
import { ROUTES } from '@/lib/nav/routes.generated';
import { users } from '@/mocks/fixtures/catalogue';

/**
 * Switch theme and density in the toolbar to see all four axes.
 *
 * Every story is the real join — the real manifest, the generated route list,
 * a real fixture account — so a story that looks wrong is the rail being
 * wrong, not a story drifting from it. There is no `nav` arg to hand-write.
 *
 * The state worth looking at hardest is Priya's. She is compliance only, so
 * the persona tags alone would hide Catalogue from her; she appears in it
 * because she holds `view:offers`, which is rule 4's second clause in
 * build-nav.ts doing its job.
 */
const meta: Meta<typeof NavRail> = {
  title: 'Shell/NavRail',
  component: NavRail,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      // The rail lives on the frame, which is dark in both themes.
      <div className="flex min-h-screen bg-rail" data-rail>
        <Story />
        <div className="flex-1 bg-page" />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof NavRail>;

const account = (email: string) => {
  const u = users.find((x) => x.email === email);
  if (!u) throw new Error(`no fixture account ${email}`);
  return { roles: u.roles, permissions: u.permissions };
};

const marcus = buildNav(PERSONA_MANIFEST, ROUTES, account('marcus.webb@telco.example'));
const sarah = buildNav(PERSONA_MANIFEST, ROUTES, account('sarah.chen@telco.example'));
const priya = buildNav(PERSONA_MANIFEST, ROUTES, account('priya.natarajan@telco.example'));

export const Administrator: Story = {
  args: { nav: marcus, pathname: '/decisions', approvalCount: 2 },
  name: 'Administrator, on Decisions',
};

export const ArchitectMarketer: Story = {
  args: { nav: sarah, pathname: '/arbitration' },
  name: 'Architect and marketer, on Arbitration — no Administration group',
};

export const ComplianceOfficer: Story = {
  args: { nav: priya, pathname: '/audit', approvalCount: 2 },
  name: 'Compliance officer — Policy hidden, not disabled',
};

export const ThirdLevel: Story = {
  args: { nav: marcus, pathname: '/data-model/intake' },
  name: 'Third level open — Administration › Data › Intake',
};

export const Collapsed: Story = {
  args: { nav: marcus, pathname: '/decisions', collapsed: true },
  name: 'Collapsed to the 48px icon rail',
};

/**
 * A persona with nothing built for them yet. Operator holds no route today,
 * so an operator who is only an operator sees Overview and nothing else —
 * which is the honest rail, and the reason the group is hidden rather than
 * shown empty.
 */
export const OperatorOnly: Story = {
  args: {
    nav: buildNav(PERSONA_MANIFEST, ROUTES, { roles: ['operator'], permissions: [] }),
    pathname: '/',
  },
  name: 'Operator — nothing built for this persona yet',
};
