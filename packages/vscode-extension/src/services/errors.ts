import * as vscode from 'vscode';

import { StencilError, StencilErrorCode } from '../core/index.js';

const ERROR_MESSAGES: Record<StencilErrorCode, string> = {
  [StencilErrorCode.CONFIG_INVALID]:
    'Stencil configuration is invalid. Check the workspace .stencil settings.',
  [StencilErrorCode.FRONTMATTER_INVALID_YAML]:
    'A Stencil template has invalid YAML frontmatter. Fix the template and try again.',
  [StencilErrorCode.FRONTMATTER_MISSING]: 'A Stencil template is missing required frontmatter.',
  [StencilErrorCode.FRONTMATTER_SCHEMA_ERROR]: 'A Stencil template frontmatter block is invalid.',
  [StencilErrorCode.STORAGE_DELETE_ERROR]:
    'Stencil could not update files in .stencil/. Check workspace permissions and setup.',
  [StencilErrorCode.STORAGE_READ_ERROR]:
    'Stencil could not read workspace templates from .stencil/.',
  [StencilErrorCode.STORAGE_RENAME_ERROR]:
    'Stencil could not update files in .stencil/. Check workspace permissions and setup.',
  [StencilErrorCode.STORAGE_WRITE_ERROR]:
    'Stencil could not write workspace templates into .stencil/.',
  [StencilErrorCode.TEMPLATE_ALREADY_EXISTS]:
    'The requested Stencil template already exists in this workspace.',
  [StencilErrorCode.TEMPLATE_MUTATION_NOT_ALLOWED]:
    'That Stencil template change is not allowed in the current workspace state.',
  [StencilErrorCode.TEMPLATE_NOT_FOUND]: 'The requested Stencil template could not be found.',
  [StencilErrorCode.TEMPLATE_VALIDATION_FAILED]:
    'A Stencil template failed validation. Fix the template before running this command.',
};

export async function showCommandError(error: unknown): Promise<void> {
  await vscode.window.showErrorMessage(getUserFacingErrorMessage(error));
}

export function getUserFacingErrorMessage(error: unknown): string {
  if (error instanceof StencilError) {
    return ERROR_MESSAGES[error.code] ?? error.message;
  }

  return `Stencil failed unexpectedly: ${getUnknownErrorMessage(error)}`;
}

export function getUnknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
