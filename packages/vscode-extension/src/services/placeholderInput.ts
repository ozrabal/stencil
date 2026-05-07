import * as vscode from 'vscode';

import type { Template } from '../core/index.js';
import type { ResolutionResult } from '../core/index.js';
import type {
  PlaceholderPromptItem,
  PlaceholderPromptPlan,
  PlaceholderPromptResult,
} from '../types.js';

const RUN_TEMPLATE_INPUT_TITLE = 'Stencil: Run Template';

export function buildPlaceholderPromptPlan(
  template: Template,
  initialResolution: ResolutionResult,
): PlaceholderPromptPlan {
  const unresolvedNames = new Set(
    initialResolution.placeholders
      .filter((placeholder) => placeholder.source === 'unresolved')
      .map((placeholder) => placeholder.name),
  );

  const queue =
    template.frontmatter.placeholders
      ?.filter((placeholder) => unresolvedNames.has(placeholder.name))
      .map<PlaceholderPromptItem>((placeholder) => ({
        description: placeholder.description,
        name: placeholder.name,
        required: placeholder.required,
      })) ?? [];

  if (queue.length !== unresolvedNames.size) {
    const declaredNames = new Set(queue.map((placeholder) => placeholder.name));
    const missingNames = [...unresolvedNames].filter((name) => !declaredNames.has(name));
    throw new Error(
      `Template "${template.frontmatter.name}" has unresolved placeholders missing frontmatter metadata: ${missingNames.join(', ')}.`,
    );
  }

  return {
    initialResolution,
    queue,
  };
}

export async function collectPlaceholderInputs(
  promptQueue: PlaceholderPromptItem[],
): Promise<PlaceholderPromptResult> {
  const values: Record<string, string> = {};

  for (const promptItem of promptQueue) {
    const value = await promptForPlaceholder(promptItem);
    if (value === undefined) {
      return { kind: 'cancelled' };
    }

    values[promptItem.name] = value;
  }

  return {
    kind: 'completed',
    values,
  };
}

async function promptForPlaceholder(
  promptItem: PlaceholderPromptItem,
): Promise<string | undefined> {
  let retryValue = promptItem.retryValue;

  for (;;) {
    const inputOptions: vscode.InputBoxOptions = {
      ignoreFocusOut: true,
      placeHolder: promptItem.name,
      prompt: promptItem.description,
      title: RUN_TEMPLATE_INPUT_TITLE,
      validateInput: (input) => {
        if (!promptItem.required || input.trim().length > 0) {
          return undefined;
        }

        retryValue = input;
        return 'A value is required.';
      },
    };
    if (retryValue !== undefined) {
      inputOptions.value = retryValue;
    }

    const value = await vscode.window.showInputBox(inputOptions);

    if (value === undefined) {
      return undefined;
    }

    if (!promptItem.required || value.trim().length > 0) {
      return value;
    }

    retryValue = value;
  }
}
