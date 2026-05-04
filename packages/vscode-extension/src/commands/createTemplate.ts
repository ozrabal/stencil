import * as vscode from 'vscode';

import { registerWorkspaceCommand } from './shared.js';

export const CREATE_TEMPLATE_COMMAND_ID = 'stencil.createTemplate';

export function registerCreateTemplateCommand(): vscode.Disposable {
  return registerWorkspaceCommand({
    commandId: CREATE_TEMPLATE_COMMAND_ID,
    handler: async ({ workspace }) => {
      await vscode.window.showInformationMessage(
        `Stencil is active for "${workspace.workspaceFolder.name}". Template creation flow is intentionally deferred to a later Epic 1 step.`,
      );
    },
  });
}
