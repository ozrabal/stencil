import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Template } from '../../../src/core/index.js';

describe('registerListTemplatesCommand', () => {
  const registerCommand = vi.fn();
  const showInformationMessage = vi.fn();
  const showQuickPick = vi.fn();
  const showTextDocument = vi.fn();
  const openTextDocument = vi.fn();
  const showCommandError = vi.fn();
  const hasStencilWorkspaceSetup = vi.fn();
  const resolveWorkspace = vi.fn();
  const getStencil = vi.fn();

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
    showQuickPick.mockReset();
    showTextDocument.mockReset();
    openTextDocument.mockReset();
    showCommandError.mockReset();
    hasStencilWorkspaceSetup.mockReset();
    resolveWorkspace.mockReset();
    getStencil.mockReset();

    registerCommand.mockImplementation((commandId: string, callback: () => Promise<void>) => ({
      callback,
      commandId,
      dispose: vi.fn(),
    }));
    hasStencilWorkspaceSetup.mockResolvedValue(true);
    resolveWorkspace.mockReturnValue(workspace);
    showQuickPick.mockResolvedValue(undefined);

    vi.doMock('vscode', () => ({
      commands: {
        registerCommand,
      },
      QuickPickItemKind: {
        Separator: -1,
      },
      window: {
        showInformationMessage,
        showQuickPick,
        showTextDocument,
      },
      workspace: {
        openTextDocument,
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

  it('lists templates once and opens the selected template file', async () => {
    const list = vi.fn().mockResolvedValue([createTemplate({ name: 'alpha' })]);
    getStencil.mockReturnValue({ list });

    const document = { uri: { fsPath: '/workspace/.stencil/alpha.md' } };
    openTextDocument.mockResolvedValue(document);

    const { registerListTemplatesCommand } = await import('../../../src/commands/listTemplates.js');
    registerListTemplatesCommand();

    const callback = getRegisteredCommandCallback();
    const selected = {
      description: 'project',
      detail: 'Alpha description',
      label: 'alpha',
      template: createTemplate({ name: 'alpha' }),
    };
    showQuickPick.mockResolvedValue(selected);

    await callback();

    expect(list).toHaveBeenCalledTimes(1);
    expect(showQuickPick).toHaveBeenCalledWith(
      [
        { kind: -1, label: 'Templates' },
        {
          description: 'project',
          detail: 'Alpha description',
          label: 'alpha',
          template: expect.objectContaining({
            filePath: '/workspace/.stencil/alpha.md',
            frontmatter: expect.objectContaining({ name: 'alpha' }),
          }),
        },
      ],
      {
        placeHolder: 'Select a template to open',
        title: 'Stencil: List Templates',
      },
    );
    expect(openTextDocument).toHaveBeenCalledWith('/workspace/.stencil/alpha.md');
    expect(showTextDocument).toHaveBeenCalledWith(document);
  });

  it('shows an explicit empty-state message when no templates are available', async () => {
    const list = vi.fn().mockResolvedValue([]);
    getStencil.mockReturnValue({ list });

    const { registerListTemplatesCommand } = await import('../../../src/commands/listTemplates.js');
    registerListTemplatesCommand();

    await getRegisteredCommandCallback()();

    expect(list).toHaveBeenCalledTimes(1);
    expect(showInformationMessage).toHaveBeenCalledWith(
      'No Stencil templates were found in this workspace.',
    );
    expect(showQuickPick).not.toHaveBeenCalled();
    expect(openTextDocument).not.toHaveBeenCalled();
  });

  it('does not open a document when the quick pick is cancelled', async () => {
    const template = createTemplate({ name: 'alpha' });
    const list = vi.fn().mockResolvedValue([template]);
    getStencil.mockReturnValue({ list });

    const { registerListTemplatesCommand } = await import('../../../src/commands/listTemplates.js');
    registerListTemplatesCommand();

    showQuickPick.mockResolvedValue(undefined);

    await getRegisteredCommandCallback()();

    expect(showQuickPick).toHaveBeenCalledTimes(1);
    expect(openTextDocument).not.toHaveBeenCalled();
    expect(showTextDocument).not.toHaveBeenCalled();
  });

  it('routes handler failures through the shared command error path', async () => {
    const failure = new Error('list failed');
    const list = vi.fn().mockRejectedValue(failure);
    getStencil.mockReturnValue({ list });

    const { registerListTemplatesCommand } = await import('../../../src/commands/listTemplates.js');
    registerListTemplatesCommand();

    await getRegisteredCommandCallback()();

    expect(showCommandError).toHaveBeenCalledWith(failure);
  });

  function getRegisteredCommandCallback(): () => Promise<void> {
    return registerCommand.mock.calls[0][1];
  }
});

function createTemplate({ name }: { name: string }): Template {
  return {
    body: `# ${name}`,
    filePath: `/workspace/.stencil/${name}.md`,
    frontmatter: {
      description: `${capitalize(name)} description`,
      name,
      version: 1,
    },
    source: 'project',
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
