// LocalStorageProvider — filesystem-based StorageProvider (stub).
// Full implementation in Epic 6.
import type { ListOptions, StorageProvider, Template } from './types.js';

/**
 * Local filesystem-based storage provider.
 * Reads and writes templates as .md files under a project directory.
 * Full implementation in Epic 6.
 */
export class LocalStorageProvider implements StorageProvider {
  constructor(
    private readonly projectDir: string,
    private readonly globalDir?: string,
  ) {}

  listTemplates(_options?: ListOptions): Promise<Template[]> {
    // TODO: implement recursive .md scan (Epic 6)
    return Promise.reject(new Error('Not implemented'));
  }

  getTemplate(_name: string): Promise<null | Template> {
    // TODO: implement (Epic 6)
    return Promise.reject(new Error('Not implemented'));
  }

  saveTemplate(_template: Template): Promise<void> {
    // TODO: implement serialize + mkdir + write (Epic 6)
    return Promise.reject(new Error('Not implemented'));
  }

  deleteTemplate(_name: string): Promise<boolean> {
    // TODO: implement (Epic 6)
    return Promise.reject(new Error('Not implemented'));
  }

  templateExists(_name: string): Promise<boolean> {
    // TODO: implement (Epic 6)
    return Promise.reject(new Error('Not implemented'));
  }
}
