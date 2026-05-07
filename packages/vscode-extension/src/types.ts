import type * as vscode from 'vscode';

import type { ResolutionResult, Stencil, Template } from './core/index.js';

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
  commandArgs: unknown[];
  stencil: Stencil;
  workspace: ResolvedWorkspace;
}

export interface RunTemplateCommandArgument {
  templateName?: string;
}

export type RunTemplateCommandTarget = RunTemplateCommandArgument | string;

export interface TemplateQuickPickTemplateItem extends vscode.QuickPickItem {
  template: Template;
}

export interface TemplateQuickPickSeparator extends vscode.QuickPickItem {
  kind: vscode.QuickPickItemKind.Separator;
  label: string;
}

export type TemplateQuickPickItem = TemplateQuickPickSeparator | TemplateQuickPickTemplateItem;

export interface TemplateTreeItemMetadata {
  description?: string;
  kind: 'empty-state' | 'template';
  templateName?: string;
}

export interface PlaceholderPromptItem {
  description: string;
  name: string;
  required: boolean;
  retryValue?: string;
}

export interface PlaceholderPromptCancelled {
  kind: 'cancelled';
}

export interface PlaceholderPromptCompleted {
  kind: 'completed';
  values: Record<string, string>;
}

export type PlaceholderPromptResult = PlaceholderPromptCancelled | PlaceholderPromptCompleted;

export interface PlaceholderPromptPlan {
  initialResolution: ResolutionResult;
  queue: PlaceholderPromptItem[];
}
