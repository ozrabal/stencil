// Collection management: groups templates under a named scope.
import type { Collection, StorageProvider } from './types.js';

/**
 * Loads all templates from a directory and returns a Collection.
 */
export function loadCollection(
  name: string,
  _directory: string,
  _storage: StorageProvider,
): Promise<Collection> {
  // TODO: implement collection loading
  return Promise.resolve({ name, templates: [] });
}
