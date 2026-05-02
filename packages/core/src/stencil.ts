import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { PlaceholderDelimiters } from './placeholders.js';
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
import {
  StencilErrorCode,
  StorageOperationError,
  TemplateConflictError,
  TemplateValidationError,
} from './errors.js';
import { TemplateNotFoundError } from './parser.js';
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
      throw new TemplateNotFoundError(templateName, { templateName });
    }

    this.assertMutationIsValid(
      template,
      'resolve',
      `Template "${templateName}" has validation errors`,
    );

    const context = await this.context.resolveAll();
    return resolveTemplate(
      template,
      { context, explicit: explicitValues },
      {
        delimiters: this.getRuntimeDelimiters(),
      },
    );
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

    this.assertMutationIsValid(template, 'create', 'Cannot create template');

    await this.storage.saveTemplate(template);

    return (await this.storage.getTemplate(frontmatter.name)) ?? template;
  }

  async update(name: string, patch: UpdateTemplateInput): Promise<Template> {
    await this.ensureRuntimeReady();

    const existingTemplate = await this.storage.getProjectTemplate(name);
    if (existingTemplate === null) {
      const visibleTemplate = await this.storage.getTemplate(name);
      if (visibleTemplate?.source === 'global') {
        throw this.createMutationNotAllowedError(
          `Template "${name}" exists in the global directory only and cannot be updated.`,
          'update',
          { sourceScope: 'global', templateName: name },
        );
      }

      throw new TemplateNotFoundError(name, { templateName: name });
    }

    const candidate = this.applyTemplatePatch(existingTemplate, patch);
    this.assertMutationIsValid(candidate, 'update', `Cannot update template "${name}"`);

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
      throw this.createMutationNotAllowedError(
        'Copy source and target names must be different.',
        'copy',
        { targetName, templateName: sourceName },
      );
    }

    const sourceTemplate = await this.storage.getTemplate(sourceName);
    if (sourceTemplate === null) {
      throw new TemplateNotFoundError(sourceName, { templateName: sourceName });
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
    this.assertMutationIsValid(
      candidate,
      'copy',
      `Cannot copy template "${sourceName}" to "${targetName}"`,
    );

    const visibleTarget = await this.storage.getTemplate(targetName);
    if (visibleTarget !== null) {
      if (visibleTarget.source === 'global') {
        throw this.createMutationNotAllowedError(
          `Template "${targetName}" exists in the global directory and cannot be overwritten.`,
          'copy',
          { targetName, targetScope: 'global', templateName: sourceName },
        );
      }

      if (options.overwrite !== true) {
        throw this.createAlreadyExistsError(
          `Template "${targetName}" already exists in the project directory.`,
          'copy',
          { targetName, targetScope: 'project', templateName: sourceName },
        );
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
      throw this.createMutationNotAllowedError(
        'Rename source and target names must be different.',
        'rename',
        { targetName, templateName: sourceName },
      );
    }

    const sourceTemplate = await this.storage.getProjectTemplate(sourceName);
    if (sourceTemplate === null) {
      const visibleTemplate = await this.storage.getTemplate(sourceName);
      if (visibleTemplate?.source === 'global') {
        throw this.createMutationNotAllowedError(
          `Template "${sourceName}" exists in the global directory only and cannot be renamed.`,
          'rename',
          { sourceScope: 'global', targetName, templateName: sourceName },
        );
      }

      throw new TemplateNotFoundError(sourceName, { templateName: sourceName });
    }

    const visibleTarget = await this.storage.getTemplate(targetName);
    if (visibleTarget !== null) {
      if (visibleTarget.source === 'global') {
        throw this.createMutationNotAllowedError(
          `Template "${targetName}" exists in the global directory and cannot be overwritten.`,
          'rename',
          { targetName, targetScope: 'global', templateName: sourceName },
        );
      }

      if (options.overwrite !== true) {
        throw this.createAlreadyExistsError(
          `Template "${targetName}" already exists in the project directory.`,
          'rename',
          { targetName, targetScope: 'project', templateName: sourceName },
        );
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
    this.assertMutationIsValid(
      candidate,
      'rename',
      `Cannot rename template "${sourceName}" to "${targetName}"`,
    );

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
    await this.ensureRuntimeReady();

    const template = await this.storage.getTemplate(templateName);
    if (template === null) {
      return {
        issues: [{ message: `Template not found: "${templateName}"`, severity: 'error' }],
        valid: false,
      };
    }

    return validateTemplate(template, { delimiters: this.getRuntimeDelimiters() });
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

  private assertMutationIsValid(
    template: Template,
    operation: string,
    messagePrefix: string,
  ): void {
    const validation = validateTemplate(template, {
      delimiters: this.getRuntimeDelimiters(),
    });
    const issues = validation.issues.filter((issue) => issue.severity === 'error');

    if (issues.length > 0) {
      throw new TemplateValidationError(
        `${messagePrefix}: ${issues.map((issue) => issue.message).join('; ')}`,
        operation,
        validation.issues,
        { templateName: template.frontmatter.name },
      );
    }
  }

  private getRuntimeDelimiters(): PlaceholderDelimiters {
    return {
      end: this.runtimeConfig?.placeholderEnd ?? '}}',
      start: this.runtimeConfig?.placeholderStart ?? '{{',
    };
  }

  private async requireProjectTemplate(name: string): Promise<Template> {
    const template = await this.storage.getProjectTemplate(name);
    if (template === null) {
      throw new StorageOperationError(
        `Template not found after save: "${name}"`,
        StencilErrorCode.STORAGE_READ_ERROR,
        'read-after-save',
        { templateName: name },
      );
    }

    return template;
  }

  private createAlreadyExistsError(
    message: string,
    operation: string,
    options: {
      targetName?: string;
      targetScope?: string;
      templateName?: string;
    },
  ): TemplateConflictError {
    const errorOptions: {
      targetName?: string;
      targetScope?: string;
      templateName?: string;
    } = {};

    if (options.targetName !== undefined) {
      errorOptions.targetName = options.targetName;
    }
    if (options.targetScope !== undefined) {
      errorOptions.targetScope = options.targetScope;
    }
    if (options.templateName !== undefined) {
      errorOptions.templateName = options.templateName;
    }

    return new TemplateConflictError(
      message,
      StencilErrorCode.TEMPLATE_ALREADY_EXISTS,
      operation,
      errorOptions,
    );
  }

  private createMutationNotAllowedError(
    message: string,
    operation: string,
    options: {
      sourceScope?: string;
      targetName?: string;
      targetScope?: string;
      templateName?: string;
    },
  ): TemplateConflictError {
    const errorOptions: {
      sourceScope?: string;
      targetName?: string;
      targetScope?: string;
      templateName?: string;
    } = {};

    if (options.sourceScope !== undefined) {
      errorOptions.sourceScope = options.sourceScope;
    }
    if (options.targetName !== undefined) {
      errorOptions.targetName = options.targetName;
    }
    if (options.targetScope !== undefined) {
      errorOptions.targetScope = options.targetScope;
    }
    if (options.templateName !== undefined) {
      errorOptions.templateName = options.templateName;
    }

    return new TemplateConflictError(
      message,
      StencilErrorCode.TEMPLATE_MUTATION_NOT_ALLOWED,
      operation,
      errorOptions,
    );
  }
}
