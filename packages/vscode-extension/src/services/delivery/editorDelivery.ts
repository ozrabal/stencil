import * as vscode from 'vscode';

import type { RunTemplateDeliveryAdapter } from './types.js';

export const editorDeliveryAdapter: RunTemplateDeliveryAdapter = {
  async deliver(request) {
    const document = await vscode.workspace.openTextDocument({
      content: request.resolvedBody,
      language: 'markdown',
    });

    await vscode.window.showTextDocument(document);

    return {
      deliveryActionLabel: 'opened',
      deliveryTarget: 'editor',
      deliveryTargetLabel: 'new editor',
      documentUri: document.uri,
    };
  },
  target: 'editor',
};
