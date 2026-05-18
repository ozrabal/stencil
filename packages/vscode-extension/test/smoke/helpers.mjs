import * as vscode from 'vscode';

export function getWorkspaceFolder() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error('Expected the smoke test workspace to be open.');
  }

  return workspaceFolder;
}

export function getWorkspaceUri(...paths) {
  return vscode.Uri.joinPath(getWorkspaceFolder().uri, ...paths);
}

export async function openWorkspaceDocument(...paths) {
  return vscode.workspace.openTextDocument(getWorkspaceUri(...paths));
}

export async function showWorkspaceDocument(...paths) {
  const document = await openWorkspaceDocument(...paths);
  await vscode.window.showTextDocument(document);
  return document;
}
