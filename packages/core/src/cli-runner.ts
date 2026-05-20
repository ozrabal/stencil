import { access } from 'node:fs/promises';
import path from 'node:path';

import type { StencilCliCommand, StencilCliEnvelope, StencilCliInitData } from './cli-contract.js';
import type { ValidationResult } from './types.js';

import {
  CliInputError,
  CliUsageError,
  type ParsedStencilCliCommand,
  STENCIL_CLI_EXIT_RUNTIME_FAILURE,
} from './cli-args.js';
import {
  createCliErrorEnvelope,
  createCliNeedsInputEnvelope,
  createCliOkEnvelope,
  createCliValidationFailedEnvelope,
  toCliTemplateDetail,
  toCliTemplateSummary,
} from './cli-contract.js';
import { StencilError, TemplateValidationError } from './errors.js';
import { TemplateNotFoundError } from './parser.js';
import { Stencil } from './stencil.js';

export interface StencilCliSuccessResult {
  envelope: StencilCliEnvelope;
  exitCode: 0;
  stderr: '';
  stdout: string;
}

export interface StencilCliFailureResult {
  exitCode: number;
  stderr: string;
  stdout: '';
}

export type StencilCliExecutionResult = StencilCliFailureResult | StencilCliSuccessResult;

export async function runParsedCliCommand(
  parsed: ParsedStencilCliCommand,
  stencil: Stencil,
): Promise<StencilCliExecutionResult> {
  try {
    const envelope = await dispatchParsedCommand(parsed, stencil);
    return toSuccessResult(envelope);
  } catch (error) {
    if (error instanceof TemplateValidationError) {
      return toSuccessResult(handleValidationError(parsed.command, error));
    }

    if (error instanceof StencilError) {
      return toSuccessResult(handleStencilError(parsed.command, error));
    }

    if (error instanceof CliUsageError || error instanceof CliInputError) {
      return {
        exitCode: error.exitCode,
        stderr: `${error.message}\n`,
        stdout: '',
      };
    }

    return {
      exitCode: STENCIL_CLI_EXIT_RUNTIME_FAILURE,
      stderr: `${error instanceof Error ? error.message : 'Unexpected CLI failure'}\n`,
      stdout: '',
    };
  }
}

async function dispatchParsedCommand(
  parsed: ParsedStencilCliCommand,
  stencil: Stencil,
): Promise<StencilCliEnvelope> {
  switch (parsed.command) {
    case 'create': {
      const template = await stencil.create(
        parsed.payload.frontmatter,
        parsed.payload.body,
        parsed.payload.collection,
      );
      const validation = await stencil.validate(template.frontmatter.name);
      return createCliOkEnvelope('create', {
        template: toCliTemplateDetail(template),
        validation,
      });
    }
    case 'delete': {
      const deleted = await stencil.delete(parsed.templateName);
      return createCliOkEnvelope('delete', {
        deleted,
        templateName: parsed.templateName,
      });
    }
    case 'detect-context':
      return createCliOkEnvelope('detect-context', {
        context: await stencil.context.resolveAll(),
      });
    case 'init':
      return createCliOkEnvelope('init', await runInit(stencil));
    case 'list': {
      const templates = await stencil.list();
      return createCliOkEnvelope('list', {
        templates: templates.map((template) => toCliTemplateSummary(template)),
      });
    }
    case 'resolve': {
      const resolution = await stencil.resolve(parsed.templateName, parsed.explicitValues);
      if (resolution.unresolvedCount > 0) {
        return createCliNeedsInputEnvelope('resolve', resolution);
      }

      return createCliOkEnvelope('resolve', resolution);
    }
    case 'show': {
      const template = await stencil.get(parsed.templateName);
      if (template === null) {
        throw new TemplateNotFoundError(parsed.templateName, {
          templateName: parsed.templateName,
        });
      }

      const validation = await stencil.validate(parsed.templateName);
      return createCliOkEnvelope('show', {
        template: toCliTemplateDetail(template),
        validation,
      });
    }
    case 'validate': {
      const validation = await stencil.validate(parsed.templateName);
      if (!validation.valid) {
        const error = new TemplateValidationError(
          `Template "${parsed.templateName}" failed validation.`,
          'validate',
          validation.issues,
          { templateName: parsed.templateName },
        );
        return createCliValidationFailedEnvelope('validate', error, {
          templateName: parsed.templateName,
          validation,
        });
      }

      return createCliOkEnvelope('validate', {
        templateName: parsed.templateName,
        validation,
      });
    }
  }
}

async function runInit(stencil: Stencil): Promise<StencilCliInitData> {
  const stencilDir = stencil.storage.getProjectDir();
  const projectDir = path.dirname(stencilDir);
  const templatesDir = path.join(stencilDir, 'templates');
  const alreadyExisted = await pathExists(templatesDir);

  await stencil.init();

  return {
    alreadyExisted,
    createdPaths: [stencilDir, templatesDir],
    projectDir,
    stencilDir,
  };
}

function handleValidationError(
  command: StencilCliCommand,
  error: TemplateValidationError,
): StencilCliEnvelope {
  switch (command) {
    case 'create':
    case 'resolve':
      return createCliValidationFailedEnvelope(command, error, buildErrorContextData(error));
    case 'validate':
      return createCliValidationFailedEnvelope(
        'validate',
        error,
        buildValidateFailureData(error.templateName, error.issues),
      );
    default:
      return createCliValidationFailedEnvelope('resolve', error, buildErrorContextData(error));
  }
}

function handleStencilError(command: StencilCliCommand, error: StencilError): StencilCliEnvelope {
  switch (command) {
    case 'create':
    case 'resolve':
    case 'show':
    case 'validate':
      return createCliErrorEnvelope(command, error, buildErrorContextData(error));
    default:
      return createCliErrorEnvelope(command, error);
  }
}

function toSuccessResult(envelope: StencilCliEnvelope): StencilCliSuccessResult {
  return {
    envelope,
    exitCode: 0,
    stderr: '',
    stdout: `${JSON.stringify(envelope)}\n`,
  };
}

function validationFromIssues(issues: ValidationResult['issues']): ValidationResult {
  return {
    issues,
    valid: !issues.some((issue) => issue.severity === 'error'),
  };
}

function buildErrorContextData(error: { details?: Record<string, unknown>; operation?: string }) {
  const data: { operation?: string; templateName?: string } = {};

  if (typeof error.operation === 'string') {
    data.operation = error.operation;
  } else if (typeof error.details?.['operation'] === 'string') {
    data.operation = error.details['operation'];
  }

  if (typeof error.details?.['templateName'] === 'string') {
    data.templateName = error.details['templateName'];
  }

  return data;
}

function buildValidateFailureData(
  templateName: string | undefined,
  issues: ValidationResult['issues'],
) {
  const data: { templateName?: string; validation: ValidationResult } = {
    validation: validationFromIssues(issues),
  };

  if (templateName !== undefined) {
    data.templateName = templateName;
  }

  return data;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}
