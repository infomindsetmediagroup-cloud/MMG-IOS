import { createInMemoryKairosPersistenceStore } from './memoryStore';
import type { KairosPersistenceStore } from './repositories';

let store: KairosPersistenceStore | null = null;

export function getKairosPersistenceStore(): KairosPersistenceStore {
  store ??= createInMemoryKairosPersistenceStore();
  return store;
}

export function resetKairosPersistenceStoreForTests(): void {
  store = createInMemoryKairosPersistenceStore();
}
