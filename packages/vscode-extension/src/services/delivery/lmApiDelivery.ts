import * as vscode from 'vscode';

import type { RunTemplateDeliveryAdapter } from './types.js';

import { getUnknownErrorMessage } from '../errors.js';
import { beginLmResponsePanelSession } from '../lmResponsePanel.js';
import { LANGUAGE_MODEL_API_DEFAULT_SELECTOR } from './capabilities.js';

const LM_RESPONSE_PANEL_LABEL = 'Stencil LM response panel';
const LM_RESPONSE_PANEL_TITLE = 'Stencil Language Model Response';
const LM_REQUEST_JUSTIFICATION =
  'Run the resolved Stencil template through the selected language model.';

export class LmApiDeliveryCancelledError extends Error {
  constructor() {
    super('Language model execution was cancelled.');
  }
}

export class LmApiDeliveryError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
  }
}

export const lmApiDeliveryAdapter: RunTemplateDeliveryAdapter = {
  async deliver(request) {
    const model = await selectLanguageModel(request.selectedModelId);
    const cancellationTokenSource = new vscode.CancellationTokenSource();
    const session = beginLmResponsePanelSession({
      modelId: model.id,
      modelLabel: model.name,
      promptText: request.resolvedBody,
      templateName: request.templateName,
    });
    session.setCancellationHandler(() => {
      cancellationTokenSource.cancel();
    });

    try {
      const response = await model.sendRequest(
        [vscode.LanguageModelChatMessage.User(request.resolvedBody)],
        {
          justification: LM_REQUEST_JUSTIFICATION,
        },
        cancellationTokenSource.token,
      );

      for await (const chunk of response.text) {
        if (cancellationTokenSource.token.isCancellationRequested) {
          session.cancel();
          throw new LmApiDeliveryCancelledError();
        }

        session.appendResponseChunk(chunk);
      }

      if (cancellationTokenSource.token.isCancellationRequested) {
        session.cancel();
        throw new LmApiDeliveryCancelledError();
      }

      session.complete();

      return {
        deliveryActionLabel: 'streamed',
        deliveryTarget: 'lm-api',
        deliveryTargetLabel: LM_RESPONSE_PANEL_LABEL,
        panelTitle: LM_RESPONSE_PANEL_TITLE,
        surfaceLabel: LM_RESPONSE_PANEL_LABEL,
      };
    } catch (error) {
      if (
        error instanceof LmApiDeliveryCancelledError ||
        cancellationTokenSource.token.isCancellationRequested
      ) {
        session.cancel();
        throw new LmApiDeliveryCancelledError();
      }

      const deliveryError = toLmApiDeliveryError(error);
      session.fail(deliveryError.userMessage);
      throw deliveryError;
    } finally {
      session.setCancellationHandler(undefined);
      cancellationTokenSource.dispose();
    }
  },
  target: 'lm-api',
};

async function selectLanguageModel(selectedModelId?: string): Promise<vscode.LanguageModelChat> {
  const models = await vscode.lm.selectChatModels(LANGUAGE_MODEL_API_DEFAULT_SELECTOR);

  if (selectedModelId !== undefined) {
    const selectedModel = models.find((model) => model.id === selectedModelId);
    if (selectedModel !== undefined) {
      return selectedModel;
    }

    throw new LmApiDeliveryError(
      `Stencil could not find the selected language model "${selectedModelId}". Retry the command and choose a different model.`,
    );
  }

  const firstModel = models[0];
  if (firstModel === undefined) {
    throw new LmApiDeliveryError(
      'Stencil Language Model execution is unavailable because no compatible Copilot-backed chat model is available.',
    );
  }

  return firstModel;
}

function toLmApiDeliveryError(error: unknown): LmApiDeliveryError {
  if (error instanceof LmApiDeliveryError) {
    return error;
  }

  if (error instanceof vscode.LanguageModelError) {
    switch (error.code) {
      case vscode.LanguageModelError.Blocked().code:
        return new LmApiDeliveryError(
          'Stencil Language Model execution is blocked for the selected model. Check provider access or quota and try again.',
        );
      case vscode.LanguageModelError.NoPermissions().code:
        return new LmApiDeliveryError(
          'Stencil Language Model execution requires permission before it can send this request. Grant access and try again.',
        );
      case vscode.LanguageModelError.NotFound().code:
        return new LmApiDeliveryError(
          'The selected language model is no longer available. Retry the command and choose another model.',
        );
      default:
        return new LmApiDeliveryError(
          `Stencil could not execute the language model request: ${getUnknownErrorMessage(error.cause ?? error)}`,
        );
    }
  }

  return new LmApiDeliveryError(
    `Stencil could not execute the language model request: ${getUnknownErrorMessage(error)}`,
  );
}
