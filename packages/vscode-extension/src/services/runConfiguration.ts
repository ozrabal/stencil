import * as vscode from 'vscode';

import type {
  RunTemplateChatMode,
  RunTemplateDeliveryTarget,
  RunTemplateExecutionOptions,
  RunTemplateMode,
} from './runOptions.js';

import { getDeliveryTargetCapability } from './delivery/capabilities.js';

export type RunTemplateSelectionBehavior = 'defaults' | 'last-used' | 'picker';
export type RunTemplateLastUsedScope = 'global' | 'session' | 'workspace';

export interface ResolvedRunConfiguration {
  defaultProfile: RunTemplateExecutionOptions;
  lastUsedScope: RunTemplateLastUsedScope;
  selectionBehavior: RunTemplateSelectionBehavior;
  warnings: string[];
}

export interface RunPreferenceConfiguration {
  lastUsedScope: RunTemplateLastUsedScope;
  selectionBehavior: RunTemplateSelectionBehavior;
  warnings: string[];
}

const RUN_CONFIGURATION_SECTION = 'stencil.run';

const DELIVERY_TARGET_VALUES = ['editor', 'copilot-chat', 'lm-api'] as const;
const MODE_VALUES = ['default', 'execute', 'insert', 'send'] as const;
const CHAT_MODE_VALUES = ['agent', 'ask', 'edit'] as const;
const SELECTION_BEHAVIOR_VALUES = ['defaults', 'last-used', 'picker'] as const;
const LAST_USED_SCOPE_VALUES = ['global', 'session', 'workspace'] as const;

const DEFAULT_RUN_TARGET: RunTemplateDeliveryTarget = 'copilot-chat';
const DEFAULT_RUN_MODE: RunTemplateMode = 'default';
const DEFAULT_CHAT_MODE: RunTemplateChatMode = 'ask';
const DEFAULT_SELECTION_BEHAVIOR: RunTemplateSelectionBehavior = 'defaults';
const DEFAULT_LAST_USED_SCOPE: RunTemplateLastUsedScope = 'session';

export async function getResolvedRunConfiguration(): Promise<ResolvedRunConfiguration> {
  const configuration = vscode.workspace.getConfiguration('stencil');
  const warnings: string[] = [];
  const defaultTarget = readRunDefaultTarget(configuration, warnings);
  const defaultMode = readRunDefaultMode(configuration, warnings);
  const defaultChatMode = readRunDefaultChatMode(configuration, warnings);
  const preferenceConfiguration = readRunPreferenceConfiguration(configuration, warnings);

  return {
    defaultProfile: await normalizeRunProfile(
      {
        chatMode: defaultChatMode,
        deliveryTarget: defaultTarget,
        mode: defaultMode,
      },
      warnings,
      'settings',
    ),
    lastUsedScope: preferenceConfiguration.lastUsedScope,
    selectionBehavior: preferenceConfiguration.selectionBehavior,
    warnings,
  };
}

export function getRunPreferenceConfiguration(): RunPreferenceConfiguration {
  const configuration = vscode.workspace.getConfiguration('stencil');
  const warnings: string[] = [];

  return readRunPreferenceConfiguration(configuration, warnings);
}

