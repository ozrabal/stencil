// LocalStorageProvider: filesystem-based StorageProvider.
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stringify as stringifyYaml } from 'yaml';

import type {
  ListOptions,
  PlaceholderDefinition,
  StorageProvider,
  Template,
  TemplateFrontmatter,
  TemplateSource,
} from './types.js';

import { StencilErrorCode, StorageOperationError, TemplateConflictError } from './errors.js';
import { parseTemplate } from './parser.js';

/**
 * Local filesystem-based storage provider.
 * Reads and writes templates as .md files within a .stencil directory.
 *
 * Directory layout:
 *   templates/<name>.md
 *   collections/<collection>/<name>.md
 */
export class LocalStorageProvider implements StorageProvider {
  constructor(
    private readonly projectDir: string,
    private readonly globalDir?: string,
  ) {}

  /** Returns the absolute path to the project's stencil directory. */
  getProjectDir(): string {
    return this.projectDir;
  }

  async listTemplates(options?: ListOptions): Promise<Template[]> {
    const projectTemplates = await loadTemplatesFromDir(this.projectDir, 'project');
    const globalTemplates = this.globalDir
      ? await loadTemplatesFromDir(this.globalDir, 'global')
      : [];

    const projectNames = new Set(projectTemplates.map((template) => template.frontmatter.name));
    let filtered = [
      ...projectTemplates,
      ...globalTemplates.filter((template) => !projectNames.has(template.frontmatter.name)),
    ];

    if (options?.collection !== undefined) {
      filtered = filtered.filter((template) => template.collection === options.collection);
    }

    if (options?.source !== undefined) {
      filtered = filtered.filter((template) => template.source === options.source);
    }

    if (options?.tags !== undefined && options.tags.length > 0) {
      const tags = new Set(options.tags);
      filtered = filtered.filter((template) =>
        template.frontmatter.tags?.some((tag) => tags.has(tag)),
      );
    }

    if (options?.searchQuery !== undefined && options.searchQuery.length > 0) {
      const query = options.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (template) =>
          template.frontmatter.name.toLowerCase().includes(query) ||
          template.frontmatter.description.toLowerCase().includes(query) ||
          template.frontmatter.tags?.some((tag) => tag.toLowerCase().includes(query)),
      );
    }

    return filtered.sort((a, b) => {
      const collectionCompare = (a.collection ?? '').localeCompare(b.collection ?? '');
      if (collectionCompare !== 0) return collectionCompare;
      return a.frontmatter.name.localeCompare(b.frontmatter.name);
    });
  }

  async getTemplate(name: string): Promise<null | Template> {
    const projectTemplate = await findAndParseTemplate(name, this.projectDir, 'project');
    if (projectTemplate !== null) return projectTemplate;

    if (this.globalDir !== undefined) {
      return findAndParseTemplate(name, this.globalDir, 'global');
    }

    return null;
  }

  async getProjectTemplate(name: string): Promise<null | Template> {
    return findAndParseTemplate(name, this.projectDir, 'project');
  }

  async saveTemplate(template: Template): Promise<void> {
    const filePath = resolveTemplatePath(this.projectDir, template);
    try {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, serializeTemplate(template), 'utf8');
    } catch (error) {
      throw new StorageOperationError(
        `Failed to save template "${template.frontmatter.name}"`,
        StencilErrorCode.STORAGE_WRITE_ERROR,
        'save',
        buildStorageErrorOptions(filePath, template.frontmatter.name, error),
      );
    }
  }

  async renameProjectTemplate(
    sourceName: string,
    targetTemplate: Template,
    overwrite = false,
  ): Promise<boolean> {
    const sourcePath = await findTemplatePath(sourceName, this.projectDir);
    if (sourcePath === null) {
      return false;
    }

    const targetPath = resolveTemplatePath(this.projectDir, targetTemplate);
    if (sourcePath !== targetPath && !overwrite && (await fileExists(targetPath))) {
      throw new TemplateConflictError(
        `Template already exists at target path: ${targetPath}`,
        StencilErrorCode.TEMPLATE_ALREADY_EXISTS,
        'rename-project-template',
        {
          targetName: targetTemplate.frontmatter.name,
          targetScope: 'project',
          templateName: sourceName,
        },
      );
    }

    try {
      await mkdir(path.dirname(targetPath), { recursive: true });

      if (sourcePath !== targetPath) {
        if (overwrite && (await fileExists(targetPath))) {
          await rm(targetPath);
        }

        await rename(sourcePath, targetPath);
      }

      await writeFile(targetPath, serializeTemplate(targetTemplate), 'utf8');
      return true;
    } catch (error) {
      throw new StorageOperationError(
        `Failed to rename template "${sourceName}"`,
        StencilErrorCode.STORAGE_RENAME_ERROR,
        'rename',
        buildStorageErrorOptions(targetPath, sourceName, error),
      );
    }
  }

  async deleteTemplate(name: string): Promise<boolean> {
    const filePath = await findTemplatePath(name, this.projectDir);
    if (filePath === null) return false;

    try {
      await rm(filePath);
      return true;
    } catch (error) {
      throw new StorageOperationError(
        `Failed to delete template "${name}"`,
        StencilErrorCode.STORAGE_DELETE_ERROR,
        'delete',
        buildStorageErrorOptions(filePath, name, error),
      );
    }
  }

  async templateExists(name: string): Promise<boolean> {
    return (await findTemplatePath(name, this.projectDir)) !== null;
  }
}

