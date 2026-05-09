import * as vscode from 'vscode';

import type { OpenTemplateCommandTarget, TemplateLeafTreeItemMetadata } from '../types.js';

import { showCommandError } from '../services/errors.js';

export const OPEN_TEMPLATE_COMMAND_ID = 'stencil.openTemplate';

export function registerOpenTemplateCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    OPEN_TEMPLATE_COMMAND_ID,
    async (target?: OpenTemplateCommandTarget) => {
      try {
        const templateFilePath = resolveTemplateFilePath(target);
        if (templateFilePath === undefined) {
          return;
        }

        const document = await vscode.workspace.openTextDocument(templateFilePath);
        await vscode.window.showTextDocument(document);
      } catch (error) {
        await showCommandError(error);
      }
    },
  );
}

function resolveTemplateFilePath(target?: OpenTemplateCommandTarget): string | undefined {
  if (typeof target === 'string') {
    return target;
  }

  if (isTemplateMetadata(target)) {
    return target.templateFilePath;
  }

  if (hasTemplateMetadata(target)) {
    return target.metadata.templateFilePath;
  }

  return undefined;
}

function hasTemplateMetadata(
  target: OpenTemplateCommandTarget | undefined,
): target is { metadata: TemplateLeafTreeItemMetadata } {
  return (
    typeof target === 'object' &&
    target !== null &&
    'metadata' in target &&
    isTemplateMetadata(target.metadata)
  );
}

function isTemplateMetadata(
  target: OpenTemplateCommandTarget | undefined,
): target is TemplateLeafTreeItemMetadata {
  return (
    typeof target === 'object' && target !== null && 'kind' in target && target.kind === 'template'
  );
}
