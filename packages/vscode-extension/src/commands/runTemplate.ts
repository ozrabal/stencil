import * as vscode from 'vscode';

import { StencilError, StencilErrorCode } from '../core/index.js';
import { openResolvedTemplateOutput } from '../services/output.js';
import {
  buildPlaceholderPromptPlan,
  collectPlaceholderInputs,
} from '../services/placeholderInput.js';
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

      const template = await stencil.get(templateName);
      if (template === null) {
        throw new StencilError(
          `Template "${templateName}" could not be found.`,
          StencilErrorCode.TEMPLATE_NOT_FOUND,
        );
      }

      const initialResult = await stencil.resolve(templateName, {});
      if (initialResult.unresolvedCount === 0) {
        const output = await openResolvedTemplateOutput(initialResult.resolvedBody);
        await vscode.window.showInformationMessage(
          `Ran "${templateName}". Opened resolved prompt in a ${output.deliveryTargetLabel}.`,
        );
        return;
      }

      const promptPlan = buildPlaceholderPromptPlan(template, initialResult);
      const promptResult = await collectPlaceholderInputs(promptPlan.queue);
      if (promptResult.kind === 'cancelled') {
        await vscode.window.showInformationMessage(`Cancelled running template "${templateName}".`);
        return;
      }

      const finalResult = await stencil.resolve(templateName, promptResult.values);
      if (finalResult.unresolvedCount > 0) {
        const unresolvedNames = finalResult.placeholders
          .filter((placeholder) => placeholder.source === 'unresolved')
          .map((placeholder) => placeholder.name);
        await vscode.window.showInformationMessage(
          `Template "${templateName}" is still missing placeholder values: ${unresolvedNames.join(', ')}.`,
        );
        return;
      }

      const output = await openResolvedTemplateOutput(finalResult.resolvedBody);
      await vscode.window.showInformationMessage(
        `Ran "${templateName}". Opened resolved prompt in a ${output.deliveryTargetLabel}.`,
      );
    },
  });
}
