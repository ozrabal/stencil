import { basename, relative, sep } from 'node:path';
import * as vscode from 'vscode';

import type { ContextProvider } from '../core/index.js';

/**
 * VS Code-owned runtime context for $ctx.* template resolution.
 *
 * - This provider only exposes plain string values.
 * - Keys here are adapter-owned and complement core-owned keys such as
 *   date, os, cwd, current_branch, git_user, project_name, and language.
 * - Unavailable editor or workspace state is omitted instead of emitted as
 *   empty strings so template resolution can degrade without blocking runs.
 */
export class VSCodeContextProvider implements ContextProvider {
  readonly name = 'VS Code';

  resolve(): Promise<Record<string, string>> {
    const context: Record<string, string> = {};
    const activeEditor = vscode.window.activeTextEditor;
    const activeDocument = activeEditor?.document;
    const workspaceFolders = vscode.workspace.workspaceFolders
      ?.map((workspaceFolder) => workspaceFolder.uri.fsPath)
      .filter((workspacePath) => workspacePath.length > 0);

    if (activeDocument?.uri.scheme === 'file') {
      const activeFilePath = activeDocument.uri.fsPath;
      const containingWorkspaceFolder = findContainingWorkspaceFolder(
        activeFilePath,
        workspaceFolders ?? [],
      );

      context['active_file'] = activeFilePath;
      context['active_file_name'] = basename(activeFilePath);

      if (containingWorkspaceFolder !== undefined) {
        context['active_workspace_folder'] = containingWorkspaceFolder;
        context['active_file_relative_path'] = relative(containingWorkspaceFolder, activeFilePath);
      }
    }

    const selection = activeEditor?.selection;
    const selectedText = selection?.isEmpty
      ? undefined
      : activeEditor?.document.getText(selection).trim();
    if (selectedText && selection) {
      const startLine = Math.min(selection.start.line, selection.end.line) + 1;
      const endLine = Math.max(selection.start.line, selection.end.line) + 1;

      context['active_selection'] = selectedText;
      context['active_selection_start_line'] = startLine.toString();
      context['active_selection_end_line'] = endLine.toString();
      context['active_selection_line_count'] = (endLine - startLine + 1).toString();
    }

    if (workspaceFolders && workspaceFolders.length > 0) {
      context['workspace_folders'] = workspaceFolders.join('\n');
      context['workspace_folder_count'] = workspaceFolders.length.toString();
    }

    if (activeDocument) {
      const diagnostics = vscode.languages.getDiagnostics(activeDocument.uri);

      context['active_language_id'] = activeDocument.languageId;
      context['diagnostics_count'] = diagnostics.length.toString();
      context['diagnostics_error_count'] = diagnostics
        .filter((diagnostic) => diagnostic.severity === vscode.DiagnosticSeverity.Error)
        .length.toString();
      context['diagnostics_warning_count'] = diagnostics
        .filter((diagnostic) => diagnostic.severity === vscode.DiagnosticSeverity.Warning)
        .length.toString();
    }

    return Promise.resolve(context);
  }
}

function findContainingWorkspaceFolder(
  filePath: string,
  workspaceFolders: string[],
): string | undefined {
  let bestMatch: string | undefined;

  for (const workspaceFolder of workspaceFolders) {
    if (!isWithinWorkspaceFolder(filePath, workspaceFolder)) {
      continue;
    }

    if (bestMatch === undefined || workspaceFolder.length > bestMatch.length) {
      bestMatch = workspaceFolder;
    }
  }

  return bestMatch;
}

function isWithinWorkspaceFolder(filePath: string, workspaceFolder: string): boolean {
  if (filePath === workspaceFolder) {
    return true;
  }

  return filePath.startsWith(`${workspaceFolder}${sep}`);
}
