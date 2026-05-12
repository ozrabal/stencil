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
  _template: Template,
  initialResolution: ResolutionResult,
): PlaceholderPromptPlan {
  const queue = initialResolution.inputs
    .filter((input) => input.source === 'unresolved')
    .map<PlaceholderPromptItem>((input) => ({
      description: input.description ?? buildFallbackPromptDescription(input.name),
      name: input.name,
      required: input.required,
    }));

  return {
    initialResolution,
    queue,
  };
}

function buildFallbackPromptDescription(name: string): string {
  const normalized = name.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

  if (normalized.length === 0) {
    return 'Input value';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
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
