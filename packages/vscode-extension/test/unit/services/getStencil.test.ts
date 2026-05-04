import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('getStencil', () => {
  beforeEach(() => {
    vi.resetModules();

    vi.doMock('vscode', () => ({
      languages: {
        getDiagnostics: vi.fn().mockReturnValue([{ message: 'diagnostic' }]),
      },
      window: {
        activeTextEditor: {
          document: {
            getText: vi.fn().mockReturnValue('selected text'),
            languageId: 'typescript',
            uri: {
              fsPath: '/workspace-a/src/file.ts',
              scheme: 'file',
            },
          },
          selection: {
            isEmpty: false,
          },
        },
      },
      workspace: {
        workspaceFolders: [
          {
            uri: { fsPath: '/workspace-a' },
          },
        ],
      },
    }));
  });

  it('caches stencil instances per workspace root and registers the VS Code context provider', async () => {
    const { getStencil, resetStencilCache } = await import('../../../src/services/getStencil.js');

    resetStencilCache();

    const workspaceA = {
      kind: 'workspace' as const,
      rootPath: '/workspace-a',
      workspaceFolder: {
        index: 0,
        name: 'workspace-a',
        uri: { fsPath: '/workspace-a' },
      },
    };
    const workspaceB = {
      ...workspaceA,
      rootPath: '/workspace-b',
      workspaceFolder: {
        ...workspaceA.workspaceFolder,
        name: 'workspace-b',
        uri: { fsPath: '/workspace-b' },
      },
    };

    const stencilA1 = getStencil(workspaceA);
    const stencilA2 = getStencil(workspaceA);
    const stencilB = getStencil(workspaceB);

    expect(stencilA1).toBe(stencilA2);
    expect(stencilA1).not.toBe(stencilB);
    await expect(stencilA1.context.resolve('active_file')).resolves.toBe(
      '/workspace-a/src/file.ts',
    );
    await expect(stencilA1.context.resolve('active_language_id')).resolves.toBe('typescript');
    await expect(stencilA1.context.resolve('diagnostics_count')).resolves.toBe('1');
  });
});
