// CollectionManager — thin orchestration layer over LocalStorageProvider.
// Architecture §3.8
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import type { LocalStorageProvider } from './storage.js';
import type { Template } from './types.js';

import { StencilErrorCode, TemplateConflictError } from './errors.js';
import { TemplateNotFoundError } from './parser.js';

/**
 * Manages template collections (subdirectory-based grouping).
 * Thin layer over LocalStorageProvider for collection CRUD.
 *
 * Collections map to subdirectories:
 *   <projectDir>/collections/<collection-name>/<template-name>.md
 */
export class CollectionManager {
  constructor(private readonly storage: LocalStorageProvider) {}

  /**
   * Returns all collection names in the project directory.
   * Derived from subdirectory names under <projectDir>/collections/.
   * Includes empty collections created by createCollection().
   * Returns [] if the collections directory does not exist.
   */
  async listCollections(): Promise<string[]> {
    const collectionsDir = path.join(this.storage.getProjectDir(), 'collections');

    try {
      const entries = await readdir(collectionsDir, { withFileTypes: true });

      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  /**
   * Creates a new collection directory.
   * Idempotent: calling twice for the same name is safe.
   */
  async createCollection(name: string): Promise<void> {
    const collectionDir = path.join(this.storage.getProjectDir(), 'collections', name);
    await mkdir(collectionDir, { recursive: true });
  }

  /**
   * Moves a template into a collection.
   * Deletes the template from its current location and re-saves it under the new collection.
   * Throws if the template does not exist in the project directory.
   */
  async moveToCollection(templateName: string, collectionName: string): Promise<void> {
    const template = await this.storage.getTemplate(templateName);
    if (template === null) {
      throw new TemplateNotFoundError(templateName, { templateName });
    }

    const deleted = await this.storage.deleteTemplate(templateName);
    if (!deleted) {
      throw new TemplateConflictError(
        `Template "${templateName}" exists in the global directory only and cannot be moved.`,
        StencilErrorCode.TEMPLATE_MUTATION_NOT_ALLOWED,
        'move-to-collection',
        {
          sourceScope: 'global',
          targetName: collectionName,
          templateName,
        },
      );
    }

    await this.storage.saveTemplate({ ...template, collection: collectionName });
  }

  /**
   * Removes a collection by moving all its project templates to uncategorized,
   * then deleting the collection directory.
   *
   * Templates from the global directory that happen to be in this collection
   * are not affected.
   *
   * Idempotent: if the collection directory does not exist, this is a no-op.
   */
  async removeCollection(name: string): Promise<void> {
    const templates = await this.storage.listTemplates({ collection: name, source: 'project' });

    for (const template of templates) {
      const { collection: _collection, ...uncategorizedTemplate } = template;

      await this.storage.deleteTemplate(template.frontmatter.name);
      await this.storage.saveTemplate(uncategorizedTemplate);
    }

    const collectionDir = path.join(this.storage.getProjectDir(), 'collections', name);
    await rm(collectionDir, { force: true, recursive: true });
  }

  /**
   * Returns all templates currently assigned to the given collection.
   */
  listTemplatesInCollection(collectionName: string): Promise<Template[]> {
    return this.storage.listTemplates({ collection: collectionName });
  }
}
