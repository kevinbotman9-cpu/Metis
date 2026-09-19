import { InMemoryKeyStore } from '../src';
import { describeKeyStore } from './suite';

describeKeyStore('key store in memory', {
  async create() {
    return new InMemoryKeyStore();
  },
});
