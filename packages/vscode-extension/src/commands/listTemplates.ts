import * as vscode from 'vscode';

import {
  buildTemplateQuickPickItems,
  isTemplateQuickPickTemplateItem,
} from '../services/templateQuickPick.js';
import { registerWorkspaceCommand } from './shared.js';

export const LIST_TEMPLATES_COMMAND_ID = 'stencil.listTemplates';

export function registerListTemplatesCommand(): vscode.Disposable {
  return registerWorkspaceCommand({
    commandId: LIST_TEMPLATES_COMMAND_ID,
    handler: async ({ stencil }) => {
      const templates = await stencil.list();
      if (templates.length === 0) {
        await vscode.window.showInformationMessage(
          'No Stencil templates were found in this workspace.',
        );
        return;
      }

      const selected = await vscode.window.showQuickPick(buildTemplateQuickPickItems(templates), {
        placeHolder: 'Select a template to open',
        title: 'Stencil: List Templates',
      });

      if (!isTemplateQuickPickTemplateItem(selected)) {
        return;
      }

      const document = await vscode.workspace.openTextDocument(selected.template.filePath);
      await vscode.window.showTextDocument(document);
    },
  });
}
