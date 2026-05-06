import path from 'node:path';
import * as vscode from 'vscode';

import type { Stencil, Template } from '../core/index.js';
import type { ResolvedWorkspace, RunTemplateCommandTarget } from '../types.js';

import {
  buildTemplateQuickPickItems,
  isTemplateQuickPickTemplateItem,
} from './templateQuickPick.js';

interface ResolveRunTemplateTargetOptions {
  commandArgs: unknown[];
  stencil: Stencil;
  workspace: ResolvedWorkspace;
}

export async function resolveRunTemplateTarget(
  options: ResolveRunTemplateTargetOptions,
): Promise<string | undefined> {
  const explicitTarget = resolveExplicitTarget(options.commandArgs);
  if (explicitTarget !== undefined) {
    return explicitTarget;
  }

  const templates = await options.stencil.list();
  const activeTemplateName = resolveActiveTemplateName(templates, options.workspace);
  if (activeTemplateName !== undefined) {
    return activeTemplateName;
  }

  if (templates.length === 0) {
    await vscode.window.showInformationMessage(
      'No Stencil templates were found in this workspace.',
    );
    return undefined;
  }

  const selected = await vscode.window.showQuickPick(buildTemplateQuickPickItems(templates), {
    placeHolder: 'Select a template to run',
    title: 'Stencil: Run Template',
  });

  if (!isTemplateQuickPickTemplateItem(selected)) {
    return undefined;
  }

  return selected.template.frontmatter.name;
}

function resolveExplicitTarget(commandArgs: unknown[]): string | undefined {
  for (const commandArg of commandArgs) {
    const templateName = extractTemplateName(commandArg);
    if (templateName !== undefined) {
      return templateName;
    }
  }

  return undefined;
}

function extractTemplateName(commandArg: unknown): string | undefined {
  if (typeof commandArg === 'string' && commandArg.length > 0) {
    return commandArg;
  }

  if (!isRunTemplateCommandTarget(commandArg)) {
    return undefined;
  }

  return typeof commandArg.templateName === 'string' && commandArg.templateName.length > 0
    ? commandArg.templateName
    : undefined;
}

function isRunTemplateCommandTarget(
  value: unknown,
): value is Exclude<RunTemplateCommandTarget, string> {
  return typeof value === 'object' && value !== null && 'templateName' in value;
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
