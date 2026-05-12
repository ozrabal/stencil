import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const DIAGNOSTIC_SEVERITY = {
  Error: 0,
  Warning: 1,
} as const;

function mockVscode(options?: {
  activeTextEditor?: {
    document: {
      getText: ReturnType<typeof vi.fn>;
      languageId: string;
      uri: {
        fsPath: string;
        scheme: string;
      };
    };
    selection: {
      end: { line: number };
      isEmpty: boolean;
      start: { line: number };
    };
  };
  diagnostics?: Array<{ message: string; severity?: number }>;
  workspaceFolders?: Array<{ uri: { fsPath: string } }>;
}): void {
  vi.doMock('vscode', () => ({
    DiagnosticSeverity: DIAGNOSTIC_SEVERITY,
    languages: {
      getDiagnostics: vi.fn().mockReturnValue(options?.diagnostics ?? []),
    },
    window: {
      activeTextEditor: options?.activeTextEditor,
    },
    workspace: {
      workspaceFolders: options?.workspaceFolders,
    },
  }));
}

describe('getStencil', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('caches stencil instances per workspace root and registers the VS Code context provider', async () => {
    mockVscode({
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
          end: { line: 1 },
          isEmpty: false,
          start: { line: 1 },
        },
      },
      diagnostics: [
        { message: 'error', severity: DIAGNOSTIC_SEVERITY.Error },
        { message: 'warning', severity: DIAGNOSTIC_SEVERITY.Warning },
      ],
      workspaceFolders: [{ uri: { fsPath: '/workspace-a' } }],
    });

    const workspaceRoot = await mkdtemp(join(tmpdir(), 'stencil-vscode-getstencil-'));
    const { getStencil, resetStencilCache } = await import('../../../src/services/getStencil.js');

    resetStencilCache();

    const workspaceA = {
      kind: 'workspace' as const,
      rootPath: workspaceRoot,
      workspaceFolder: {
        index: 0,
        name: 'workspace-a',
        uri: { fsPath: workspaceRoot },
      },
    };
    const workspaceBRoot = await mkdtemp(join(tmpdir(), 'stencil-vscode-getstencil-'));
    const workspaceB = {
      ...workspaceA,
      rootPath: workspaceBRoot,
      workspaceFolder: {
        ...workspaceA.workspaceFolder,
        name: 'workspace-b',
        uri: { fsPath: workspaceBRoot },
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
    await expect(stencilA1.context.resolve('active_file_relative_path')).resolves.toBe(
      'src/file.ts',
    );
    await expect(stencilA1.context.resolve('active_language_id')).resolves.toBe('typescript');
    await expect(stencilA1.context.resolve('diagnostics_count')).resolves.toBe('2');
    await expect(stencilA1.context.resolve('diagnostics_error_count')).resolves.toBe('1');
    await expect(stencilA1.context.resolve('diagnostics_warning_count')).resolves.toBe('1');
    await expect(stencilA1.context.resolve('cwd')).resolves.toBe(process.cwd());
    await expect(stencilA1.context.resolve('os')).resolves.toBe(process.platform);
  });

  it('still exposes core context when there is no active editor', async () => {
    mockVscode({
      activeTextEditor: undefined,
      diagnostics: [{ message: 'ignored', severity: DIAGNOSTIC_SEVERITY.Error }],
      workspaceFolders: [{ uri: { fsPath: '/workspace-a' } }],
    });

    const workspaceRoot = await mkdtemp(join(tmpdir(), 'stencil-vscode-getstencil-'));
    const { getStencil, resetStencilCache } = await import('../../../src/services/getStencil.js');

    resetStencilCache();

    const stencil = getStencil({
      kind: 'workspace',
      rootPath: workspaceRoot,
      workspaceFolder: {
        index: 0,
        name: 'workspace-a',
        uri: { fsPath: workspaceRoot },
      },
    });

    await expect(stencil.context.resolve('active_file')).resolves.toBeUndefined();
    await expect(stencil.context.resolve('diagnostics_count')).resolves.toBeUndefined();
    await expect(stencil.context.resolve('cwd')).resolves.toBe(process.cwd());
    await expect(stencil.context.resolve('os')).resolves.toBe(process.platform);
  });
});
