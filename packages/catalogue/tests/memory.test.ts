import { InMemoryCatalogueStore } from '../src/memory-store';
import { describeCatalogue } from './suite';

describeCatalogue('catalogue in memory', {
  async create() {
    return new InMemoryCatalogueStore();
  },
});
