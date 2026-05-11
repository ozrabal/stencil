import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('registerWorkspaceCommand', () => {
  const registerCommand = vi.fn();
  const showInformationMessage = vi.fn();
  const showCommandError = vi.fn();
  const hasStencilWorkspaceSetup = vi.fn();
  const resolveWorkspace = vi.fn();
  const getStencil = vi.fn();

  beforeEach(() => {
    vi.resetModules();

    registerCommand.mockReset();
    showInformationMessage.mockReset();
    showCommandError.mockReset();
    hasStencilWorkspaceSetup.mockReset();
    resolveWorkspace.mockReset();
    getStencil.mockReset();

    registerCommand.mockImplementation((commandId: string, callback: () => Promise<void>) => ({
      callback,
      commandId,
      dispose: vi.fn(),
    }));

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
  });

  it('shows actionable guidance when no workspace is open', async () => {
    resolveWorkspace.mockReturnValue({ kind: 'missing-workspace' });

    const handler = vi.fn();
    const callback = await registerCommandAndGetCallback({
      commandId: 'stencil.test',
      handler,
    });
    await callback();

    expect(showInformationMessage).toHaveBeenCalledWith(
      'Open a workspace folder to use Stencil commands.',
    );
    expect(hasStencilWorkspaceSetup).not.toHaveBeenCalled();
    expect(getStencil).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('shows setup guidance when .stencil is missing for commands that require it', async () => {
    const workspace = {
      kind: 'workspace' as const,
      rootPath: '/workspace',
      workspaceFolder: {
        index: 0,
        name: 'workspace',
        uri: { fsPath: '/workspace' },
      },
    };
    resolveWorkspace.mockReturnValue(workspace);
    hasStencilWorkspaceSetup.mockResolvedValue(false);

    const handler = vi.fn();
    const callback = await registerCommandAndGetCallback({
      commandId: 'stencil.test',
      handler,
    });
    await callback();

    expect(showInformationMessage).toHaveBeenCalledWith(
      'Stencil is not set up in this workspace yet. Add a .stencil/ directory to continue.',
    );
    expect(getStencil).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('lets first-time commands opt out of the .stencil setup requirement', async () => {
    const workspace = {
      kind: 'workspace' as const,
      rootPath: '/workspace',
      workspaceFolder: {
        index: 0,
        name: 'workspace',
        uri: { fsPath: '/workspace' },
      },
    };
    const stencil = { create: vi.fn() };
    const handler = vi.fn();

    resolveWorkspace.mockReturnValue(workspace);
    getStencil.mockReturnValue(stencil);

    const callback = await registerCommandAndGetCallback({
      commandId: 'stencil.test',
      handler,
      requireStencilSetup: false,
    });
    await callback('arg');

    expect(hasStencilWorkspaceSetup).not.toHaveBeenCalled();
    expect(getStencil).toHaveBeenCalledWith(workspace);
    expect(handler).toHaveBeenCalledWith({
      commandArgs: ['arg'],
      stencil,
      workspace,
    });
  });

  async function registerCommandAndGetCallback(options: {
    commandId: string;
    handler: (context: unknown) => Promise<void>;
    requireStencilSetup?: boolean;
  }): Promise<(...args: unknown[]) => Promise<void>> {
    const { registerWorkspaceCommand } = await import('../../../src/commands/shared.js');
    registerWorkspaceCommand(options);
    return registerCommand.mock.calls[0][1];
  }
});
