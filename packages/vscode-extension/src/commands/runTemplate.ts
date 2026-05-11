import * as vscode from 'vscode';

import type { RunTemplateCommandTarget, TemplateLeafTreeItemMetadata } from '../types.js';

import { runTemplate, showRunTemplateOutcomeMessage } from '../services/runTemplateService.js';
import { registerWorkspaceCommand } from './shared.js';

export const RUN_TEMPLATE_COMMAND_ID = 'stencil.runTemplate';

export function registerRunTemplateCommand(): vscode.Disposable {
  return registerWorkspaceCommand({
    commandId: RUN_TEMPLATE_COMMAND_ID,
    handler: async ({ commandArgs, stencil, workspace }) => {
      const requestedTarget = resolveRequestedTarget(commandArgs);
      const outcome = await runTemplate({
        invocationSource: resolveInvocationSource(commandArgs),
        ...(requestedTarget !== undefined ? { requestedTarget } : {}),
        stencil,
        workspace,
      });
      await showRunTemplateOutcomeMessage(outcome);
    },
  });
}

function resolveInvocationSource(commandArgs: unknown[]): 'command-palette' | 'tree-item' {
  return commandArgs.some((commandArg) => isTreeTemplateTarget(commandArg))
    ? 'tree-item'
    : 'command-palette';
}

function resolveRequestedTarget(commandArgs: unknown[]): undefined | { templateName: string } {
  for (const commandArg of commandArgs) {
    const templateName = extractTemplateName(commandArg as RunTemplateCommandTarget);
    if (templateName !== undefined) {
      return { templateName };
    }
  }

  return undefined;
}

function extractTemplateName(target: RunTemplateCommandTarget | undefined): string | undefined {
  if (typeof target === 'string' && target.length > 0) {
    return target;
  }

  if (isTemplateMetadata(target)) {
    return target.templateName;
  }

  if (hasTemplateMetadata(target)) {
    return target.metadata.templateName;
  }

  if (
    typeof target === 'object' &&
    target !== null &&
    'templateName' in target &&
    typeof target.templateName === 'string' &&
    target.templateName.length > 0
  ) {
    return target.templateName;
  }

  return undefined;
}

function hasTemplateMetadata(
  target: RunTemplateCommandTarget | undefined,
): target is { metadata: TemplateLeafTreeItemMetadata } {
  return (
    typeof target === 'object' &&
    target !== null &&
    'metadata' in target &&
    isTemplateMetadata(target.metadata)
  );
}

function isTreeTemplateTarget(target: unknown): boolean {
  return (
    isTemplateMetadata(target as RunTemplateCommandTarget) ||
    hasTemplateMetadata(target as RunTemplateCommandTarget | undefined)
  );
}

function isTemplateMetadata(
  target: RunTemplateCommandTarget | TemplateLeafTreeItemMetadata | undefined,
): target is TemplateLeafTreeItemMetadata {
  return (
    typeof target === 'object' && target !== null && 'kind' in target && target.kind === 'template'
  );
}
