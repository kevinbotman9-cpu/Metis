import { InMemoryGovernanceStore } from '../src/memory-store';
import { describeGovernance } from './suite';

describeGovernance('governance in memory', {
  async create() {
    return new InMemoryGovernanceStore();
  },
});
