import type { EntityDescriptor } from '../types';

/**
 * A change set, declared for reading — never for writing.
 *
 * **Nobody edits a change set as a form.** One is raised by the change it
 * proposes, and decided by approving or rejecting it. So there is no binding
 * write, no screen offers create or edit, and the create and edit copy below
 * exists only because the descriptor type requires it, as `TenantSettings`'
 * create copy does.
 *
 * It is in the registry because `/approvals` is a list–detail screen, and the
 * renderer reads an entity's words — its name, its fields' labels, its closed
 * sets — from its descriptor. The alternative was a second place to keep a
 * change set's labels, which is what descriptors exist to prevent, and the
 * drift check now holds these labels to the schema like any other.
 */
export const changeSetDescriptor: EntityDescriptor = {
  entity: 'ChangeSet',
  noun: { singular: 'change set', plural: 'change sets' },

  create: {
    title: 'Change set',
    description: 'A change set is raised by the change it proposes, not created as a form.',
    submitLabel: 'Raise change set',
  },
  edit: {
    description: 'A change set is decided by approving or rejecting it, not edited.',
    submitLabel: 'Save change set',
  },

  groups: [
    { key: 'proposal', label: 'The proposal', order: 10, columns: 2 },
    { key: 'decision', label: 'The decision', order: 20, columns: 2 },
  ],

  fields: [
    { field: 'title', type: 'text', label: 'Title', group: 'proposal', order: 10 },
    { field: 'description', type: 'textarea', label: 'Description', group: 'proposal', order: 20, span: 2 },
    { field: 'changeType', type: 'text', label: 'Change type', group: 'proposal', order: 30 },
    {
      field: 'autonomyTier',
      type: 'select',
      label: 'Autonomy tier',
      help: 'The tier the change was raised under, which decides who may approve it.',
      group: 'proposal',
      order: 40,
      options: {
        static: [
          { value: '1', label: 'Tier 1' },
          { value: '2', label: 'Tier 2' },
          { value: '3', label: 'Tier 3' },
        ],
      },
    },
    { field: 'requestedBy', type: 'text', label: 'Raised by', group: 'proposal', order: 50 },
    { field: 'requestedAt', type: 'date', label: 'Raised', group: 'proposal', order: 60 },
    {
      field: 'status',
      type: 'select',
      label: 'Status',
      group: 'decision',
      order: 10,
      options: {
        static: [
          { value: 'pending', label: 'Pending — waiting on a decision', short: 'Pending' },
          { value: 'approved', label: 'Approved', short: 'Approved' },
          { value: 'rejected', label: 'Rejected', short: 'Rejected' },
          { value: 'withdrawn', label: 'Withdrawn by whoever raised it', short: 'Withdrawn' },
        ],
      },
    },
    { field: 'decidedBy', type: 'text', label: 'Decided by', group: 'decision', order: 20 },
    { field: 'decidedAt', type: 'date', label: 'Decided', group: 'decision', order: 30 },
    { field: 'decisionReason', type: 'textarea', label: 'Reason', group: 'decision', order: 40, span: 2 },
  ],

  unmanaged: [
    { field: 'id', reason: 'Server-assigned when the change is raised; shown as the row subtitle.' },
    {
      field: 'targetScope',
      reason: 'Shown beside the diff it scopes, where it says what the change applies to.',
    },
    {
      field: 'diff',
      reason: 'Shown as a before-and-after table. A form could not honestly edit what somebody else proposed.',
    },
    {
      field: 'simulation',
      reason: 'Shown with the diff: the population replayed, the margin impact and the bias ratio a decision rests on.',
    },
  ],
};
