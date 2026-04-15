// StorageProvider interface and LocalStorage implementation.
import type { StorageProvider } from './types.js';

/**
 * Local filesystem-based storage provider.
 */
export class LocalStorageProvider implements StorageProvider {
  deleteTemplate(_filePath: string): Promise<void> {
    // TODO: implement using fs/promises
    return Promise.reject(new Error('Not implemented'));
  }

  listTemplates(_directory: string): Promise<string[]> {
    // TODO: implement using fs/promises
    return Promise.reject(new Error('Not implemented'));
  }

  readTemplate(_filePath: string): Promise<string> {
    // TODO: implement using fs/promises
    return Promise.reject(new Error('Not implemented'));
  }

  writeTemplate(_filePath: string, _content: string): Promise<void> {
    // TODO: implement using fs/promises
    return Promise.reject(new Error('Not implemented'));
  }
}
