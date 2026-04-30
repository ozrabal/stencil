// Template file parsing: extracts YAML frontmatter and body from a raw .md string.
import { parse as parseYaml, YAMLParseError } from 'yaml';

import type {
  PlaceholderDefinition,
  PlaceholderType,
  Template,
  TemplateFrontmatter,
  TemplateSource,
} from './types.js';

import { StencilError, StencilErrorCode } from './errors.js';

const DELIMITER = '---';
const COLLECTION_PATH_RE = /[/\\]collections[/\\]([^/\\]+)[/\\]/;
const VALID_PLACEHOLDER_TYPES = new Set<PlaceholderType>([
  'boolean',
  'enum',
  'file_path',
  'number',
  'string',
]);

/**
 * Thrown when a template file does not exist on disk.
 * Raised by the storage layer, not by parseTemplate itself.
 */
export class TemplateNotFoundError extends StencilError {
  readonly filePath?: string;
  readonly templateName?: string;

  constructor(
    identifier: string,
    options: ErrorOptions & {
      filePath?: string;
      templateName?: string;
    } = {},
  ) {
    const filePath = options.filePath ?? identifier;
    const templateName = options.templateName;
    const subject = templateName ?? filePath;

    super(`Template not found: ${subject}`, StencilErrorCode.TEMPLATE_NOT_FOUND, {
      cause: options.cause,
      details: {
        filePath,
        templateName,
      },
    });

    if (filePath !== undefined) {
      this.filePath = filePath;
    }
    if (templateName !== undefined) {
      this.templateName = templateName;
    }
  }
}

/**
 * Thrown when a template file cannot be parsed.
 */
export class ParseError extends StencilError {
  readonly filePath?: string;

  constructor(
    message: string,
    code:
      | StencilErrorCode.FRONTMATTER_INVALID_YAML
      | StencilErrorCode.FRONTMATTER_MISSING
      | StencilErrorCode.FRONTMATTER_SCHEMA_ERROR,
    public readonly line?: number,
    options: ErrorOptions & {
      filePath?: string;
    } = {},
  ) {
    super(message, code, {
      cause: options.cause,
      details: {
        filePath: options.filePath,
        line,
      },
    });

    if (options.filePath !== undefined) {
      this.filePath = options.filePath;
    }
  }
}

/**
 * Parses a raw template string into a typed Template object.
 */
export function parseTemplate(
  filePath: string,
  raw: string,
  source: TemplateSource = 'project',
): Template {
  const lines = raw.split(/\r?\n/);

  if (lines[0]?.trim() !== DELIMITER) {
    throw new ParseError(
      'Missing frontmatter: file must start with ---',
      StencilErrorCode.FRONTMATTER_MISSING,
      1,
      { filePath },
    );
  }

  let closingIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === DELIMITER) {
      closingIndex = index;
      break;
    }
  }

  if (closingIndex === -1) {
    throw new ParseError(
      'Missing closing --- for frontmatter block',
      StencilErrorCode.FRONTMATTER_MISSING,
      undefined,
      { filePath },
    );
  }

  const yamlBlock = lines.slice(1, closingIndex).join('\n');

  let parsed: unknown;
  try {
    parsed = parseYaml(yamlBlock);
  } catch (error) {
    if (error instanceof YAMLParseError) {
      throw new ParseError(
        `Invalid YAML in frontmatter: ${error.message}`,
        StencilErrorCode.FRONTMATTER_INVALID_YAML,
        error.linePos?.[0]?.line,
        { cause: error, filePath },
      );
    }

    throw new ParseError(
      'Failed to parse frontmatter YAML',
      StencilErrorCode.FRONTMATTER_INVALID_YAML,
      undefined,
      { cause: error instanceof Error ? error : undefined, filePath },
    );
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ParseError(
      'Frontmatter must be a YAML mapping (key-value object)',
      StencilErrorCode.FRONTMATTER_SCHEMA_ERROR,
      undefined,
      { filePath },
    );
  }

  const frontmatter = mapFrontmatter(parsed as Record<string, unknown>);
  const body = lines
    .slice(closingIndex + 1)
    .join('\n')
    .trim();
  const collection = detectCollection(filePath);

  const template: Template = {
    body,
    filePath,
    frontmatter,
    source,
  };

  if (collection !== undefined) {
    template.collection = collection;
  }

  return template;
}

function detectCollection(filePath: string): string | undefined {
  return COLLECTION_PATH_RE.exec(filePath)?.[1];
}

function mapFrontmatter(raw: Record<string, unknown>): TemplateFrontmatter {
  const frontmatter: TemplateFrontmatter = {
    description: typeof raw.description === 'string' ? raw.description : '',
    name: typeof raw.name === 'string' ? raw.name : '',
    version: typeof raw.version === 'number' ? raw.version : 0,
  };

  if (typeof raw.author === 'string') {
    frontmatter.author = raw.author;
  }

  if (Array.isArray(raw.placeholders)) {
    frontmatter.placeholders = raw.placeholders.map((placeholder, index) =>
      mapPlaceholder(placeholder, index),
    );
  }

  if (Array.isArray(raw.tags)) {
    frontmatter.tags = raw.tags.filter((tag): tag is string => typeof tag === 'string');
  }

  return frontmatter;
}

function mapPlaceholder(raw: unknown, index: number): PlaceholderDefinition {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ParseError(
      `placeholders[${index}] must be a YAML mapping`,
      StencilErrorCode.FRONTMATTER_SCHEMA_ERROR,
    );
  }

  const placeholder = raw as Record<string, unknown>;

  const mapped: PlaceholderDefinition = {
    description: typeof placeholder.description === 'string' ? placeholder.description : '',
    name: typeof placeholder.name === 'string' ? placeholder.name : '',
    required: typeof placeholder.required === 'boolean' ? placeholder.required : true,
  };

  if (typeof placeholder.default === 'string') {
    mapped.default = placeholder.default;
  }

  if (Array.isArray(placeholder.options)) {
    mapped.options = placeholder.options.filter(
      (option): option is string => typeof option === 'string',
    );
  }

  if (isPlaceholderType(placeholder.type)) {
    mapped.type = placeholder.type;
  }

  return mapped;
}

function isPlaceholderType(value: unknown): value is PlaceholderType {
  return typeof value === 'string' && VALID_PLACEHOLDER_TYPES.has(value as PlaceholderType);
}
