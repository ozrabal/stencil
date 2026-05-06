import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('registerRunTemplateCommand', () => {
  const registerCommand = vi.fn();
  const showInformationMessage = vi.fn();
  const showCommandError = vi.fn();
  const hasStencilWorkspaceSetup = vi.fn();
  const resolveWorkspace = vi.fn();
  const getStencil = vi.fn();
  const resolveRunTemplateTarget = vi.fn();
  const openResolvedTemplateOutput = vi.fn();

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
    showInformationMessage.mockReset();
    showCommandError.mockReset();
    hasStencilWorkspaceSetup.mockReset();
    resolveWorkspace.mockReset();
    getStencil.mockReset();
    resolveRunTemplateTarget.mockReset();
    openResolvedTemplateOutput.mockReset();

    registerCommand.mockImplementation(
      (commandId: string, callback: (...args: unknown[]) => Promise<void>) => ({
        callback,
        commandId,
        dispose: vi.fn(),
      }),
    );
    hasStencilWorkspaceSetup.mockResolvedValue(true);
    resolveWorkspace.mockReturnValue(workspace);

    vi.doMock('vscode', () => ({
      commands: {
        registerCommand,
      },
      window: {
        showInformationMessage,
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

    vi.doMock('../../../src/services/runTemplateTarget.js', () => ({
      resolveRunTemplateTarget,
    }));

    vi.doMock('../../../src/services/output.js', () => ({
      openResolvedTemplateOutput,
    }));
  });

  it('resolves and opens a no-placeholder template', async () => {
    const resolve = vi.fn().mockResolvedValue({ resolvedBody: '# Prompt', unresolvedCount: 0 });
    getStencil.mockReturnValue({ resolve });
    resolveRunTemplateTarget.mockResolvedValue('alpha');
    openResolvedTemplateOutput.mockResolvedValue({ deliveryTargetLabel: 'new editor' });

    const callback = await registerCommandAndGetCallback();
    await callback();

    expect(resolveRunTemplateTarget).toHaveBeenCalledWith({
      commandArgs: [],
      stencil: expect.objectContaining({ resolve }),
      workspace,
    });
    expect(resolve).toHaveBeenCalledWith('alpha', {});
    expect(openResolvedTemplateOutput).toHaveBeenCalledWith('# Prompt');
    expect(showInformationMessage).toHaveBeenCalledWith(
      'Ran "alpha". Opened resolved prompt in a new editor.',
    );
  });

  it('resolves and opens a defaults-only template', async () => {
    const resolve = vi.fn().mockResolvedValue({
      resolvedBody: '# Prompt with defaults',
      unresolvedCount: 0,
    });
    getStencil.mockReturnValue({ resolve });
    resolveRunTemplateTarget.mockResolvedValue('with-default');
    openResolvedTemplateOutput.mockResolvedValue({ deliveryTargetLabel: 'new editor' });

    const callback = await registerCommandAndGetCallback();
    await callback();

    expect(resolve).toHaveBeenCalledWith('with-default', {});
    expect(openResolvedTemplateOutput).toHaveBeenCalledWith('# Prompt with defaults');
  });

  it('resolves and opens a context-only template', async () => {
    const resolve = vi.fn().mockResolvedValue({
      resolvedBody: '# Prompt with context',
      unresolvedCount: 0,
    });
    getStencil.mockReturnValue({ resolve });
    resolveRunTemplateTarget.mockResolvedValue('ctx-template');
    openResolvedTemplateOutput.mockResolvedValue({ deliveryTargetLabel: 'new editor' });

    const callback = await registerCommandAndGetCallback();
    await callback('ctx-template');

    expect(resolveRunTemplateTarget).toHaveBeenCalledWith({
      commandArgs: ['ctx-template'],
      stencil: expect.objectContaining({ resolve }),
      workspace,
    });
    expect(resolve).toHaveBeenCalledWith('ctx-template', {});
    expect(openResolvedTemplateOutput).toHaveBeenCalledWith('# Prompt with context');
  });

  it('shows the step-specific input message when placeholders remain unresolved', async () => {
    const resolve = vi.fn().mockResolvedValue({
      resolvedBody: '# Needs input',
      unresolvedCount: 2,
    });
    getStencil.mockReturnValue({ resolve });
    resolveRunTemplateTarget.mockResolvedValue('needs-input');

    const callback = await registerCommandAndGetCallback();
    await callback();

    expect(resolve).toHaveBeenCalledWith('needs-input', {});
    expect(openResolvedTemplateOutput).not.toHaveBeenCalled();
    expect(showInformationMessage).toHaveBeenCalledWith(
      'Template "needs-input" requires placeholder input. Manual input collection will arrive in the next step.',
    );
  });

  it('exits quietly when template selection is cancelled', async () => {
    const resolve = vi.fn();
    getStencil.mockReturnValue({ resolve });
    resolveRunTemplateTarget.mockResolvedValue(undefined);

    const callback = await registerCommandAndGetCallback();
    await callback();

    expect(resolve).not.toHaveBeenCalled();
    expect(openResolvedTemplateOutput).not.toHaveBeenCalled();
    expect(showInformationMessage).not.toHaveBeenCalled();
  });

  it('routes failures through the shared command error handler', async () => {
    const failure = new Error('run failed');
    const resolve = vi.fn().mockRejectedValue(failure);
    getStencil.mockReturnValue({ resolve });
    resolveRunTemplateTarget.mockResolvedValue('alpha');

    const callback = await registerCommandAndGetCallback();
    await callback();

    expect(showCommandError).toHaveBeenCalledWith(failure);
  });

  async function registerCommandAndGetCallback(): Promise<(...args: unknown[]) => Promise<void>> {
    const { registerRunTemplateCommand } = await import('../../../src/commands/runTemplate.js');
    registerRunTemplateCommand();
    return registerCommand.mock.calls[0][1];
  }
});
