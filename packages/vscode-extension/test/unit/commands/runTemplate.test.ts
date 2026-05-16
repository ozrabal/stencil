import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunTemplateExecutionOptions } from '../../../src/services/runOptions.js';

describe('registerRunTemplateCommand', () => {
  const getDeliveryTargetCapability = vi.fn();
  const registerCommand = vi.fn();
  const selectChatModels = vi.fn();
  const showCommandError = vi.fn();
  const hasStencilWorkspaceSetup = vi.fn();
  const resolveWorkspace = vi.fn();
  const getStencil = vi.fn();
  const getResolvedRunConfiguration = vi.fn();
  const getRunPreferenceConfiguration = vi.fn();
  const normalizeRunProfile = vi.fn();
  const pickRunProfile = vi.fn();
  const runTemplate = vi.fn();
  const showRunTemplateOutcomeMessage = vi.fn();
  const showQuickPick = vi.fn();

  const workspace = {
    kind: 'workspace' as const,
    rootPath: '/workspace',
    workspaceFolder: {
      index: 0,
      name: 'workspace',
      uri: { fsPath: '/workspace' },
    },
  };

  beforeEach(() => {
    vi.resetModules();

    registerCommand.mockReset();
    getDeliveryTargetCapability.mockReset();
    selectChatModels.mockReset();
    showCommandError.mockReset();
    hasStencilWorkspaceSetup.mockReset();
    resolveWorkspace.mockReset();
    getStencil.mockReset();
    getResolvedRunConfiguration.mockReset();
    getRunPreferenceConfiguration.mockReset();
    normalizeRunProfile.mockReset();
    pickRunProfile.mockReset();
    runTemplate.mockReset();
    showRunTemplateOutcomeMessage.mockReset();
    showQuickPick.mockReset();

    registerCommand.mockImplementation(
      (commandId: string, callback: (...args: unknown[]) => Promise<void>) => ({
        callback,
        commandId,
        dispose: vi.fn(),
      }),
    );
    hasStencilWorkspaceSetup.mockResolvedValue(true);
    resolveWorkspace.mockReturnValue(workspace);
    getResolvedRunConfiguration.mockResolvedValue({
      defaultProfile: {
        chatMode: 'ask',
        deliveryTarget: 'copilot-chat',
        mode: 'insert',
      },
      lastUsedScope: 'session',
      selectionBehavior: 'defaults',
      warnings: [],
    });
    getRunPreferenceConfiguration.mockReturnValue({
      lastUsedScope: 'session',
      selectionBehavior: 'defaults',
      warnings: [],
    });
    normalizeRunProfile.mockImplementation(async (profile: Record<string, unknown>) => {
      if (profile.deliveryTarget === 'lm-api') {
        return {
          chatMode: 'ask',
          deliveryTarget: 'lm-api',
          mode: 'execute',
        };
      }

      return {
        chatMode: 'ask',
        mode: profile.mode ?? 'default',
        ...profile,
      };
    });
    getStencil.mockReturnValue({ list: vi.fn() });
    runTemplate.mockResolvedValue({ kind: 'no-target-selected', reason: 'picker-cancelled' });
    getDeliveryTargetCapability.mockResolvedValue({
      available: true,
      implemented: true,
      supportedChatModes: ['ask', 'edit', 'agent'],
      supportedModes: ['default', 'insert', 'send'],
      target: 'copilot-chat',
    });
    selectChatModels.mockResolvedValue([]);

    vi.doMock('vscode', () => ({
      commands: {
        registerCommand,
      },
      lm: {
        selectChatModels,
      },
      window: {
        showInformationMessage: vi.fn(),
        showQuickPick,
      },
    }));

    vi.doMock('../../../src/services/errors.js', () => ({
      showCommandError,
    }));

    vi.doMock('../../../src/services/getStencil.js', () => ({
      getStencil,
    }));

    vi.doMock('../../../src/services/workspace.js', () => ({
      hasStencilWorkspaceSetup,
      resolveWorkspace,
    }));

    vi.doMock('../../../src/services/runTemplateService.js', () => ({
      runTemplate,
      showRunTemplateOutcomeMessage,
    }));

    vi.doMock('../../../src/services/runConfiguration.js', () => ({
      getResolvedRunConfiguration,
      getRunPreferenceConfiguration,
      normalizeRunProfile,
    }));

    vi.doMock('../../../src/services/runProfilePicker.js', () => ({
      pickRunProfile,
    }));

    vi.doMock('../../../src/services/delivery/capabilities.js', () => ({
      getDeliveryTargetCapability,
      LANGUAGE_MODEL_API_DEFAULT_SELECTOR: { vendor: 'copilot' },
    }));
  });

  it('passes an explicit string target through the canonical run request', async () => {
    const stencil = { get: vi.fn(), list: vi.fn(), resolve: vi.fn() };
    getStencil.mockReturnValue(stencil);

    const callback = await registerCommandAndGetCallback();
    await callback('alpha');

    expect(runTemplate).toHaveBeenCalledWith({
      invocationSource: 'command-palette',
      options: {
        chatMode: 'ask',
        deliveryTarget: 'copilot-chat',
        mode: 'insert',
      },
      requestedTarget: { templateName: 'alpha' },
      stencil,
      workspace,
    });
    expect(showRunTemplateOutcomeMessage).toHaveBeenCalledWith({
      kind: 'no-target-selected',
      reason: 'picker-cancelled',
    });
  });

  it('passes a tree item target through the canonical run request', async () => {
    const stencil = { get: vi.fn(), list: vi.fn(), resolve: vi.fn() };
    getStencil.mockReturnValue(stencil);

    const callback = await registerCommandAndGetCallback();
    await callback({
      metadata: {
        description: 'Alpha template',
        kind: 'template',
        source: 'project',
        templateFilePath: '/workspace/.stencil/templates/alpha.md',
        templateName: 'alpha',
      },
    });

    expect(runTemplate).toHaveBeenCalledWith({
      invocationSource: 'tree-item',
      options: {
        chatMode: 'ask',
        deliveryTarget: 'copilot-chat',
        mode: 'insert',
      },
      requestedTarget: { templateName: 'alpha' },
      stencil,
      workspace,
    });
  });

  it('routes failures through the shared command error handler', async () => {
    const failure = new Error('run failed');
    runTemplate.mockRejectedValue(failure);

    const callback = await registerCommandAndGetCallback();
    await callback('alpha');

    expect(showCommandError).toHaveBeenCalledWith(failure);
    expect(showRunTemplateOutcomeMessage).not.toHaveBeenCalled();
  });

  it('surfaces service-owned fallback outcomes unchanged from the default command', async () => {
    const stencil = { get: vi.fn(), list: vi.fn(), resolve: vi.fn() };
    getStencil.mockReturnValue(stencil);
    runTemplate.mockResolvedValue({
      delivery: {
        deliveryActionLabel: 'opened',
        deliveryTarget: 'editor',
        deliveryTargetLabel: 'new editor',
      },
      fallbackReason:
        'Copilot Chat failed: chat open failed. Opened the resolved prompt in a new editor instead.',
      kind: 'completed-with-fallback',
      requestedDeliveryTarget: 'copilot-chat',
      templateName: 'alpha',
    });

    const callback = await registerCommandAndGetCallback();
    await callback('alpha');

    expect(showRunTemplateOutcomeMessage).toHaveBeenCalledWith({
      delivery: {
        deliveryActionLabel: 'opened',
        deliveryTarget: 'editor',
        deliveryTargetLabel: 'new editor',
      },
      fallbackReason:
        'Copilot Chat failed: chat open failed. Opened the resolved prompt in a new editor instead.',
      kind: 'completed-with-fallback',
      requestedDeliveryTarget: 'copilot-chat',
      templateName: 'alpha',
    });
  });

  it('surfaces service-owned delivery failures unchanged from explicit command paths', async () => {
    const stencil = { get: vi.fn(), list: vi.fn(), resolve: vi.fn() };
    getStencil.mockReturnValue(stencil);
    runTemplate.mockResolvedValue({
      deliveryTarget: 'lm-api',
      kind: 'delivery-failed',
      reason:
        'Stencil Language Model execution is blocked for the selected model. Check provider access or quota and try again.',
      templateName: 'alpha',
    });

    const callback = await registerCommandAndGetCallback(
      {
        deliveryTarget: 'lm-api',
      },
      'stencil.runTemplateWithLanguageModel',
    );
    await callback('alpha');

    expect(showRunTemplateOutcomeMessage).toHaveBeenCalledWith({
      deliveryTarget: 'lm-api',
      kind: 'delivery-failed',
      reason:
        'Stencil Language Model execution is blocked for the selected model. Check provider access or quota and try again.',
      templateName: 'alpha',
    });
  });

  it('uses the picker-selected profile for the default command when configured', async () => {
    const stencil = { get: vi.fn(), list: vi.fn(), resolve: vi.fn() };
    const preferenceStore = createPreferenceStore();
    getStencil.mockReturnValue(stencil);
    getResolvedRunConfiguration.mockResolvedValue({
      defaultProfile: {
        chatMode: 'ask',
        deliveryTarget: 'copilot-chat',
        mode: 'insert',
      },
      lastUsedScope: 'workspace',
      selectionBehavior: 'picker',
      warnings: [],
    });
    pickRunProfile.mockResolvedValue({
      chatMode: 'ask',
      deliveryTarget: 'lm-api',
      mode: 'execute',
    });
    runTemplate.mockResolvedValue({ delivery: {}, kind: 'completed', templateName: 'alpha' });

    const callback = await registerCommandAndGetCallback(undefined, 'stencil.runTemplate', {
      preferenceStore,
    });
    await callback('alpha');

    expect(pickRunProfile).toHaveBeenCalledTimes(1);
    expect(runTemplate).toHaveBeenCalledWith({
      invocationSource: 'command-palette',
      options: {
        chatMode: 'ask',
        deliveryTarget: 'lm-api',
        mode: 'execute',
      },
      requestedTarget: { templateName: 'alpha' },
      stencil,
      workspace,
    });
    expect(preferenceStore.setLastUsedProfile).toHaveBeenCalledWith('session', {
      chatMode: 'ask',
      deliveryTarget: 'lm-api',
      mode: 'execute',
    });
  });

  it('uses a clipboard default profile from configuration without further normalization', async () => {
    const stencil = { get: vi.fn(), list: vi.fn(), resolve: vi.fn() };
    getStencil.mockReturnValue(stencil);
    getResolvedRunConfiguration.mockResolvedValue({
      defaultProfile: {
        chatMode: 'ask',
        deliveryTarget: 'clipboard',
        mode: 'default',
      },
      lastUsedScope: 'session',
      selectionBehavior: 'defaults',
      warnings: [],
    });

    const callback = await registerCommandAndGetCallback();
    await callback('alpha');

    expect(runTemplate).toHaveBeenCalledWith({
      invocationSource: 'command-palette',
      options: {
        chatMode: 'ask',
        deliveryTarget: 'clipboard',
        mode: 'default',
      },
      requestedTarget: { templateName: 'alpha' },
      stencil,
      workspace,
    });
  });

  it('skips the default command when the configured picker is cancelled', async () => {
    getResolvedRunConfiguration.mockResolvedValue({
      defaultProfile: {
        chatMode: 'ask',
        deliveryTarget: 'copilot-chat',
        mode: 'insert',
      },
      lastUsedScope: 'session',
      selectionBehavior: 'picker',
      warnings: [],
    });
    pickRunProfile.mockResolvedValue(undefined);

    const callback = await registerCommandAndGetCallback();
    await callback('alpha');

    expect(runTemplate).not.toHaveBeenCalled();
    expect(showRunTemplateOutcomeMessage).not.toHaveBeenCalled();
  });

  it('reuses the last-used profile when configured and a stored profile exists', async () => {
    const stencil = { get: vi.fn(), list: vi.fn(), resolve: vi.fn() };
    const preferenceStore = createPreferenceStore({
      getLastUsedProfile: vi.fn().mockResolvedValue({
        chatMode: 'edit',
        deliveryTarget: 'copilot-chat',
        mode: 'insert',
      }),
    });
    getStencil.mockReturnValue(stencil);
    getResolvedRunConfiguration.mockResolvedValue({
      defaultProfile: {
        chatMode: 'ask',
        deliveryTarget: 'copilot-chat',
        mode: 'insert',
      },
      lastUsedScope: 'workspace',
      selectionBehavior: 'last-used',
      warnings: [],
    });
    normalizeRunProfile.mockResolvedValue({
      chatMode: 'edit',
      deliveryTarget: 'copilot-chat',
      mode: 'insert',
    });

    const callback = await registerCommandAndGetCallback(undefined, 'stencil.runTemplate', {
      preferenceStore,
    });
    await callback('alpha');

    expect(preferenceStore.getLastUsedProfile).toHaveBeenCalledWith('workspace');
    expect(runTemplate).toHaveBeenCalledWith({
      invocationSource: 'command-palette',
      options: {
        chatMode: 'edit',
        deliveryTarget: 'copilot-chat',
        mode: 'insert',
      },
      requestedTarget: { templateName: 'alpha' },
      stencil,
      workspace,
    });
  });

  it('passes explicit execution options through command wiring', async () => {
    const stencil = { get: vi.fn(), list: vi.fn(), resolve: vi.fn() };
    getStencil.mockReturnValue(stencil);

    const callback = await registerCommandAndGetCallback({
      deliveryTarget: 'copilot-chat',
      mode: 'send',
    });
    await callback('alpha');

    expect(runTemplate).toHaveBeenCalledWith({
      invocationSource: 'command-palette',
      options: {
        chatMode: 'ask',
        deliveryTarget: 'copilot-chat',
        mode: 'send',
      },
      requestedTarget: { templateName: 'alpha' },
      stencil,
      workspace,
    });
  });

  it('registers the Copilot Chat command with explicit insert options', async () => {
    const stencil = { get: vi.fn(), list: vi.fn(), resolve: vi.fn() };
    getStencil.mockReturnValue(stencil);

    const callback = await registerCommandAndGetCallback(
      {
        deliveryTarget: 'copilot-chat',
        mode: 'insert',
      },
      'stencil.runTemplateInCopilotChat',
    );
    await callback('alpha');

    expect(runTemplate).toHaveBeenCalledWith({
      invocationSource: 'command-palette',
      options: {
        chatMode: 'ask',
        deliveryTarget: 'copilot-chat',
        mode: 'insert',
      },
      requestedTarget: { templateName: 'alpha' },
      stencil,
      workspace,
    });
  });

  it('registers the clipboard command with explicit clipboard options', async () => {
    const stencil = { get: vi.fn(), list: vi.fn(), resolve: vi.fn() };
    getStencil.mockReturnValue(stencil);

    const callback = await registerCommandAndGetCallback(
      {
        deliveryTarget: 'clipboard',
      },
      'stencil.runTemplateToClipboard',
    );
    await callback('alpha');

    expect(runTemplate).toHaveBeenCalledWith({
      invocationSource: 'command-palette',
      options: {
        chatMode: 'ask',
        deliveryTarget: 'clipboard',
        mode: 'default',
      },
      requestedTarget: { templateName: 'alpha' },
      stencil,
      workspace,
    });
  });

  it('registers the Copilot Chat send command with explicit send options', async () => {
    const stencil = { get: vi.fn(), list: vi.fn(), resolve: vi.fn() };
    getStencil.mockReturnValue(stencil);

    const callback = await registerCommandAndGetCallback(
      {
        deliveryTarget: 'copilot-chat',
        mode: 'send',
      },
      'stencil.runTemplateInCopilotChatSend',
    );
    await callback('alpha');

    expect(runTemplate).toHaveBeenCalledWith({
      invocationSource: 'command-palette',
      options: {
        chatMode: 'ask',
        deliveryTarget: 'copilot-chat',
        mode: 'send',
      },
      requestedTarget: { templateName: 'alpha' },
      stencil,
      workspace,
    });
  });

  it('supports an explicit lm-api command wiring shape for future registration', async () => {
    const stencil = { get: vi.fn(), list: vi.fn(), resolve: vi.fn() };
    getStencil.mockReturnValue(stencil);

    const callback = await registerCommandAndGetCallback(
      {
        deliveryTarget: 'lm-api',
      },
      'stencil.runTemplateWithLanguageModel',
    );
    await callback('alpha');

    expect(runTemplate).toHaveBeenCalledWith({
      invocationSource: 'command-palette',
      options: {
        chatMode: 'ask',
        deliveryTarget: 'lm-api',
        mode: 'execute',
      },
      requestedTarget: { templateName: 'alpha' },
      stencil,
      workspace,
    });
  });

  it('runs with the only available language model without prompting', async () => {
    const stencil = { get: vi.fn(), list: vi.fn(), resolve: vi.fn() };
    getStencil.mockReturnValue(stencil);
    selectChatModels.mockResolvedValue([{ id: 'copilot-1', name: 'Copilot Model' }]);

    const callback = await registerLanguageModelSelectionCommandAndGetCallback();
    await callback('alpha');

    expect(showQuickPick).not.toHaveBeenCalled();
    expect(runTemplate).toHaveBeenCalledWith({
      invocationSource: 'command-palette',
      options: {
        deliveryTarget: 'lm-api',
      },
      requestedTarget: { templateName: 'alpha' },
      selectedLanguageModelId: 'copilot-1',
      stencil,
      workspace,
    });
  });

  it('prompts for a language model when multiple compatible models are available', async () => {
    const stencil = { get: vi.fn(), list: vi.fn(), resolve: vi.fn() };
    getStencil.mockReturnValue(stencil);
    selectChatModels.mockResolvedValue([
      { id: 'copilot-1', name: 'Copilot Model 1' },
      { id: 'copilot-2', name: 'Copilot Model 2' },
    ]);
    showQuickPick.mockResolvedValue({
      description: 'copilot-2',
      label: 'Copilot Model 2',
      value: 'copilot-2',
    });

    const callback = await registerLanguageModelSelectionCommandAndGetCallback();
    await callback('alpha');

    expect(showQuickPick).toHaveBeenCalledWith(
      [
        {
          description: 'copilot-1',
          label: 'Copilot Model 1',
          value: 'copilot-1',
        },
        {
          description: 'copilot-2',
          label: 'Copilot Model 2',
          value: 'copilot-2',
        },
      ],
      {
        placeHolder: 'Select a language model',
        title: 'Stencil: Run Template with Language Model',
      },
    );
    expect(runTemplate).toHaveBeenCalledWith({
      invocationSource: 'command-palette',
      options: {
        deliveryTarget: 'lm-api',
      },
      requestedTarget: { templateName: 'alpha' },
      selectedLanguageModelId: 'copilot-2',
      stencil,
      workspace,
    });
  });

  it('skips lm-api execution when the language model picker is cancelled', async () => {
    selectChatModels.mockResolvedValue([
      { id: 'copilot-1', name: 'Copilot Model 1' },
      { id: 'copilot-2', name: 'Copilot Model 2' },
    ]);
    showQuickPick.mockResolvedValue(undefined);

    const callback = await registerLanguageModelSelectionCommandAndGetCallback();
    await callback('alpha');

    expect(runTemplate).not.toHaveBeenCalled();
    expect(showRunTemplateOutcomeMessage).not.toHaveBeenCalled();
  });

  it('uses the unified run-with-mode picker command and preserves tree-item invocation', async () => {
    const stencil = { get: vi.fn(), list: vi.fn(), resolve: vi.fn() };
    const preferenceStore = createPreferenceStore();
    getStencil.mockReturnValue(stencil);
    pickRunProfile.mockResolvedValue({
      chatMode: 'ask',
      deliveryTarget: 'editor',
      mode: 'default',
    });
    runTemplate.mockResolvedValue({ delivery: {}, kind: 'completed', templateName: 'alpha' });

    const callback = await registerRunTemplateWithModeCommandAndGetCallback(preferenceStore);
    await callback({
      metadata: {
        description: 'Alpha template',
        kind: 'template',
        source: 'project',
        templateFilePath: '/workspace/.stencil/templates/alpha.md',
        templateName: 'alpha',
      },
    });

    expect(runTemplate).toHaveBeenCalledWith({
      invocationSource: 'tree-item',
      options: {
        chatMode: 'ask',
        deliveryTarget: 'editor',
        mode: 'default',
      },
      requestedTarget: { templateName: 'alpha' },
      stencil,
      workspace,
    });
    expect(preferenceStore.setLastUsedProfile).toHaveBeenCalledWith('session', {
      chatMode: 'ask',
      deliveryTarget: 'editor',
      mode: 'default',
    });
  });

  it('selects a supported Copilot chat mode before running', async () => {
    const stencil = { get: vi.fn(), list: vi.fn(), resolve: vi.fn() };
    getStencil.mockReturnValue(stencil);
    showQuickPick.mockResolvedValue({
      description: 'Insert into Copilot Chat Agent mode',
      label: 'Agent',
      value: 'agent',
    });

    const callback = await registerModeSelectionCommandAndGetCallback();
    await callback('alpha');

    expect(getDeliveryTargetCapability).toHaveBeenCalledWith('copilot-chat');
    expect(runTemplate).toHaveBeenCalledWith({
      invocationSource: 'command-palette',
      options: {
        chatMode: 'agent',
        deliveryTarget: 'copilot-chat',
        mode: 'insert',
      },
      requestedTarget: { templateName: 'alpha' },
      stencil,
      workspace,
    });
  });

  it('skips running when the Copilot chat-mode selection is cancelled', async () => {
    showQuickPick.mockResolvedValue(undefined);

    const callback = await registerModeSelectionCommandAndGetCallback();
    await callback('alpha');

    expect(runTemplate).not.toHaveBeenCalled();
    expect(showRunTemplateOutcomeMessage).not.toHaveBeenCalled();
  });

  async function registerCommandAndGetCallback(
    executionOptions?: Partial<RunTemplateExecutionOptions>,
    commandId = 'stencil.runTemplate.test',
    services?: { preferenceStore?: ReturnType<typeof createPreferenceStore> },
  ): Promise<(...args: unknown[]) => Promise<void>> {
    const { registerRunTemplateCommand } = await import('../../../src/commands/runTemplate.js');
    registerRunTemplateCommand(commandId, executionOptions, services);
    const call = registerCommand.mock.calls.find(
      ([registeredCommandId]) => registeredCommandId === commandId,
    );
    expect(call).toBeDefined();
    return call?.[1] as (...args: unknown[]) => Promise<void>;
  }

  async function registerModeSelectionCommandAndGetCallback(): Promise<
    (...args: unknown[]) => Promise<void>
  > {
    const { registerRunTemplateInCopilotChatWithModeCommand } =
      await import('../../../src/commands/runTemplate.js');
    registerRunTemplateInCopilotChatWithModeCommand('stencil.runTemplateInCopilotChatWithMode');
    const call = registerCommand.mock.calls.find(
      ([registeredCommandId]) => registeredCommandId === 'stencil.runTemplateInCopilotChatWithMode',
    );
    expect(call).toBeDefined();
    return call?.[1] as (...args: unknown[]) => Promise<void>;
  }

  async function registerRunTemplateWithModeCommandAndGetCallback(
    preferenceStore = createPreferenceStore(),
  ): Promise<(...args: unknown[]) => Promise<void>> {
    const { registerRunTemplateWithModeCommand } =
      await import('../../../src/commands/runTemplate.js');
    registerRunTemplateWithModeCommand('stencil.runTemplateWithMode', {
      preferenceStore,
    });
    const call = registerCommand.mock.calls.find(
      ([registeredCommandId]) => registeredCommandId === 'stencil.runTemplateWithMode',
    );
    expect(call).toBeDefined();
    return call?.[1] as (...args: unknown[]) => Promise<void>;
  }

  async function registerLanguageModelSelectionCommandAndGetCallback(): Promise<
    (...args: unknown[]) => Promise<void>
  > {
    const { registerRunTemplateWithLanguageModelSelectModelCommand } =
      await import('../../../src/commands/runTemplate.js');
    registerRunTemplateWithLanguageModelSelectModelCommand(
      'stencil.runTemplateWithLanguageModelSelectModel',
    );
    const call = registerCommand.mock.calls.find(
      ([registeredCommandId]) =>
        registeredCommandId === 'stencil.runTemplateWithLanguageModelSelectModel',
    );
    expect(call).toBeDefined();
    return call?.[1] as (...args: unknown[]) => Promise<void>;
  }

  function createPreferenceStore(
    overrides?: Partial<{
      getLastUsedProfile: ReturnType<typeof vi.fn>;
      setLastUsedProfile: ReturnType<typeof vi.fn>;
    }>,
  ) {
    return {
      getLastUsedProfile: overrides?.getLastUsedProfile ?? vi.fn().mockResolvedValue(undefined),
      setLastUsedProfile: overrides?.setLastUsedProfile ?? vi.fn().mockResolvedValue(undefined),
    };
  }
});
