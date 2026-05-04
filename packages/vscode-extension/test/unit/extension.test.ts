import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('activate', () => {
  const registerCommand = vi.fn();
  const registerTreeDataProvider = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    registerCommand.mockReset();
    registerTreeDataProvider.mockReset();

    registerCommand.mockImplementation((commandId: string) => ({
      commandId,
      dispose: vi.fn(),
    }));
    registerTreeDataProvider.mockImplementation((viewId: string, provider: unknown) => ({
      dispose: vi.fn(),
      provider,
      viewId,
    }));

    vi.doMock('vscode', () => ({
      commands: {
        registerCommand,
      },
      languages: {
        getDiagnostics: vi.fn().mockReturnValue([]),
      },
      TreeItem: class {
        constructor(
          readonly label: string,
          readonly collapsibleState: number,
        ) {}
      },
      TreeItemCollapsibleState: {
        None: 0,
      },
      window: {
        activeTextEditor: undefined,
        registerTreeDataProvider,
      },
      workspace: {
        getWorkspaceFolder: vi.fn(),
        workspaceFolders: undefined,
      },
    }));
  });

  it('registers commands and the tree provider', async () => {
    const { activate } = await import('../../src/extension.js');

    const context = { subscriptions: [] as { dispose(): void }[] };
    activate(context as never);

    expect(registerCommand).toHaveBeenCalledTimes(3);
    expect(registerCommand).toHaveBeenCalledWith('stencil.runTemplate', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('stencil.createTemplate', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('stencil.listTemplates', expect.any(Function));
    expect(registerTreeDataProvider).toHaveBeenCalledWith('stencilTemplates', expect.any(Object));
    expect(context.subscriptions).toHaveLength(4);
  });
});
