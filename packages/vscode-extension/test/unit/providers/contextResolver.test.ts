import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiagnosticSeverity } from 'vscode';

interface MockSelection {
  end: { line: number };
  isEmpty: boolean;
  start: { line: number };
}

interface MockTextEditor {
  document: {
    getText: ReturnType<typeof vi.fn>;
    languageId: string;
    uri: {
      fsPath: string;
      scheme: string;
    };
  };
  selection: MockSelection;
}

const DIAGNOSTIC_SEVERITY = {
  Error: 0,
  Warning: 1,
} as const;

function mockVscode(options?: {
  activeTextEditor?: MockTextEditor;
  diagnostics?: Array<{ message: string; severity?: DiagnosticSeverity }>;
  workspaceFolders?: Array<{ uri: { fsPath: string } }>;
}): ReturnType<typeof vi.fn> {
  const getDiagnostics = vi.fn().mockReturnValue(options?.diagnostics ?? []);

  vi.doMock('vscode', () => ({
    DiagnosticSeverity: DIAGNOSTIC_SEVERITY,
    languages: {
      getDiagnostics,
    },
    window: {
      activeTextEditor: options?.activeTextEditor,
    },
    workspace: {
      workspaceFolders: options?.workspaceFolders,
    },
  }));

  return getDiagnostics;
}

