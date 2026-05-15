import * as vscode from 'vscode';

import type { RunTemplateChatMode, RunTemplateExecutionOptions } from '../services/runOptions.js';
import type { RunPreferenceStoreLike } from '../services/runPreferenceStore.js';
import type { RunTemplateCommandTarget, TemplateLeafTreeItemMetadata } from '../types.js';

import {
  getDeliveryTargetCapability,
  LANGUAGE_MODEL_API_DEFAULT_SELECTOR,
} from '../services/delivery/capabilities.js';
import {
  getResolvedRunConfiguration,
  getRunPreferenceConfiguration,
  normalizeRunProfile,
} from '../services/runConfiguration.js';
import { pickRunProfile } from '../services/runProfilePicker.js';
import { runTemplate, showRunTemplateOutcomeMessage } from '../services/runTemplateService.js';
import { registerWorkspaceCommand } from './shared.js';

export const RUN_TEMPLATE_COMMAND_ID = 'stencil.runTemplate';
export const RUN_TEMPLATE_WITH_MODE_COMMAND_ID = 'stencil.runTemplateWithMode';
export const RUN_TEMPLATE_IN_EDITOR_COMMAND_ID = 'stencil.runTemplateInEditor';
export const RUN_TEMPLATE_IN_COPILOT_CHAT_COMMAND_ID = 'stencil.runTemplateInCopilotChat';
export const RUN_TEMPLATE_IN_COPILOT_CHAT_SEND_COMMAND_ID = 'stencil.runTemplateInCopilotChatSend';
export const RUN_TEMPLATE_IN_COPILOT_CHAT_WITH_MODE_COMMAND_ID =
  'stencil.runTemplateInCopilotChatWithMode';
export const RUN_TEMPLATE_WITH_LANGUAGE_MODEL_COMMAND_ID = 'stencil.runTemplateWithLanguageModel';
export const RUN_TEMPLATE_WITH_LANGUAGE_MODEL_SELECT_MODEL_COMMAND_ID =
  'stencil.runTemplateWithLanguageModelSelectModel';

interface RunTemplateCommandServices {
  preferenceStore?: RunPreferenceStoreLike;
}

export function registerRunTemplateCommand(
  commandId = RUN_TEMPLATE_COMMAND_ID,
  executionOptions?: Partial<RunTemplateExecutionOptions>,
  services?: RunTemplateCommandServices,
): vscode.Disposable {
  return registerWorkspaceCommand({
    commandId,
    handler: async ({ commandArgs, stencil, workspace }) => {
      const requestedTarget = resolveRequestedTarget(commandArgs);
      const resolvedOptions =
        executionOptions !== undefined
          ? await normalizeRunProfile(executionOptions)
          : await resolveDefaultRunProfile(services?.preferenceStore);
      if (resolvedOptions === undefined) {
        return;
      }
      const outcome = await runTemplate({
        invocationSource: resolveInvocationSource(commandArgs),
        options: resolvedOptions,
        ...(requestedTarget !== undefined ? { requestedTarget } : {}),
        stencil,
        workspace,
      });
      await persistLastUsedProfile(services?.preferenceStore, resolvedOptions, outcome);
      await showRunTemplateOutcomeMessage(outcome);
    },
  });
}

export function registerRunTemplateWithModeCommand(
  commandId = RUN_TEMPLATE_WITH_MODE_COMMAND_ID,
  services?: RunTemplateCommandServices,
): vscode.Disposable {
  return registerWorkspaceCommand({
    commandId,
    handler: async ({ commandArgs, stencil, workspace }) => {
      const selectedProfile = await pickRunProfile();
      if (selectedProfile === undefined) {
        return;
      }

      const requestedTarget = resolveRequestedTarget(commandArgs);
      const outcome = await runTemplate({
        invocationSource: resolveInvocationSource(commandArgs),
        options: selectedProfile,
        ...(requestedTarget !== undefined ? { requestedTarget } : {}),
        stencil,
        workspace,
      });
      await persistLastUsedProfile(services?.preferenceStore, selectedProfile, outcome);
      await showRunTemplateOutcomeMessage(outcome);
    },
  });
}

export function registerRunTemplateInCopilotChatWithModeCommand(
  commandId = RUN_TEMPLATE_IN_COPILOT_CHAT_WITH_MODE_COMMAND_ID,
  services?: RunTemplateCommandServices,
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
      await persistLastUsedProfile(
        services?.preferenceStore,
        await normalizeRunProfile({
          chatMode,
          deliveryTarget: 'copilot-chat',
          mode: 'insert',
        }),
        outcome,
      );
      await showRunTemplateOutcomeMessage(outcome);
    },
  });
}

export function registerRunTemplateWithLanguageModelSelectModelCommand(
  commandId = RUN_TEMPLATE_WITH_LANGUAGE_MODEL_SELECT_MODEL_COMMAND_ID,
  services?: RunTemplateCommandServices,
): vscode.Disposable {
  return registerWorkspaceCommand({
    commandId,
    handler: async ({ commandArgs, stencil, workspace }) => {
      const requestedTarget = resolveRequestedTarget(commandArgs);
      const selectedLanguageModelId = await selectLanguageModelIdForRun();
      if (selectedLanguageModelId === null) {
        return;
      }

      const outcome = await runTemplate({
        invocationSource: resolveInvocationSource(commandArgs),
        options: {
          deliveryTarget: 'lm-api',
        },
        ...(requestedTarget !== undefined ? { requestedTarget } : {}),
        ...(selectedLanguageModelId !== undefined ? { selectedLanguageModelId } : {}),
        stencil,
        workspace,
      });
      await persistLastUsedProfile(
        services?.preferenceStore,
        await normalizeRunProfile({
          deliveryTarget: 'lm-api',
        }),
        outcome,
      );
      await showRunTemplateOutcomeMessage(outcome);
    },
  });
}

async function resolveDefaultRunProfile(
  preferenceStore: RunPreferenceStoreLike | undefined,
): Promise<RunTemplateExecutionOptions | undefined> {
  const configuration = await getResolvedRunConfiguration();

  if (configuration.selectionBehavior === 'picker') {
    return pickRunProfile();
  }

  if (configuration.selectionBehavior === 'last-used' && preferenceStore !== undefined) {
    const lastUsedProfile = preferenceStore.getLastUsedProfile(configuration.lastUsedScope);
    if (lastUsedProfile !== undefined) {
      return normalizeRunProfile(lastUsedProfile, configuration.warnings, 'last-used profile');
    }
  }

  return configuration.defaultProfile;
}

async function persistLastUsedProfile(
  preferenceStore: RunPreferenceStoreLike | undefined,
  profile: RunTemplateExecutionOptions,
  outcome: Awaited<ReturnType<typeof runTemplate>>,
): Promise<void> {
  if (preferenceStore === undefined || outcome.kind === 'no-target-selected') {
    return;
  }

  const configuration = getRunPreferenceConfiguration();
  await preferenceStore.setLastUsedProfile(configuration.lastUsedScope, profile);
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

async function selectLanguageModelIdForRun(): Promise<null | string | undefined> {
  const models = await vscode.lm.selectChatModels(LANGUAGE_MODEL_API_DEFAULT_SELECTOR);
  if (models.length <= 1) {
    return models[0]?.id;
  }

  const selected = await vscode.window.showQuickPick(
    models.map((model) => ({
      description: model.id,
      label: model.name,
      value: model.id,
    })),
    {
      placeHolder: 'Select a language model',
      title: 'Stencil: Run Template with Language Model',
    },
  );

  return selected?.value ?? null;
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
