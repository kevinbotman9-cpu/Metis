/**
 * The seeded outcome projection's read path — ADR-018 §6.
 *
 * The synthetic-customer model moved to `synthetic-customers.ts` in slice 2a,
 * where the seed job applies it through the delivery gate. These re-exports keep
 * the projection readable until slice 3, which moves the reports onto the ledger
 * alone and deletes this file with the committed index.
 */
export { seededOutcomesFor, seededOutcomeMap, POOR_PERFORMER } from './synthetic-customers';