export async function normalizeRunProfile(
  profile: Partial<RunTemplateExecutionOptions>,
  warnings: string[] = [],
  source = 'profile',
): Promise<RunTemplateExecutionOptions> {
  const deliveryTarget = profile.deliveryTarget ?? DEFAULT_RUN_TARGET;
  const mode = profile.mode ?? DEFAULT_RUN_MODE;
  const chatMode = profile.chatMode ?? DEFAULT_CHAT_MODE;

  switch (deliveryTarget) {
    case 'copilot-chat': {
      const capability = await getDeliveryTargetCapability('copilot-chat');
      const normalizedMode = mode === 'default' ? 'insert' : mode;
      if (normalizedMode !== mode) {
        warnings.push(
          `${formatWarningSource(source)} requested mode "default" for target "copilot-chat"; using "insert".`,
        );
      } else if (normalizedMode !== 'insert' && normalizedMode !== 'send') {
        warnings.push(
          `${formatWarningSource(source)} requested mode "${mode}" is invalid for target "copilot-chat"; using "insert".`,
        );
      }

      const supportedChatModes = capability.supportedChatModes;
      const fallbackChatMode = supportedChatModes[0] ?? DEFAULT_CHAT_MODE;
      const normalizedChatMode = supportedChatModes.includes(chatMode)
        ? chatMode
        : fallbackChatMode;
      if (normalizedChatMode !== chatMode) {
        warnings.push(
          `${formatWarningSource(source)} requested chat mode "${chatMode}" is unavailable for target "copilot-chat"; using "${normalizedChatMode}".`,
        );
      }

      return {
        chatMode: normalizedChatMode,
        deliveryTarget,
        mode: normalizedMode === 'insert' || normalizedMode === 'send' ? normalizedMode : 'insert',
      };
    }
    case 'editor':
      if (mode !== 'default') {
        warnings.push(
          `${formatWarningSource(source)} requested mode "${mode}" is invalid for target "editor"; using "default".`,
        );
      }
      return {
        chatMode: DEFAULT_CHAT_MODE,
        deliveryTarget,
        mode: 'default',
      };
    case 'lm-api':
      if (mode !== 'default' && mode !== 'execute') {
        warnings.push(
          `${formatWarningSource(source)} requested mode "${mode}" is invalid for target "lm-api"; using "execute".`,
        );
      } else if (mode === 'default') {
        warnings.push(
          `${formatWarningSource(source)} requested mode "default" for target "lm-api"; using "execute".`,
        );
      }
      return {
        chatMode: DEFAULT_CHAT_MODE,
        deliveryTarget,
        mode: 'execute',
      };
  }

  return {
    chatMode: DEFAULT_CHAT_MODE,
    deliveryTarget: DEFAULT_RUN_TARGET,
    mode: 'insert',
  };
}

function readEnumSetting<TValue extends string>({
  configuration,
  defaultValue,
  key,
  validValues,
  warnings,
}: {
  configuration: vscode.WorkspaceConfiguration;
  defaultValue: TValue;
  key: string;
  validValues: readonly TValue[];
  warnings: string[];
}): TValue {
  const value = configuration.get<unknown>(key);
  if (typeof value === 'string' && validValues.includes(value as TValue)) {
    return value as TValue;
  }

  if (value !== undefined) {
    warnings.push(
      `Stencil ${key.startsWith('run.') ? `stencil.${key}` : `${RUN_CONFIGURATION_SECTION}.${key}`} must be one of: ${validValues.join(', ')}. Using "${defaultValue}".`,
    );
  }

  return defaultValue;
}

function readRunDefaultTarget(
  configuration: vscode.WorkspaceConfiguration,
  warnings: string[],
): RunTemplateDeliveryTarget {
  return readEnumSetting({
    configuration,
    defaultValue: DEFAULT_RUN_TARGET,
    key: 'run.defaultTarget',
    validValues: DELIVERY_TARGET_VALUES,
    warnings,
  });
}

function readRunDefaultMode(
  configuration: vscode.WorkspaceConfiguration,
  warnings: string[],
): RunTemplateMode {
  return readEnumSetting({
    configuration,
    defaultValue: DEFAULT_RUN_MODE,
    key: 'run.defaultMode',
    validValues: MODE_VALUES,
    warnings,
  });
}

function readRunDefaultChatMode(
  configuration: vscode.WorkspaceConfiguration,
  warnings: string[],
): RunTemplateChatMode {
  return readEnumSetting({
    configuration,
    defaultValue: DEFAULT_CHAT_MODE,
    key: 'run.defaultChatMode',
    validValues: CHAT_MODE_VALUES,
    warnings,
  });
}

function readRunPreferenceConfiguration(
  configuration: vscode.WorkspaceConfiguration,
  warnings: string[],
): RunPreferenceConfiguration {
  return {
    lastUsedScope: readEnumSetting({
      configuration,
      defaultValue: DEFAULT_LAST_USED_SCOPE,
      key: 'run.lastUsedScope',
      validValues: LAST_USED_SCOPE_VALUES,
      warnings,
    }),
    selectionBehavior: readEnumSetting({
      configuration,
      defaultValue: DEFAULT_SELECTION_BEHAVIOR,
      key: 'run.selectionBehavior',
      validValues: SELECTION_BEHAVIOR_VALUES,
      warnings,
    }),
    warnings,
  };
}

function formatWarningSource(source: string): string {
  return source === 'settings' ? 'Stencil run settings' : `Stencil ${source}`;
}
