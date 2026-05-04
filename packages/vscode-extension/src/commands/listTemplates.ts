import * as vscode from 'vscode';

import { registerWorkspaceCommand } from './shared.js';

export const LIST_TEMPLATES_COMMAND_ID = 'stencil.listTemplates';

export function registerListTemplatesCommand(): vscode.Disposable {
  return registerWorkspaceCommand({
    commandId: LIST_TEMPLATES_COMMAND_ID,
    handler: async ({ workspace }) => {
      await vscode.window.showInformationMessage(
        `Stencil is active for "${workspace.workspaceFolder.name}". Template listing is intentionally deferred to the next Epic 1 step.`,
      );
    },
  });
}
