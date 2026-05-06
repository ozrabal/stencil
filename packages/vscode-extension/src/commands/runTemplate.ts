import * as vscode from 'vscode';

import { openResolvedTemplateOutput } from '../services/output.js';
import { resolveRunTemplateTarget } from '../services/runTemplateTarget.js';
import { registerWorkspaceCommand } from './shared.js';

export const RUN_TEMPLATE_COMMAND_ID = 'stencil.runTemplate';

export function registerRunTemplateCommand(): vscode.Disposable {
  return registerWorkspaceCommand({
    commandId: RUN_TEMPLATE_COMMAND_ID,
    handler: async ({ commandArgs, stencil, workspace }) => {
      const templateName = await resolveRunTemplateTarget({ commandArgs, stencil, workspace });
      if (templateName === undefined) {
        return;
      }

      const result = await stencil.resolve(templateName, {});
      if (result.unresolvedCount > 0) {
        await vscode.window.showInformationMessage(
          `Template "${templateName}" requires placeholder input. Manual input collection will arrive in the next step.`,
        );
        return;
      }

      const output = await openResolvedTemplateOutput(result.resolvedBody);
      await vscode.window.showInformationMessage(
        `Ran "${templateName}". Opened resolved prompt in a ${output.deliveryTargetLabel}.`,
      );
    },
  });
}
