import * as vscode from 'vscode';

import type { ContextProvider } from '../core/index.js';

export class VSCodeContextProvider implements ContextProvider {
  readonly name = 'VS Code';

  resolve(): Promise<Record<string, string>> {
    const context: Record<string, string> = {};
    const activeEditor = vscode.window.activeTextEditor;
    const activeDocument = activeEditor?.document;

    if (activeDocument?.uri.scheme === 'file') {
      context['active_file'] = activeDocument.uri.fsPath;
    }

    const selectedText = activeEditor?.selection.isEmpty
      ? undefined
      : activeEditor?.document.getText(activeEditor.selection).trim();
    if (selectedText) {
      context['active_selection'] = selectedText;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders
      ?.map((workspaceFolder) => workspaceFolder.uri.fsPath)
      .filter((workspacePath) => workspacePath.length > 0);
    if (workspaceFolders && workspaceFolders.length > 0) {
      context['workspace_folders'] = workspaceFolders.join('\n');
    }

    if (activeDocument) {
      context['active_language_id'] = activeDocument.languageId;
      context['diagnostics_count'] = vscode.languages
        .getDiagnostics(activeDocument.uri)
        .length.toString();
    }

    return Promise.resolve(context);
  }
}
