import * as vscode from 'vscode';

import type { RunTemplateDeliveryAdapter } from './types.js';

import { getUnknownErrorMessage } from '../errors.js';

export class ClipboardDeliveryError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
  }
}

export const clipboardDeliveryAdapter: RunTemplateDeliveryAdapter = {
  async deliver(request) {
    try {
      await vscode.env.clipboard.writeText(request.resolvedBody);
    } catch (error) {
      throw new ClipboardDeliveryError(
        `Stencil could not copy template "${request.templateName}" to the clipboard: ${getUnknownErrorMessage(error)}`,
      );
    }

    return {
      deliveryActionLabel: 'copied',
      deliveryTarget: 'clipboard',
      deliveryTargetLabel: 'clipboard',
    };
  },
  target: 'clipboard',
};
