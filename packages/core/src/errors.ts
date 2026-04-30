import type { ValidationIssue } from './types.js';

export enum StencilErrorCode {
  CONFIG_INVALID = 'CONFIG_INVALID',
  FRONTMATTER_INVALID_YAML = 'FRONTMATTER_INVALID_YAML',
  FRONTMATTER_MISSING = 'FRONTMATTER_MISSING',
  FRONTMATTER_SCHEMA_ERROR = 'FRONTMATTER_SCHEMA_ERROR',
  STORAGE_DELETE_ERROR = 'STORAGE_DELETE_ERROR',
  STORAGE_READ_ERROR = 'STORAGE_READ_ERROR',
  STORAGE_RENAME_ERROR = 'STORAGE_RENAME_ERROR',
  STORAGE_WRITE_ERROR = 'STORAGE_WRITE_ERROR',
  TEMPLATE_ALREADY_EXISTS = 'TEMPLATE_ALREADY_EXISTS',
  TEMPLATE_MUTATION_NOT_ALLOWED = 'TEMPLATE_MUTATION_NOT_ALLOWED',
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  TEMPLATE_VALIDATION_FAILED = 'TEMPLATE_VALIDATION_FAILED',
}

type StencilErrorOptions = ErrorOptions & {
  details?: Record<string, unknown>;
};

export class StencilError extends Error {
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    public readonly code: StencilErrorCode,
    options: StencilErrorOptions = {},
  ) {
    super(message, options);
    this.name = new.target.name;

    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

export class TemplateValidationError extends StencilError {
  readonly templateName?: string;

  constructor(
    message: string,
    public readonly operation: string,
    public readonly issues: ValidationIssue[],
    options: ErrorOptions & {
      templateName?: string;
    } = {},
  ) {
    super(message, StencilErrorCode.TEMPLATE_VALIDATION_FAILED, {
      cause: options.cause,
      details: {
        issues,
        operation,
        templateName: options.templateName,
      },
    });

    if (options.templateName !== undefined) {
      this.templateName = options.templateName;
    }
  }
}

export class TemplateConflictError extends StencilError {
  readonly sourceScope?: string;
  readonly targetName?: string;
  readonly targetScope?: string;
  readonly templateName?: string;

  constructor(
    message: string,
    code: StencilErrorCode.TEMPLATE_ALREADY_EXISTS | StencilErrorCode.TEMPLATE_MUTATION_NOT_ALLOWED,
    public readonly operation: string,
    options: ErrorOptions & {
      sourceScope?: string;
      targetName?: string;
      targetScope?: string;
      templateName?: string;
    } = {},
  ) {
    super(message, code, {
      cause: options.cause,
      details: {
        operation,
        sourceScope: options.sourceScope,
        targetName: options.targetName,
        targetScope: options.targetScope,
        templateName: options.templateName,
      },
    });

    if (options.sourceScope !== undefined) {
      this.sourceScope = options.sourceScope;
    }
    if (options.targetName !== undefined) {
      this.targetName = options.targetName;
    }
    if (options.targetScope !== undefined) {
      this.targetScope = options.targetScope;
    }
    if (options.templateName !== undefined) {
      this.templateName = options.templateName;
    }
  }
}

export class StorageOperationError extends StencilError {
  readonly filePath?: string;
  readonly templateName?: string;

  constructor(
    message: string,
    code:
      | StencilErrorCode.STORAGE_DELETE_ERROR
      | StencilErrorCode.STORAGE_READ_ERROR
      | StencilErrorCode.STORAGE_RENAME_ERROR
      | StencilErrorCode.STORAGE_WRITE_ERROR,
    public readonly operation: string,
    options: ErrorOptions & {
      filePath?: string;
      templateName?: string;
    } = {},
  ) {
    super(message, code, {
      cause: options.cause,
      details: {
        filePath: options.filePath,
        operation,
        templateName: options.templateName,
      },
    });

    if (options.filePath !== undefined) {
      this.filePath = options.filePath;
    }
    if (options.templateName !== undefined) {
      this.templateName = options.templateName;
    }
  }
}
