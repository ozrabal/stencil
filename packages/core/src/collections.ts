// CollectionManager — thin layer over StorageProvider for collection operations.
// Full implementation in Epic 7.
import type { StorageProvider, Template } from './types.js';

/**
 * Manages template collections (subdirectory-based grouping).
 * Full implementation in Epic 7.
 */
export class CollectionManager {
  constructor(private readonly storage: StorageProvider) {}

  listCollections(): Promise<string[]> {
    // TODO: derive collection names from StorageProvider (Epic 7)
    void this.storage;
    return Promise.resolve([]);
  }

  createCollection(_name: string): Promise<void> {
    // TODO: implement (Epic 7)
    return Promise.reject(new Error('Not implemented'));
  }

  moveToCollection(_templateName: string, _collectionName: string): Promise<void> {
    // TODO: implement (Epic 7)
    return Promise.reject(new Error('Not implemented'));
  }

  removeCollection(_name: string): Promise<void> {
    // TODO: implement (Epic 7)
    return Promise.reject(new Error('Not implemented'));
  }

  listTemplatesInCollection(_collectionName: string): Promise<Template[]> {
    // TODO: implement (Epic 7)
    return Promise.reject(new Error('Not implemented'));
  }
}
