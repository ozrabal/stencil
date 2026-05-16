import * as vscode from 'vscode';

import type {
  RunTemplateChatMode,
  RunTemplateDeliveryTarget,
  RunTemplateMode,
} from '../runOptions.js';

export interface RunTemplateDeliveryCapability {
  available: boolean;
  implemented: boolean;
  supportedChatModes: RunTemplateChatMode[];
  supportedModes: RunTemplateMode[];
  target: RunTemplateDeliveryTarget;
  unavailableReason?: string;
}

const COPILOT_CHAT_COMMAND_ID = 'workbench.action.chat.open';
const COPILOT_CHAT_MODE_MINIMUM_VSCODE_VERSION = '1.100.0';
const COPILOT_DEFAULT_SUPPORTED_CHAT_MODES: RunTemplateChatMode[] = ['ask'];
const COPILOT_ALL_SUPPORTED_CHAT_MODES: RunTemplateChatMode[] = ['ask', 'edit', 'agent'];
export const LANGUAGE_MODEL_API_DEFAULT_SELECTOR = { vendor: 'copilot' } as const;

let cachedCommandIdsPromise: Promise<Set<string>> | undefined;

export async function getDeliveryTargetCapability(
  target: RunTemplateDeliveryTarget,
): Promise<RunTemplateDeliveryCapability> {
  switch (target) {
    case 'clipboard':
      return {
        available: typeof vscode.env?.clipboard?.writeText === 'function',
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target,
        unavailableReason: 'VS Code clipboard services are not available in the current runtime.',
      };
    case 'copilot-chat':
      return getCopilotChatCapability();
    case 'editor':
      return {
        available:
          typeof vscode.workspace.openTextDocument === 'function' &&
          typeof vscode.window.showTextDocument === 'function',
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target,
        unavailableReason: 'VS Code editor services are not available in the current runtime.',
      };
    case 'lm-api':
      return getLanguageModelApiCapability();
  }
}

async function getCopilotChatCapability(): Promise<RunTemplateDeliveryCapability> {
  const hasChatOpenCommand = await probeCommand(COPILOT_CHAT_COMMAND_ID);
  const supportedChatModes = supportsCopilotChatModes(vscode.version)
    ? COPILOT_ALL_SUPPORTED_CHAT_MODES
    : COPILOT_DEFAULT_SUPPORTED_CHAT_MODES;

  return {
    available: hasChatOpenCommand,
    implemented: true,
    supportedChatModes,
    supportedModes: ['default', 'insert', 'send'],
    target: 'copilot-chat',
    ...(!hasChatOpenCommand
      ? {
          unavailableReason:
            'Copilot Chat is unavailable because VS Code did not expose workbench.action.chat.open.',
        }
      : {}),
  };
}

async function getLanguageModelApiCapability(): Promise<RunTemplateDeliveryCapability> {
  if (typeof vscode.lm?.selectChatModels !== 'function') {
    return {
      available: false,
      implemented: true,
      supportedChatModes: [],
      supportedModes: ['execute'],
      target: 'lm-api',
      unavailableReason:
        'Stencil Language Model execution is unavailable because this VS Code runtime does not expose vscode.lm.selectChatModels.',
    };
  }

  const models = await vscode.lm.selectChatModels(LANGUAGE_MODEL_API_DEFAULT_SELECTOR);
  if (models.length === 0) {
    return {
      available: false,
      implemented: true,
      supportedChatModes: [],
      supportedModes: ['execute'],
      target: 'lm-api',
      unavailableReason:
        'Stencil Language Model execution is unavailable because no compatible Copilot-backed chat model is available.',
    };
  }

  return {
    available: true,
    implemented: true,
    supportedChatModes: [],
    supportedModes: ['execute'],
    target: 'lm-api',
  };
}

async function probeCommand(commandId: string): Promise<boolean> {
  const commandIds = await getCommandIds();
  return commandIds.has(commandId);
}

async function getCommandIds(): Promise<Set<string>> {
  if (cachedCommandIdsPromise === undefined) {
    cachedCommandIdsPromise = Promise.resolve(vscode.commands.getCommands(true)).then(
      (commandIds) => new Set(commandIds),
    );
  }

  return cachedCommandIdsPromise;
}

function supportsCopilotChatModes(version: string): boolean {
  return compareVersions(version, COPILOT_CHAT_MODE_MINIMUM_VSCODE_VERSION) >= 0;
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1;
    }
  }

  return 0;
}

function parseVersion(version: string): number[] {
  const coreVersion = version.split('-')[0] ?? '0.0.0';
  return coreVersion
    .split('.')
    .map((segment) => Number.parseInt(segment, 10))
    .filter((segment) => Number.isFinite(segment));
}
