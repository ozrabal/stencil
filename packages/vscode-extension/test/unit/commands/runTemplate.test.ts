import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('registerRunTemplateCommand', () => {
  const getDeliveryTargetCapability = vi.fn();
  const registerCommand = vi.fn();
  const showCommandError = vi.fn();
  const hasStencilWorkspaceSetup = vi.fn();
  const resolveWorkspace = vi.fn();
  const getStencil = vi.fn();
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
    showCommandError.mockReset();
    hasStencilWorkspaceSetup.mockReset();
    resolveWorkspace.mockReset();
    getStencil.mockReset();
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
    getStencil.mockReturnValue({ list: vi.fn() });
    runTemplate.mockResolvedValue({ kind: 'no-target-selected', reason: 'picker-cancelled' });
    getDeliveryTargetCapability.mockResolvedValue({
      available: true,
      implemented: true,
      supportedChatModes: ['ask', 'edit', 'agent'],
      supportedModes: ['default', 'insert', 'send'],
      target: 'copilot-chat',
    });

    vi.doMock('vscode', () => ({
      commands: {
        registerCommand,
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

    vi.doMock('../../../src/services/delivery/capabilities.js', () => ({
      getDeliveryTargetCapability,
    }));
  });

  it('passes an explicit string target through the canonical run request', async () => {
    const stencil = { get: vi.fn(), list: vi.fn(), resolve: vi.fn() };
    getStencil.mockReturnValue(stencil);

    const callback = await registerCommandAndGetCallback();
    await callback('alpha');

    expect(runTemplate).toHaveBeenCalledWith({
      invocationSource: 'command-palette',
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
        deliveryTarget: 'copilot-chat',
        mode: 'insert',
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
        deliveryTarget: 'copilot-chat',
        mode: 'send',
      },
      requestedTarget: { templateName: 'alpha' },
      stencil,
      workspace,
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
    executionOptions?: { deliveryTarget?: 'copilot-chat'; mode?: 'insert' | 'send' },
    commandId = 'stencil.runTemplate.test',
  ): Promise<(...args: unknown[]) => Promise<void>> {
    const { registerRunTemplateCommand } = await import('../../../src/commands/runTemplate.js');
    registerRunTemplateCommand(commandId, executionOptions);
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
});
