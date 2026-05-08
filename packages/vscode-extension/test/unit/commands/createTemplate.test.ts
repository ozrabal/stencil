import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('registerCreateTemplateCommand', () => {
  const registerCommand = vi.fn();
  const showInputBox = vi.fn();
  const showQuickPick = vi.fn();
  const showInformationMessage = vi.fn();
  const showErrorMessage = vi.fn();
  const showTextDocument = vi.fn();
  const openTextDocument = vi.fn();
  const showCommandError = vi.fn();
  const hasStencilWorkspaceSetup = vi.fn();
  const resolveWorkspace = vi.fn();
  const getStencil = vi.fn();
  const loadStencilConfig = vi.fn();

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
    showInputBox.mockReset();
    showQuickPick.mockReset();
    showInformationMessage.mockReset();
    showErrorMessage.mockReset();
    showTextDocument.mockReset();
    openTextDocument.mockReset();
    showCommandError.mockReset();
    hasStencilWorkspaceSetup.mockReset();
    resolveWorkspace.mockReset();
    getStencil.mockReset();
    loadStencilConfig.mockReset();

    registerCommand.mockImplementation(
      (commandId: string, callback: (...args: unknown[]) => Promise<void>) => ({
        callback,
        commandId,
        dispose: vi.fn(),
      }),
    );
    hasStencilWorkspaceSetup.mockResolvedValue(false);
    resolveWorkspace.mockReturnValue(workspace);
    loadStencilConfig.mockResolvedValue({
      placeholderEnd: '}}',
      placeholderStart: '{{',
      version: 1,
    });

    vi.doMock('vscode', () => ({
      commands: {
        registerCommand,
      },
      QuickPickItemKind: {
        Separator: -1,
      },
      window: {
        showErrorMessage,
        showInformationMessage,
        showInputBox,
        showQuickPick,
        showTextDocument,
      },
      workspace: {
        openTextDocument,
      },
    }));

    vi.doMock('../../../src/core/index.js', () => ({
      loadStencilConfig,
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

  it('creates a template in a first-time workspace, then opens it and refreshes the tree', async () => {
    const events: string[] = [];
    const listCollections = vi.fn().mockResolvedValue(['backend']);
    const get = vi.fn().mockResolvedValue(null);
    const init = vi.fn().mockImplementation(async () => {
      events.push('init');
    });
    const create = vi.fn().mockImplementation(async () => {
      events.push('create');
      return {
        body: 'Seed prompt',
        collection: 'backend',
        filePath: '/workspace/.stencil/collections/backend/new-template.md',
        frontmatter: {
          description: 'New template',
          name: 'new-template',
          tags: ['backend', 'review'],
          version: 1,
        },
        source: 'project',
      };
    });
    getStencil.mockReturnValue({
      collections: { listCollections },
      create,
      get,
      init,
    });

    showInputBox
      .mockResolvedValueOnce('  new-template  ')
      .mockResolvedValueOnce('  New template  ')
      .mockResolvedValueOnce('backend, review, Backend')
      .mockResolvedValueOnce(' Seed prompt ');
    showQuickPick.mockResolvedValue({
      choice: { collectionName: 'backend', kind: 'collection' },
      description: 'Collection',
      detail: 'Save under .stencil/collections/backend/.',
      label: 'backend',
    });

    const document = { uri: { fsPath: '/workspace/.stencil/collections/backend/new-template.md' } };
    openTextDocument.mockResolvedValue(document);
    const templateTreeProvider = { refresh: vi.fn() };

    const callback = await registerCommandAndGetCallback(templateTreeProvider);
    await callback();

    expect(hasStencilWorkspaceSetup).not.toHaveBeenCalled();
    expect(loadStencilConfig).toHaveBeenCalledWith('/workspace/.stencil');
    expect(listCollections).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('new-template');
    expect(init).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      {
        description: 'New template',
        name: 'new-template',
        tags: ['backend', 'review'],
        version: 1,
      },
      'Seed prompt',
      'backend',
    );
    expect(events).toEqual(['init', 'create']);
    expect(openTextDocument).toHaveBeenCalledWith(
      '/workspace/.stencil/collections/backend/new-template.md',
    );
    expect(showTextDocument).toHaveBeenCalledWith(document);
    expect(templateTreeProvider.refresh).toHaveBeenCalledTimes(1);
    expect(showInformationMessage).toHaveBeenCalledWith('Created template "new-template".');
  });

  it('cancels cleanly before any write when the wizard is dismissed', async () => {
    const listCollections = vi.fn().mockResolvedValue([]);
    const get = vi.fn();
    const init = vi.fn();
    const create = vi.fn();
    getStencil.mockReturnValue({
      collections: { listCollections },
      create,
      get,
      init,
    });
    showInputBox.mockResolvedValueOnce(undefined);

    const callback = await registerCommandAndGetCallback({ refresh: vi.fn() });
    await callback();

    expect(listCollections).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
    expect(init).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(openTextDocument).not.toHaveBeenCalled();
    expect(showInformationMessage).not.toHaveBeenCalled();
  });

  it('blocks duplicate names before init or create and names the conflict source', async () => {
    const listCollections = vi.fn().mockResolvedValue([]);
    const existingTemplate = {
      body: 'Existing body',
      collection: 'backend',
      filePath: '/workspace/.stencil/collections/backend/existing-template.md',
      frontmatter: {
        description: 'Existing template',
        name: 'existing-template',
        version: 1,
      },
      source: 'global' as const,
    };
    const get = vi.fn().mockResolvedValue(existingTemplate);
    const init = vi.fn();
    const create = vi.fn();
    getStencil.mockReturnValue({
      collections: { listCollections },
      create,
      get,
      init,
    });

    showInputBox
      .mockResolvedValueOnce('existing-template')
      .mockResolvedValueOnce('Existing template')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');
    showQuickPick.mockResolvedValue({
      choice: { kind: 'uncategorized' },
      description: 'Save under .stencil/templates/',
      detail: 'Creates a root template outside any collection.',
      label: 'Uncategorized',
    });

    const callback = await registerCommandAndGetCallback({ refresh: vi.fn() });
    await callback();

    expect(get).toHaveBeenCalledWith('existing-template');
    expect(init).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(showErrorMessage).toHaveBeenCalledWith(
      'Template "existing-template" already exists in global templates in the "backend" collection. Choose a different name.',
    );
  });

  it('exposes inline validation for invalid names on the first prompt', async () => {
    getStencil.mockReturnValue({
      collections: { listCollections: vi.fn().mockResolvedValue([]) },
      create: vi.fn(),
      get: vi.fn(),
      init: vi.fn(),
    });
    showInputBox.mockResolvedValueOnce(undefined);

    const callback = await registerCommandAndGetCallback({ refresh: vi.fn() });
    await callback();

    const namePromptOptions = showInputBox.mock.calls[0]?.[0];
    expect(namePromptOptions?.validateInput('BadName')).toBe(
      'Template name must be kebab-case, like "my-template".',
    );
    expect(namePromptOptions?.validateInput('good-template')).toBeUndefined();
  });

  it('routes create failures through the shared command error path', async () => {
    const failure = new Error('create failed');
    const listCollections = vi.fn().mockResolvedValue([]);
    const get = vi.fn().mockResolvedValue(null);
    const init = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn().mockRejectedValue(failure);
    getStencil.mockReturnValue({
      collections: { listCollections },
      create,
      get,
      init,
    });

    showInputBox
      .mockResolvedValueOnce('new-template')
      .mockResolvedValueOnce('New template')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');
    showQuickPick.mockResolvedValue({
      choice: { kind: 'uncategorized' },
      description: 'Save under .stencil/templates/',
      detail: 'Creates a root template outside any collection.',
      label: 'Uncategorized',
    });

    const callback = await registerCommandAndGetCallback({ refresh: vi.fn() });
    await callback();

    expect(showCommandError).toHaveBeenCalledWith(failure);
  });

  async function registerCommandAndGetCallback(templateTreeProvider: {
    refresh(): void;
  }): Promise<(...args: unknown[]) => Promise<void>> {
    const { registerCreateTemplateCommand } =
      await import('../../../src/commands/createTemplate.js');
    registerCreateTemplateCommand(templateTreeProvider);
    return registerCommand.mock.calls[0][1];
  }
});
