import path from 'node:path';
import * as vscode from 'vscode';

import type { Stencil, Template } from '../core/index.js';
import type { ResolvedWorkspace } from '../types.js';
import type { RunTemplateRequestTarget } from './runOptions.js';

import {
  buildTemplateQuickPickItems,
  isTemplateQuickPickTemplateItem,
} from './templateQuickPick.js';

interface ResolveRunTemplateTargetOptions {
  requestedTarget?: RunTemplateRequestTarget;
  stencil: Stencil;
  workspace: ResolvedWorkspace;
}

export interface RunTemplateTargetSelectedResult {
  kind: 'selected';
  templateName: string;
}

export interface RunTemplateTargetNotSelectedResult {
  kind: 'not-selected';
  reason: 'no-templates-available' | 'picker-cancelled';
}

export type ResolveRunTemplateTargetResult =
  | RunTemplateTargetNotSelectedResult
  | RunTemplateTargetSelectedResult;

export async function resolveRunTemplateTarget(
  options: ResolveRunTemplateTargetOptions,
): Promise<ResolveRunTemplateTargetResult> {
  if (options.requestedTarget !== undefined) {
    return {
      kind: 'selected',
      templateName: options.requestedTarget.templateName,
    };
  }

  const templates = await options.stencil.list();
  const activeTemplateName = resolveActiveTemplateName(templates, options.workspace);
  if (activeTemplateName !== undefined) {
    return {
      kind: 'selected',
      templateName: activeTemplateName,
    };
  }

  if (templates.length === 0) {
    return {
      kind: 'not-selected',
      reason: 'no-templates-available',
    };
  }

  const selected = await vscode.window.showQuickPick(buildTemplateQuickPickItems(templates), {
    placeHolder: 'Select a template to run',
    title: 'Stencil: Run Template',
  });

  if (!isTemplateQuickPickTemplateItem(selected)) {
    return {
      kind: 'not-selected',
      reason: 'picker-cancelled',
    };
  }

  return {
    kind: 'selected',
    templateName: selected.template.frontmatter.name,
  };
}

function resolveActiveTemplateName(
  templates: Template[],
  workspace: ResolvedWorkspace,
): string | undefined {
  const activeDocument = vscode.window.activeTextEditor?.document;
  if (activeDocument?.uri.scheme !== 'file') {
    return undefined;
  }

  const activeFilePath = path.normalize(activeDocument.uri.fsPath);
  const stencilRoot = path.join(workspace.rootPath, '.stencil');
  if (!isPathInsideDirectory(activeFilePath, workspace.rootPath)) {
    return undefined;
  }

  if (!isPathInsideDirectory(activeFilePath, stencilRoot)) {
    return undefined;
  }

  const matchedTemplate = templates.find(
    (template) => path.normalize(template.filePath) === activeFilePath,
  );

  return matchedTemplate?.frontmatter.name;
}

function isPathInsideDirectory(filePath: string, directoryPath: string): boolean {
  const relativePath = path.relative(directoryPath, filePath);
  return (
    relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
  );
}
