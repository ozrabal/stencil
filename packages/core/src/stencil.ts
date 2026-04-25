import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type {
  ListOptions,
  ResolutionResult,
  StencilOptions,
  Template,
  TemplateFrontmatter,
  ValidationResult,
} from './types.js';

import { CollectionManager } from './collections.js';
import {
  ContextEngine,
  GitContextProvider,
  ProjectContextProvider,
  SystemContextProvider,
} from './context.js';
import { resolveTemplate } from './resolver.js';
import { LocalStorageProvider } from './storage.js';
import { validateTemplate } from './validator.js';

/**
 * High-level facade for @stencil-pm/core.
 * Wires storage, context resolution, validation, and placeholder resolution.
 */
export class Stencil {
  readonly collections: CollectionManager;
  readonly context: ContextEngine;
  readonly storage: LocalStorageProvider;

  private readonly stencilDir: string;

  constructor(options: StencilOptions) {
    this.stencilDir = path.join(options.projectDir, '.stencil');
    this.storage = new LocalStorageProvider(this.stencilDir, options.globalDir);

    this.context = new ContextEngine();
    this.context.register(new SystemContextProvider());
    this.context.register(new GitContextProvider());
    this.context.register(new ProjectContextProvider());

    for (const provider of options.contextProviders ?? []) {
      this.context.register(provider);
    }

    this.collections = new CollectionManager(this.storage);
  }

  async init(): Promise<void> {
    await mkdir(path.join(this.stencilDir, 'templates'), { recursive: true });
  }

  async resolve(
    templateName: string,
    explicitValues: Record<string, string>,
  ): Promise<ResolutionResult> {
    const template = await this.storage.getTemplate(templateName);
    if (template === null) {
      throw new Error(`Template not found: "${templateName}"`);
    }

    const validation = validateTemplate(template);
    const errorMessages = validation.issues
      .filter((issue) => issue.severity === 'error')
      .map((issue) => issue.message);

    if (errorMessages.length > 0) {
      throw new Error(
        `Template "${templateName}" has validation errors: ${errorMessages.join('; ')}`,
      );
    }

    const context = await this.context.resolveAll();
    return resolveTemplate(template, { context, explicit: explicitValues });
  }

  async create(
    frontmatter: TemplateFrontmatter,
    body: string,
    collection?: string,
  ): Promise<Template> {
    const template: Template = {
      body,
      filePath: '',
      frontmatter,
      source: 'project',
    };
    if (collection !== undefined) {
      template.collection = collection;
    }

    const validation = validateTemplate(template);
    const errorMessages = validation.issues
      .filter((issue) => issue.severity === 'error')
      .map((issue) => issue.message);

    if (errorMessages.length > 0) {
      throw new Error(`Cannot create template: ${errorMessages.join('; ')}`);
    }

    await this.storage.saveTemplate(template);

    return (await this.storage.getTemplate(frontmatter.name)) ?? template;
  }

  async list(options?: ListOptions): Promise<Template[]> {
    return this.storage.listTemplates(options);
  }

  async get(name: string): Promise<null | Template> {
    return this.storage.getTemplate(name);
  }

  async delete(name: string): Promise<boolean> {
    return this.storage.deleteTemplate(name);
  }

  async validate(templateName: string): Promise<ValidationResult> {
    const template = await this.storage.getTemplate(templateName);
    if (template === null) {
      return {
        issues: [{ message: `Template not found: "${templateName}"`, severity: 'error' }],
        valid: false,
      };
    }

    return validateTemplate(template);
  }

  async search(query: string): Promise<Template[]> {
    return this.storage.listTemplates({ searchQuery: query });
  }
}
