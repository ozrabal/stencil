import type { StencilError, TemplateValidationError } from './errors.js';
import type {
  ResolutionResult,
  StencilBootstrapResult,
  Template,
  ValidationIssue,
  ValidationResult,
} from './types.js';

export type StencilCliCommand =
  | 'create'
  | 'delete'
  | 'detect-context'
  | 'init'
  | 'list'
  | 'resolve'
  | 'show'
  | 'validate';

export type StencilCliStatus = 'error' | 'needs_input' | 'ok' | 'validation_failed';

export interface StencilCliErrorPayload {
  code: string;
  details: Record<string, unknown> | undefined;
  message: string;
}

export interface StencilCliTemplateSummary {
  collection?: string;
  description: string;
  filePath: string;
  name: string;
  source: Template['source'];
  tags: string[];
  version: number;
}

export interface StencilCliTemplateDetail extends StencilCliTemplateSummary {
  author?: string;
  body: string;
  bodyTokens?: Template['bodyTokens'];
  placeholders: Template['frontmatter']['placeholders'];
}

export type StencilCliInitData = StencilBootstrapResult;

export interface StencilCliCreateData {
  template: StencilCliTemplateDetail;
  validation: ValidationResult;
}

export interface StencilCliListData {
  templates: StencilCliTemplateSummary[];
}

export interface StencilCliShowData {
  template: StencilCliTemplateDetail;
  validation: ValidationResult;
}

export type StencilCliResolveData = ResolutionResult;

export interface StencilCliDeleteData {
  deleted: boolean;
  templateName: string;
}

export interface StencilCliValidateData {
  templateName: string;
  validation: ValidationResult;
}

export interface StencilCliDetectContextData {
  context: Record<string, string>;
}

export interface StencilCliValidationFailedData {
  operation?: string;
  templateName?: string;
}

export interface StencilCliErrorData {
  operation?: string;
  templateName?: string;
}

export interface StencilCliCommandDataMap {
  create: null | StencilCliCreateData | StencilCliValidationFailedData;
  delete: StencilCliDeleteData;
  'detect-context': StencilCliDetectContextData;
  init: StencilCliInitData;
  list: StencilCliListData;
  resolve: null | StencilCliErrorData | StencilCliResolveData | StencilCliValidationFailedData;
  show: null | StencilCliErrorData | StencilCliShowData;
  validate: null | StencilCliErrorData | StencilCliValidateData;
}

export interface StencilCliEnvelope<TCommand extends StencilCliCommand = StencilCliCommand> {
  command: TCommand;
  data: StencilCliCommandDataMap[TCommand];
  error: null | StencilCliErrorPayload;
  issues: ValidationIssue[];
  status: StencilCliStatus;
}

export function createCliOkEnvelope<TCommand extends StencilCliCommand>(
  command: TCommand,
  data: StencilCliCommandDataMap[TCommand],
  issues: ValidationIssue[] = [],
): StencilCliEnvelope<TCommand> {
  return {
    command,
    data,
    error: null,
    issues,
    status: 'ok',
  };
}

export function createCliNeedsInputEnvelope(
  command: 'resolve',
  data: StencilCliResolveData,
): StencilCliEnvelope<'resolve'> {
  return {
    command,
    data,
    error: null,
    issues: [],
    status: 'needs_input',
  };
}

export function createCliValidationFailedEnvelope<
  TCommand extends 'create' | 'resolve' | 'validate',
>(
  command: TCommand,
  error: TemplateValidationError,
  data: StencilCliCommandDataMap[TCommand] = null as StencilCliCommandDataMap[TCommand],
): StencilCliEnvelope<TCommand> {
  return {
    command,
    data,
    error: null,
    issues: error.issues,
    status: 'validation_failed',
  };
}

export function createCliErrorEnvelope<TCommand extends StencilCliCommand>(
  command: TCommand,
  error: StencilError,
  data: StencilCliCommandDataMap[TCommand] = null as StencilCliCommandDataMap[TCommand],
): StencilCliEnvelope<TCommand> {
  return {
    command,
    data,
    error: toCliErrorPayload(error),
    issues: [],
    status: 'error',
  };
}

export function toCliErrorPayload(error: StencilError): StencilCliErrorPayload {
  return {
    code: error.code,
    details: error.details,
    message: error.message,
  };
}

export function toCliTemplateSummary(template: Template): StencilCliTemplateSummary {
  const summary: StencilCliTemplateSummary = {
    description: template.frontmatter.description,
    filePath: template.filePath,
    name: template.frontmatter.name,
    source: template.source,
    tags: template.frontmatter.tags ?? [],
    version: template.frontmatter.version,
  };

  if (template.collection !== undefined) {
    summary.collection = template.collection;
  }

  return summary;
}

export function toCliTemplateDetail(template: Template): StencilCliTemplateDetail {
  const detail: StencilCliTemplateDetail = {
    body: template.body,
    bodyTokens: template.bodyTokens,
    ...toCliTemplateSummary(template),
    placeholders: template.frontmatter.placeholders,
  };

  if (template.frontmatter.author !== undefined) {
    detail.author = template.frontmatter.author;
  }

  return detail;
}
