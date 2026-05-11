import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('registerRunTemplateCommand', () => {
  const registerCommand = vi.fn();
  const showCommandError = vi.fn();
  const hasStencilWorkspaceSetup = vi.fn();
  const resolveWorkspace = vi.fn();
  const getStencil = vi.fn();
  const runTemplate = vi.fn();
  const showRunTemplateOutcomeMessage = vi.fn();

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
    showCommandError.mockReset();
    hasStencilWorkspaceSetup.mockReset();
    resolveWorkspace.mockReset();
    getStencil.mockReset();
    runTemplate.mockReset();
    showRunTemplateOutcomeMessage.mockReset();

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

    vi.doMock('vscode', () => ({
      commands: {
        registerCommand,
      },
      window: {
        showInformationMessage: vi.fn(),
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

  async function registerCommandAndGetCallback(): Promise<(...args: unknown[]) => Promise<void>> {
    const { registerRunTemplateCommand } = await import('../../../src/commands/runTemplate.js');
    registerRunTemplateCommand();
    return registerCommand.mock.calls[0][1];
  }
});
