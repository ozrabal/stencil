import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('VSCodeContextProvider', () => {
  beforeEach(() => {
    vi.resetModules();

    vi.doMock('vscode', () => ({
      languages: {
        getDiagnostics: vi.fn().mockReturnValue([{ message: 'a' }, { message: 'b' }]),
      },
      window: {
        activeTextEditor: {
          document: {
            getText: vi.fn().mockReturnValue(' selected text '),
            languageId: 'typescript',
            uri: {
              fsPath: '/workspace/src/file.ts',
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
          { uri: { fsPath: '/workspace' } },
          { uri: { fsPath: '/workspace-two' } },
        ],
      },
    }));
  });

  it('returns the expected string-based VS Code context map', async () => {
    const { VSCodeContextProvider } = await import('../../../src/providers/contextResolver.js');

    const provider = new VSCodeContextProvider();

    await expect(provider.resolve()).resolves.toEqual({
      active_file: '/workspace/src/file.ts',
      active_language_id: 'typescript',
      active_selection: 'selected text',
      diagnostics_count: '2',
      workspace_folders: '/workspace\n/workspace-two',
    });
  });
});
