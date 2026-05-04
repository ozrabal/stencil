import { stat } from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';

import type { WorkspaceResolution } from '../types.js';

export function resolveWorkspace(): WorkspaceResolution {
  const activeEditor = vscode.window.activeTextEditor;
  const activeWorkspace = activeEditor
    ? vscode.workspace.getWorkspaceFolder(activeEditor.document.uri)
    : undefined;

  if (activeWorkspace) {
    return toResolvedWorkspace(activeWorkspace);
  }

  const firstWorkspace = vscode.workspace.workspaceFolders?.[0];
  if (firstWorkspace) {
    return toResolvedWorkspace(firstWorkspace);
  }

  return { kind: 'missing-workspace' };
}

export async function hasStencilWorkspaceSetup(rootPath: string): Promise<boolean> {
  const stencilDir = path.join(rootPath, '.stencil');

  try {
    return (await stat(stencilDir)).isDirectory();
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }

    throw error;
  }
}

function toResolvedWorkspace(workspaceFolder: vscode.WorkspaceFolder) {
  return {
    kind: 'workspace' as const,
    rootPath: workspaceFolder.uri.fsPath,
    workspaceFolder,
  };
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