async function loadTemplatesFromDir(baseDir: string, source: TemplateSource): Promise<Template[]> {
  const templates = await loadTemplatesFromTemplateDir(path.join(baseDir, 'templates'), source);
  const collectionTemplates = await loadTemplatesFromCollectionsDir(
    path.join(baseDir, 'collections'),
    source,
  );

  return [...templates, ...collectionTemplates];
}

async function loadTemplatesFromTemplateDir(
  dirPath: string,
  source: TemplateSource,
): Promise<Template[]> {
  const entries = await readDirectory(dirPath);
  const templateFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(dirPath, entry.name));

  return parseTemplateFiles(templateFiles, source);
}

async function loadTemplatesFromCollectionsDir(
  collectionsDir: string,
  source: TemplateSource,
): Promise<Template[]> {
  const collectionEntries = await readDirectory(collectionsDir);
  const collectionDirs = collectionEntries.filter((entry) => entry.isDirectory());
  const nestedTemplates = await Promise.all(
    collectionDirs.map((entry) =>
      loadTemplatesFromTemplateDir(path.join(collectionsDir, entry.name), source),
    ),
  );

  return nestedTemplates.flat();
}

async function parseTemplateFiles(
  filePaths: string[],
  source: TemplateSource,
): Promise<Template[]> {
  return Promise.all(
    filePaths.map(async (filePath) =>
      parseTemplate(filePath, await readTemplateFile(filePath), source),
    ),
  );
}

async function findTemplatePath(name: string, baseDir: string): Promise<null | string> {
  const templatesPath = path.join(baseDir, 'templates', `${name}.md`);
  if (await fileExists(templatesPath)) return templatesPath;

  const collectionEntries = await readDirectory(path.join(baseDir, 'collections'));
  for (const entry of collectionEntries) {
    if (!entry.isDirectory()) continue;

    const candidatePath = path.join(baseDir, 'collections', entry.name, `${name}.md`);
    if (await fileExists(candidatePath)) return candidatePath;
  }

  return null;
}

async function findAndParseTemplate(
  name: string,
  baseDir: string,
  source: TemplateSource,
): Promise<null | Template> {
  const filePath = await findTemplatePath(name, baseDir);
  if (filePath === null) return null;

  return parseTemplate(filePath, await readTemplateFile(filePath, name), source);
}

function resolveTemplatePath(baseDir: string, template: Template): string {
  const fileName = `${template.frontmatter.name}.md`;
  if (template.collection !== undefined) {
    return path.join(baseDir, 'collections', template.collection, fileName);
  }

  return path.join(baseDir, 'templates', fileName);
}

function serializeTemplate(template: Template): string {
  const frontmatter = stringifyYaml(buildFrontmatterObject(template.frontmatter)).trimEnd();
  return `---\n${frontmatter}\n---\n\n${template.body}`;
}

function buildFrontmatterObject(frontmatter: TemplateFrontmatter): Record<string, unknown> {
  const result: Record<string, unknown> = {
    description: frontmatter.description,
    name: frontmatter.name,
    version: frontmatter.version,
  };

  if (frontmatter.author !== undefined) result.author = frontmatter.author;
  if (frontmatter.tags !== undefined) result.tags = frontmatter.tags;
  if (frontmatter.placeholders !== undefined) {
    result.placeholders = frontmatter.placeholders.map(buildPlaceholderObject);
  }

  return result;
}

function buildPlaceholderObject(placeholder: PlaceholderDefinition): Record<string, unknown> {
  const result: Record<string, unknown> = {
    description: placeholder.description,
    name: placeholder.name,
    required: placeholder.required,
  };

  if (placeholder.default !== undefined) result.default = placeholder.default;
  if (placeholder.type !== undefined) result.type = placeholder.type;
  if (placeholder.options !== undefined) result.options = placeholder.options;

  return result;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }

    throw new StorageOperationError(
      `Failed to inspect template path "${filePath}"`,
      StencilErrorCode.STORAGE_READ_ERROR,
      'stat',
      buildStorageErrorOptions(filePath, undefined, error),
    );
  }
}

async function readTemplateFile(filePath: string, templateName?: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    throw new StorageOperationError(
      `Failed to read template file "${filePath}"`,
      StencilErrorCode.STORAGE_READ_ERROR,
      'read',
      buildStorageErrorOptions(filePath, templateName, error),
    );
  }
}

async function readDirectory(dirPath: string) {
  try {
    return await readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw new StorageOperationError(
      `Failed to read directory "${dirPath}"`,
      StencilErrorCode.STORAGE_READ_ERROR,
      'readdir',
      buildStorageErrorOptions(dirPath, undefined, error),
    );
  }
}

function buildStorageErrorOptions(
  filePath: string,
  templateName: string | undefined,
  error: unknown,
): ErrorOptions & {
  filePath?: string;
  templateName?: string;
} {
  const options: ErrorOptions & {
    filePath?: string;
    templateName?: string;
  } = {
    filePath,
  };

  if (error instanceof Error) {
    options.cause = error;
  }
  if (templateName !== undefined) {
    options.templateName = templateName;
  }

  return options;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
