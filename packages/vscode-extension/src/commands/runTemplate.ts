import * as vscode from 'vscode';

import type { RunTemplateChatMode, RunTemplateExecutionOptions } from '../services/runOptions.js';
import type { RunTemplateCommandTarget, TemplateLeafTreeItemMetadata } from '../types.js';

import { getDeliveryTargetCapability } from '../services/delivery/capabilities.js';
import { runTemplate, showRunTemplateOutcomeMessage } from '../services/runTemplateService.js';
import { registerWorkspaceCommand } from './shared.js';

export const RUN_TEMPLATE_COMMAND_ID = 'stencil.runTemplate';
export const RUN_TEMPLATE_IN_COPILOT_CHAT_COMMAND_ID = 'stencil.runTemplateInCopilotChat';
export const RUN_TEMPLATE_IN_COPILOT_CHAT_SEND_COMMAND_ID = 'stencil.runTemplateInCopilotChatSend';
export const RUN_TEMPLATE_IN_COPILOT_CHAT_WITH_MODE_COMMAND_ID =
  'stencil.runTemplateInCopilotChatWithMode';

export function registerRunTemplateCommand(
  commandId = RUN_TEMPLATE_COMMAND_ID,
  executionOptions?: Partial<RunTemplateExecutionOptions>,
): vscode.Disposable {
  return registerWorkspaceCommand({
    commandId,
    handler: async ({ commandArgs, stencil, workspace }) => {
      const requestedTarget = resolveRequestedTarget(commandArgs);
      const outcome = await runTemplate({
        invocationSource: resolveInvocationSource(commandArgs),
        ...(executionOptions !== undefined ? { options: executionOptions } : {}),
        ...(requestedTarget !== undefined ? { requestedTarget } : {}),
        stencil,
        workspace,
      });
      await showRunTemplateOutcomeMessage(outcome);
    },
  });
}

export function registerRunTemplateInCopilotChatWithModeCommand(
  commandId = RUN_TEMPLATE_IN_COPILOT_CHAT_WITH_MODE_COMMAND_ID,
): vscode.Disposable {
  return registerWorkspaceCommand({
    commandId,
    handler: async ({ commandArgs, stencil, workspace }) => {
      const requestedTarget = resolveRequestedTarget(commandArgs);
      const chatMode = await selectCopilotChatMode();
      if (chatMode === undefined) {
        return;
      }

      const outcome = await runTemplate({
        invocationSource: resolveInvocationSource(commandArgs),
        options: {
          chatMode,
          deliveryTarget: 'copilot-chat',
          mode: 'insert',
        },
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

async function selectCopilotChatMode(): Promise<RunTemplateChatMode | undefined> {
  const capability = await getDeliveryTargetCapability('copilot-chat');
  const supportedChatModes = capability.supportedChatModes;

  if (supportedChatModes.length <= 1) {
    return supportedChatModes[0] ?? 'ask';
  }

  const selected = await vscode.window.showQuickPick(
    supportedChatModes.map((chatMode) => ({
      description: getCopilotChatModeDescription(chatMode),
      label: formatCopilotChatModeLabel(chatMode),
      value: chatMode,
    })),
    {
      placeHolder: 'Select a Copilot Chat mode',
      title: 'Stencil: Run Template in Copilot Chat',
    },
  );

  return selected?.value;
}

function formatCopilotChatModeLabel(chatMode: RunTemplateChatMode): string {
  return chatMode === 'ask' ? 'Ask' : chatMode === 'edit' ? 'Edit' : 'Agent';
}

function getCopilotChatModeDescription(chatMode: RunTemplateChatMode): string {
  switch (chatMode) {
    case 'agent':
      return 'Insert into Copilot Chat Agent mode';
    case 'edit':
      return 'Insert into Copilot Chat Edit mode';
    default:
      return 'Insert into Copilot Chat Ask mode';
  }
}
