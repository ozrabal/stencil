import path from 'node:path';
import * as vscode from 'vscode';

import type { CreateTemplateWizardResult } from '../types.js';

import { loadStencilConfig } from '../core/index.js';
import {
  buildCreateTemplateBodyScaffold,
  buildCreateTemplateCollectionItems,
  isCreateTemplateCollectionQuickPickItem,
  normalizeTemplateDescription,
  normalizeTemplateName,
  parseTemplateTags,
  toCreateTemplateCollectionValue,
  validateTemplateDescriptionInput,
  validateTemplateNameInput,
} from '../services/createTemplateWizard.js';
import { registerWorkspaceCommand } from './shared.js';

export const CREATE_TEMPLATE_COMMAND_ID = 'stencil.createTemplate';
const CREATE_TEMPLATE_COMMAND_TITLE = 'Stencil: Create Template';

export function registerCreateTemplateCommand(templateTreeProvider?: {
  refresh(): void;
}): vscode.Disposable {
  return registerWorkspaceCommand({
    commandId: CREATE_TEMPLATE_COMMAND_ID,
    handler: async ({ stencil, workspace }) => {
      const wizardResult = await collectCreateTemplateWizardInput(workspace.rootPath, stencil);
      if (wizardResult.kind === 'cancelled') {
        return;
      }

      const { draft } = wizardResult;
      const existingTemplate = await stencil.get(draft.name);
      if (existingTemplate !== null) {
        await vscode.window.showErrorMessage(
          buildTemplateCollisionMessage(draft.name, existingTemplate),
        );
        return;
      }

      await stencil.init();

      const createdTemplate = await stencil.create(
        {
          description: draft.description,
          ...(draft.tags ? { tags: draft.tags } : {}),
          name: draft.name,
          version: 1,
        },
        draft.body,
        toCreateTemplateCollectionValue(draft.collectionChoice),
      );

      const document = await vscode.workspace.openTextDocument(createdTemplate.filePath);
      await vscode.window.showTextDocument(document);

      templateTreeProvider?.refresh();

      await vscode.window.showInformationMessage(`Created template "${draft.name}".`);
    },
    requireStencilSetup: false,
  });
}

async function collectCreateTemplateWizardInput(
  workspaceRootPath: string,
  stencil: {
    collections: { listCollections(): Promise<string[]> };
  },
): Promise<CreateTemplateWizardResult> {
  const [collections, config] = await Promise.all([
    stencil.collections.listCollections(),
    loadStencilConfig(path.join(workspaceRootPath, '.stencil')),
  ]);

  const nameInput = await vscode.window.showInputBox({
    ignoreFocusOut: true,
    placeHolder: 'my-template',
    prompt: 'Template name',
    title: CREATE_TEMPLATE_COMMAND_TITLE,
    validateInput: validateTemplateNameInput,
  });
  if (nameInput === undefined) {
    return { kind: 'cancelled' };
  }

  const descriptionInput = await vscode.window.showInputBox({
    ignoreFocusOut: true,
    placeHolder: 'Explain what this template helps with',
    prompt: 'Template description',
    title: CREATE_TEMPLATE_COMMAND_TITLE,
    validateInput: validateTemplateDescriptionInput,
  });
  if (descriptionInput === undefined) {
    return { kind: 'cancelled' };
  }

  const tagsInput = await vscode.window.showInputBox({
    ignoreFocusOut: true,
    placeHolder: 'backend, review, docs',
    prompt: 'Optional tags (comma-separated)',
    title: CREATE_TEMPLATE_COMMAND_TITLE,
  });
  if (tagsInput === undefined) {
    return { kind: 'cancelled' };
  }

  const collectionItems = buildCreateTemplateCollectionItems({
    collections,
    ...(config.defaultCollection !== undefined
      ? { defaultCollection: config.defaultCollection }
      : {}),
  });
  const collectionChoice = await vscode.window.showQuickPick(collectionItems, {
    ignoreFocusOut: true,
    placeHolder: 'Choose where to save the template',
    title: CREATE_TEMPLATE_COMMAND_TITLE,
  });
  if (!isCreateTemplateCollectionQuickPickItem(collectionChoice)) {
    return { kind: 'cancelled' };
  }

  const bodySeedInput = await vscode.window.showInputBox({
    ignoreFocusOut: true,
    placeHolder: 'Optional first line or short seed for the template body',
    prompt: 'Initial body seed',
    title: CREATE_TEMPLATE_COMMAND_TITLE,
  });
  if (bodySeedInput === undefined) {
    return { kind: 'cancelled' };
  }

  const tags = parseTemplateTags(tagsInput);

  return {
    draft: {
      body: buildCreateTemplateBodyScaffold(bodySeedInput),
      collectionChoice: collectionChoice.choice,
      description: normalizeTemplateDescription(descriptionInput),
      ...(tags.length > 0 ? { tags } : {}),
      name: normalizeTemplateName(nameInput),
    },
    kind: 'completed',
  };
}

function buildTemplateCollisionMessage(
  templateName: string,
  template: {
    collection?: string;
    source: 'global' | 'project' | 'remote';
  },
): string {
  const scopeLabel =
    template.source === 'global' ? 'global templates' : `${template.source} templates`;
  const collectionLabel =
    template.collection === undefined
      ? 'without a collection'
      : `in the "${template.collection}" collection`;

  return `Template "${templateName}" already exists in ${scopeLabel} ${collectionLabel}. Choose a different name.`;
}