describe('VSCodeContextProvider', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns the expected context for a file-backed editor with a non-empty selection', async () => {
    mockVscode({
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
          end: { line: 3 },
          isEmpty: false,
          start: { line: 1 },
        },
      },
      diagnostics: [
        { message: 'a', severity: DIAGNOSTIC_SEVERITY.Error },
        { message: 'b', severity: DIAGNOSTIC_SEVERITY.Warning },
      ],
      workspaceFolders: [{ uri: { fsPath: '/workspace' } }, { uri: { fsPath: '/workspace-two' } }],
    });

    const { VSCodeContextProvider } = await import('../../../src/providers/contextResolver.js');

    await expect(new VSCodeContextProvider().resolve()).resolves.toEqual({
      active_file: '/workspace/src/file.ts',
      active_file_name: 'file.ts',
      active_file_relative_path: 'src/file.ts',
      active_language_id: 'typescript',
      active_selection: 'selected text',
      active_selection_end_line: '4',
      active_selection_line_count: '3',
      active_selection_start_line: '2',
      active_workspace_folder: '/workspace',
      diagnostics_count: '2',
      diagnostics_error_count: '1',
      diagnostics_warning_count: '1',
      workspace_folder_count: '2',
      workspace_folders: '/workspace\n/workspace-two',
    });
  });

  it('omits active_selection when the current selection is empty', async () => {
    mockVscode({
      activeTextEditor: {
        document: {
          getText: vi.fn().mockReturnValue('ignored'),
          languageId: 'typescript',
          uri: {
            fsPath: '/workspace/src/file.ts',
            scheme: 'file',
          },
        },
        selection: {
          end: { line: 0 },
          isEmpty: true,
          start: { line: 0 },
        },
      },
      diagnostics: [],
      workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    });

    const { VSCodeContextProvider } = await import('../../../src/providers/contextResolver.js');
    const context = await new VSCodeContextProvider().resolve();

    expect(context).not.toHaveProperty('active_selection');
    expect(context).toMatchObject({
      active_file: '/workspace/src/file.ts',
      active_file_name: 'file.ts',
      active_file_relative_path: 'src/file.ts',
      active_language_id: 'typescript',
      active_workspace_folder: '/workspace',
      diagnostics_count: '0',
      diagnostics_error_count: '0',
      diagnostics_warning_count: '0',
      workspace_folder_count: '1',
      workspace_folders: '/workspace',
    });
    expect(context).not.toHaveProperty('active_selection_start_line');
    expect(context).not.toHaveProperty('active_selection_end_line');
    expect(context).not.toHaveProperty('active_selection_line_count');
  });

  it('omits workspace-relative keys when the active file is outside the open workspace folders', async () => {
    mockVscode({
      activeTextEditor: {
        document: {
          getText: vi.fn().mockReturnValue(' selected text '),
          languageId: 'markdown',
          uri: {
            fsPath: '/external/notes.md',
            scheme: 'file',
          },
        },
        selection: {
          end: { line: 2 },
          isEmpty: false,
          start: { line: 1 },
        },
      },
      diagnostics: [],
      workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    });

    const { VSCodeContextProvider } = await import('../../../src/providers/contextResolver.js');
    const context = await new VSCodeContextProvider().resolve();

    expect(context).not.toHaveProperty('active_file_relative_path');
    expect(context).not.toHaveProperty('active_workspace_folder');
    expect(context).toMatchObject({
      active_file: '/external/notes.md',
      active_file_name: 'notes.md',
      active_language_id: 'markdown',
      active_selection: 'selected text',
      active_selection_end_line: '3',
      active_selection_line_count: '2',
      active_selection_start_line: '2',
      diagnostics_count: '0',
      diagnostics_error_count: '0',
      diagnostics_warning_count: '0',
      workspace_folder_count: '1',
      workspace_folders: '/workspace',
    });
  });

  it('prefers the matching workspace folder in a multi-root workspace', async () => {
    mockVscode({
      activeTextEditor: {
        document: {
          getText: vi.fn().mockReturnValue(' selected text '),
          languageId: 'typescript',
          uri: {
            fsPath: '/workspace-two/src/file.ts',
            scheme: 'file',
          },
        },
        selection: {
          end: { line: 5 },
          isEmpty: false,
          start: { line: 4 },
        },
      },
      diagnostics: [],
      workspaceFolders: [{ uri: { fsPath: '/workspace' } }, { uri: { fsPath: '/workspace-two' } }],
    });

    const { VSCodeContextProvider } = await import('../../../src/providers/contextResolver.js');
    const context = await new VSCodeContextProvider().resolve();

    expect(context).toMatchObject({
      active_file: '/workspace-two/src/file.ts',
      active_file_name: 'file.ts',
      active_file_relative_path: 'src/file.ts',
      active_workspace_folder: '/workspace-two',
      workspace_folder_count: '2',
      workspace_folders: '/workspace\n/workspace-two',
    });
  });

  it('keeps language and diagnostics for a non-file active document but omits active_file', async () => {
    const getDiagnostics = mockVscode({
      activeTextEditor: {
        document: {
          getText: vi.fn().mockReturnValue(' selected text '),
          languageId: 'markdown',
          uri: {
            fsPath: '',
            scheme: 'untitled',
          },
        },
        selection: {
          end: { line: 0 },
          isEmpty: false,
          start: { line: 0 },
        },
      },
      diagnostics: [{ message: 'draft warning', severity: DIAGNOSTIC_SEVERITY.Warning }],
      workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    });

    const { VSCodeContextProvider } = await import('../../../src/providers/contextResolver.js');
    const context = await new VSCodeContextProvider().resolve();

    expect(getDiagnostics).toHaveBeenCalledTimes(1);
    expect(context).not.toHaveProperty('active_file');
    expect(context).not.toHaveProperty('active_file_name');
    expect(context).not.toHaveProperty('active_file_relative_path');
    expect(context).not.toHaveProperty('active_workspace_folder');
    expect(context).toMatchObject({
      active_language_id: 'markdown',
      active_selection: 'selected text',
      active_selection_end_line: '1',
      active_selection_line_count: '1',
      active_selection_start_line: '1',
      diagnostics_count: '1',
      diagnostics_error_count: '0',
      diagnostics_warning_count: '1',
      workspace_folder_count: '1',
      workspace_folders: '/workspace',
    });
  });

  it('does not request diagnostics when there is no active document', async () => {
    const getDiagnostics = mockVscode({
      activeTextEditor: undefined,
      diagnostics: [{ message: 'ignored' }],
      workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    });

    const { VSCodeContextProvider } = await import('../../../src/providers/contextResolver.js');

    await expect(new VSCodeContextProvider().resolve()).resolves.toEqual({
      workspace_folder_count: '1',
      workspace_folders: '/workspace',
    });
    expect(getDiagnostics).not.toHaveBeenCalled();
  });

  it('omits workspace-derived keys when no workspace is open', async () => {
    mockVscode({
      activeTextEditor: undefined,
      diagnostics: [],
      workspaceFolders: undefined,
    });

    const { VSCodeContextProvider } = await import('../../../src/providers/contextResolver.js');

    await expect(new VSCodeContextProvider().resolve()).resolves.toEqual({});
  });
});
