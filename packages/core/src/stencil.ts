import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type {
  CopyTemplateOptions,
  ListOptions,
  RenameTemplateOptions,
  ResolutionResult,
  StencilOptions,
  Template,
  TemplateFrontmatter,
  UpdateTemplateInput,
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

  async update(name: string, patch: UpdateTemplateInput): Promise<Template> {
    await this.ensureRuntimeReady();

    const existingTemplate = await this.storage.getProjectTemplate(name);
    if (existingTemplate === null) {
      const visibleTemplate = await this.storage.getTemplate(name);
      if (visibleTemplate?.source === 'global') {
        throw new Error(
          `Template "${name}" exists in the global directory only and cannot be updated.`,
        );
      }

      throw new Error(`Template not found: "${name}"`);
    }

    const candidate = this.applyTemplatePatch(existingTemplate, patch);
    this.assertMutationIsValid(candidate, `update template "${name}"`);

    await this.storage.renameProjectTemplate(name, candidate);
    return await this.requireProjectTemplate(candidate.frontmatter.name);
  }

  async copy(
    sourceName: string,
    targetName: string,
    options: CopyTemplateOptions = {},
  ): Promise<Template> {
    await this.ensureRuntimeReady();

    if (sourceName === targetName) {
      throw new Error('Copy source and target names must be different.');
    }

    const sourceTemplate = await this.storage.getTemplate(sourceName);
    if (sourceTemplate === null) {
      throw new Error(`Template not found: "${sourceName}"`);
    }

    const candidate = this.applyTemplatePatch(
      {
        ...sourceTemplate,
        filePath: '',
        frontmatter: {
          ...sourceTemplate.frontmatter,
          name: targetName,
        },
        source: 'project',
      },
      options,
    );
    this.assertMutationIsValid(candidate, `copy template "${sourceName}" to "${targetName}"`);

    const visibleTarget = await this.storage.getTemplate(targetName);
    if (visibleTarget !== null) {
      if (visibleTarget.source === 'global') {
        throw new Error(
          `Template "${targetName}" exists in the global directory and cannot be overwritten.`,
        );
      }

      if (options.overwrite !== true) {
        throw new Error(`Template "${targetName}" already exists in the project directory.`);
      }

      await this.storage.deleteTemplate(targetName);
    }

    await this.storage.saveTemplate(candidate);
    return await this.requireProjectTemplate(targetName);
  }

  async rename(
    sourceName: string,
    targetName: string,
    options: RenameTemplateOptions = {},
  ): Promise<Template> {
    await this.ensureRuntimeReady();

    if (sourceName === targetName) {
      throw new Error('Rename source and target names must be different.');
    }

    const sourceTemplate = await this.storage.getProjectTemplate(sourceName);
    if (sourceTemplate === null) {
      const visibleTemplate = await this.storage.getTemplate(sourceName);
      if (visibleTemplate?.source === 'global') {
        throw new Error(
          `Template "${sourceName}" exists in the global directory only and cannot be renamed.`,
        );
      }

      throw new Error(`Template not found: "${sourceName}"`);
    }

    const visibleTarget = await this.storage.getTemplate(targetName);
    if (visibleTarget !== null) {
      if (visibleTarget.source === 'global') {
        throw new Error(
          `Template "${targetName}" exists in the global directory and cannot be overwritten.`,
        );
      }

      if (options.overwrite !== true) {
        throw new Error(`Template "${targetName}" already exists in the project directory.`);
      }
    }

    const candidate: Template = {
      ...sourceTemplate,
      filePath: '',
      frontmatter: {
        ...sourceTemplate.frontmatter,
        name: targetName,
      },
      source: 'project',
    };
    this.assertMutationIsValid(candidate, `rename template "${sourceName}" to "${targetName}"`);

    await this.storage.renameProjectTemplate(sourceName, candidate, options.overwrite === true);
    return await this.requireProjectTemplate(targetName);
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

  private applyTemplatePatch(
    template: Template,
    patch: {
      body?: string;
      collection?: null | string;
      frontmatter?: Partial<Omit<TemplateFrontmatter, 'name'>>;
    },
  ): Template {
    const nextTemplate: Template = {
      ...template,
      body: patch.body ?? template.body,
      filePath: '',
      frontmatter: {
        ...template.frontmatter,
        ...patch.frontmatter,
      },
      source: 'project',
    };

    if (patch.collection === null) {
      delete nextTemplate.collection;
    } else if (patch.collection !== undefined) {
      nextTemplate.collection = patch.collection;
    }

    return nextTemplate;
  }

  private assertMutationIsValid(template: Template, action: string): void {
    const errorMessages = validateTemplate(template)
      .issues.filter((issue) => issue.severity === 'error')
      .map((issue) => issue.message);

    if (errorMessages.length > 0) {
      throw new Error(`Cannot ${action}: ${errorMessages.join('; ')}`);
    }
  }

  private async requireProjectTemplate(name: string): Promise<Template> {
    const template = await this.storage.getProjectTemplate(name);
    if (template === null) {
      throw new Error(`Template not found after save: "${name}"`);
    }

    return template;
  }
}
