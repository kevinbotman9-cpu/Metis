import { InMemoryLedgerStore } from '../src/memory-store';
import { describeLedger } from './suite';

describeLedger('ledger in memory', {
  async create() {
    return new InMemoryLedgerStore();
  },
});
