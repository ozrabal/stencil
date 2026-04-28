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
import type { StencilConfig } from './types.js';

import { CollectionManager } from './collections.js';
import { loadStencilConfig } from './config.js';
import {
  ConfigContextProvider,
  ContextEngine,
  GitContextProvider,
  ProjectContextProvider,
  SystemContextProvider,
} from './context.js';
import { resolveGlobalStencilDir } from './paths.js';
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

  private readonly configOverrides: Partial<StencilConfig> | undefined;
  private readonly globalDir: string | undefined;
  private readonly stencilDir: string;
  private runtimeConfig: StencilConfig | undefined;
  private runtimeInitPromise: Promise<void> | undefined;

  constructor(options: StencilOptions) {
    this.stencilDir = path.join(options.projectDir, '.stencil');
    this.globalDir = resolveGlobalStencilDir(options.globalDir);
    this.configOverrides = options.config;
    this.storage = new LocalStorageProvider(this.stencilDir, this.globalDir);

    this.context = new ContextEngine();
    this.context.register(new SystemContextProvider());
    this.context.register(new GitContextProvider());
    this.context.register(new ProjectContextProvider());
    this.context.register(
      new ConfigContextProvider(async () => {
        await this.ensureRuntimeReady();
        return this.runtimeConfig?.customContext ?? {};
      }),
    );

    for (const provider of options.contextProviders ?? []) {
      this.context.register(provider);
    }

    this.collections = new CollectionManager(this.storage);
  }

  async init(): Promise<void> {
    await this.ensureRuntimeReady();
    await mkdir(path.join(this.stencilDir, 'templates'), { recursive: true });
  }

  async resolve(
    templateName: string,
    explicitValues: Record<string, string>,
  ): Promise<ResolutionResult> {
    await this.ensureRuntimeReady();

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
    await this.ensureRuntimeReady();

    const template: Template = {
      body,
      filePath: '',
      frontmatter,
      source: 'project',
    };
    const resolvedCollection = collection ?? this.runtimeConfig?.defaultCollection;
    if (resolvedCollection !== undefined) {
      template.collection = resolvedCollection;
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

  private async ensureRuntimeReady(): Promise<void> {
    if (this.runtimeConfig) {
      return;
    }

    if (!this.runtimeInitPromise) {
      this.runtimeInitPromise = this.initializeRuntime().catch((error) => {
        this.runtimeInitPromise = undefined;
        throw error;
      });
    }

    await this.runtimeInitPromise;
  }

  private async initializeRuntime(): Promise<void> {
    this.runtimeConfig = await loadStencilConfig(
      this.stencilDir,
      this.globalDir,
      this.configOverrides,
    );
  }
}
