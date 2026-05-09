import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Template } from '../../../src/core/index.js';

describe('TemplateTreeProvider', () => {
  const registerCommand = vi.fn();
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
    hasStencilWorkspaceSetup.mockReset();
    resolveWorkspace.mockReset();
    getStencil.mockReset();

    registerCommand.mockImplementation((commandId: string, callback: () => void) => ({
      callback,
      commandId,
      dispose: vi.fn(),
    }));
    hasStencilWorkspaceSetup.mockResolvedValue(true);
    resolveWorkspace.mockReturnValue(workspace);

    vi.doMock('vscode', () => ({
      commands: {
        registerCommand,
      },
      EventEmitter: class {
        readonly event = vi.fn();
        fire = vi.fn();
      },
      TreeItem: class {
        command?: unknown;
        contextValue?: string;
        description?: string;
        tooltip?: string;

        constructor(
          readonly label: string,
          readonly collapsibleState: number,
        ) {}
      },
      TreeItemCollapsibleState: {
        Collapsed: 1,
        None: 0,
      },
    }));

    vi.doMock('../../../src/services/workspace.js', () => ({
      hasStencilWorkspaceSetup,
      resolveWorkspace,
    }));

    vi.doMock('../../../src/services/getStencil.js', () => ({
      getStencil,
    }));
  });

  it('returns a placeholder row when no workspace is open', async () => {
    resolveWorkspace.mockReturnValue({ kind: 'missing-workspace' });

    const { TemplateTreeProvider } = await import('../../../src/providers/templateTreeProvider.js');
    const provider = new TemplateTreeProvider();

    const items = await provider.getChildren();

    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe('Open a workspace folder to browse Stencil templates.');
    expect(hasStencilWorkspaceSetup).not.toHaveBeenCalled();
  });

  it('builds root groups from visible templates plus empty collections', async () => {
    const list = vi.fn().mockResolvedValue([
      createTemplate({
        description: 'Alpha description',
        filePath: '/workspace/.stencil/templates/alpha.md',
        name: 'alpha',
      }),
      createTemplate({
        collection: 'backend',
        description: 'Beta description',
        filePath: '/workspace/.stencil/collections/backend/beta.md',
        name: 'beta',
        source: 'global',
      }),
    ]);
    const listCollections = vi.fn().mockResolvedValue(['review', 'backend']);
    getStencil.mockReturnValue({
      collections: { listCollections },
      list,
    });

    const { TemplateTreeProvider } = await import('../../../src/providers/templateTreeProvider.js');
    const provider = new TemplateTreeProvider();

    const rootItems = await provider.getChildren();

    expect(list).toHaveBeenCalledTimes(1);
    expect(listCollections).toHaveBeenCalledTimes(1);
    expect(rootItems.map((item) => item.label)).toEqual(['Templates', 'backend', 'review']);
    expect(rootItems[0]?.contextValue).toBe('stencil.group');
    expect(rootItems[1]?.contextValue).toBe('stencil.collection');
    expect(rootItems[2]?.collapsibleState).toBe(1);

    const templateItems = await provider.getChildren(rootItems[0]);
    expect(templateItems).toHaveLength(1);
    expect(templateItems[0]?.label).toBe('alpha');
    expect(templateItems[0]?.contextValue).toBe('stencil.template');
    expect(templateItems[0]?.description).toBe('project');
    expect(templateItems[0]?.command).toEqual({
      arguments: [
        expect.objectContaining({
          kind: 'template',
          templateFilePath: '/workspace/.stencil/templates/alpha.md',
          templateName: 'alpha',
        }),
      ],
      command: 'stencil.openTemplate',
      title: 'Open Template',
    });

    const emptyCollectionItems = await provider.getChildren(rootItems[2]);
    expect(emptyCollectionItems).toEqual([]);
  });

  it('returns a safe fallback row when loading templates fails', async () => {
    const list = vi.fn().mockRejectedValue(new Error('boom'));
    getStencil.mockReturnValue({
      collections: { listCollections: vi.fn().mockResolvedValue([]) },
      list,
    });

    const { TemplateTreeProvider } = await import('../../../src/providers/templateTreeProvider.js');
    const provider = new TemplateTreeProvider();

    const items = await provider.getChildren();

    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe('Could not load Stencil templates.');
    expect(items[0]?.description).toBe('boom');
  });

  it('registers a refresh command that delegates to the provider', async () => {
    const refresh = vi.fn();

    const { registerRefreshTemplatesViewCommand } =
      await import('../../../src/providers/templateTreeProvider.js');
    registerRefreshTemplatesViewCommand({ refresh });

    const callback = registerCommand.mock.calls[0][1];
    callback();

    expect(registerCommand).toHaveBeenCalledWith(
      'stencil.refreshTemplatesView',
      expect.any(Function),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

function createTemplate({
  collection,
  description,
  filePath,
  name,
  source = 'project',
}: {
  collection?: string;
  description: string;
  filePath: string;
  name: string;
  source?: Template['source'];
}): Template {
  return {
    body: `# ${name}`,
    ...(collection !== undefined ? { collection } : {}),
    filePath,
    frontmatter: {
      description,
      name,
      version: 1,
    },
    source,
  };
}
