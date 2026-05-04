import type * as vscode from 'vscode';

import type { Stencil } from './core/index.js';

export interface ResolvedWorkspace {
  kind: 'workspace';
  rootPath: string;
  workspaceFolder: vscode.WorkspaceFolder;
}

export interface MissingWorkspace {
  kind: 'missing-workspace';
}

export type WorkspaceResolution = MissingWorkspace | ResolvedWorkspace;

export interface CommandContext {
  stencil: Stencil;
  workspace: ResolvedWorkspace;
}

export interface TemplateTreeItemMetadata {
  description?: string;
  kind: 'empty-state' | 'template';
  templateName?: string;
}
