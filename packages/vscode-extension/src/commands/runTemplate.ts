import * as vscode from 'vscode';

import { registerWorkspaceCommand } from './shared.js';

export const RUN_TEMPLATE_COMMAND_ID = 'stencil.runTemplate';

export function registerRunTemplateCommand(): vscode.Disposable {
  return registerWorkspaceCommand({
    commandId: RUN_TEMPLATE_COMMAND_ID,
    handler: async ({ workspace }) => {
      await vscode.window.showInformationMessage(
        `Stencil is connected to "${workspace.workspaceFolder.name}". Template execution wiring is in place, but rendering is not implemented in this step.`,
      );
    },
  });
}
