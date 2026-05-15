import type * as vscode from 'vscode';

import type { RunTemplateLastUsedScope } from './runConfiguration.js';
import type { RunTemplateExecutionOptions } from './runOptions.js';

const LAST_USED_RUN_PROFILE_KEY = 'stencil.run.lastUsedProfile';

export interface RunPreferenceStoreState {
  globalState: Pick<vscode.Memento, 'get' | 'update'>;
  workspaceState: Pick<vscode.Memento, 'get' | 'update'>;
}

export interface RunPreferenceStoreLike {
  getLastUsedProfile(scope: RunTemplateLastUsedScope): RunTemplateExecutionOptions | undefined;
  setLastUsedProfile(
    scope: RunTemplateLastUsedScope,
    profile: RunTemplateExecutionOptions,
  ): Promise<void>;
}

export class RunPreferenceStore implements RunPreferenceStoreLike {
  private sessionProfile: RunTemplateExecutionOptions | undefined;

  constructor(private readonly state: RunPreferenceStoreState) {}

  getLastUsedProfile(scope: RunTemplateLastUsedScope): RunTemplateExecutionOptions | undefined {
    if (scope === 'session') {
      return this.sessionProfile;
    }

    const storedValue =
      scope === 'workspace'
        ? this.state.workspaceState.get(LAST_USED_RUN_PROFILE_KEY)
        : this.state.globalState.get(LAST_USED_RUN_PROFILE_KEY);

    return isRunTemplateExecutionOptions(storedValue) ? storedValue : undefined;
  }

  async setLastUsedProfile(
    scope: RunTemplateLastUsedScope,
    profile: RunTemplateExecutionOptions,
  ): Promise<void> {
    if (scope === 'session') {
      this.sessionProfile = profile;
      return;
    }

    await (scope === 'workspace'
      ? this.state.workspaceState.update(LAST_USED_RUN_PROFILE_KEY, profile)
      : this.state.globalState.update(LAST_USED_RUN_PROFILE_KEY, profile));
  }
}

function isRunTemplateExecutionOptions(value: unknown): value is RunTemplateExecutionOptions {
  return (
    typeof value === 'object' &&
    value !== null &&
    'chatMode' in value &&
    'deliveryTarget' in value &&
    'mode' in value &&
    isChatMode(value.chatMode) &&
    isDeliveryTarget(value.deliveryTarget) &&
    isMode(value.mode)
  );
}

function isChatMode(value: unknown): value is RunTemplateExecutionOptions['chatMode'] {
  return value === 'agent' || value === 'ask' || value === 'edit';
}

function isDeliveryTarget(value: unknown): value is RunTemplateExecutionOptions['deliveryTarget'] {
  return (
    value === 'clipboard' || value === 'copilot-chat' || value === 'editor' || value === 'lm-api'
  );
}

function isMode(value: unknown): value is RunTemplateExecutionOptions['mode'] {
  return value === 'default' || value === 'execute' || value === 'insert' || value === 'send';
}
