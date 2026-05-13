import * as vscode from 'vscode';

import type { RunTemplateDeliveryAdapter } from './types.js';

export const copilotChatDeliveryAdapter: RunTemplateDeliveryAdapter = {
  async deliver(request) {
    const chatOptions =
      request.chatMode === 'ask'
        ? {
            query: request.resolvedBody,
          }
        : {
            mode: request.chatMode,
            query: request.resolvedBody,
          };

    switch (request.mode) {
      case 'default':
      case 'insert':
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          isPartialQuery: true,
          ...chatOptions,
        });
        return {
          deliveryActionLabel: 'inserted',
          deliveryTarget: 'copilot-chat',
          deliveryTargetLabel: 'Copilot Chat',
        };
      case 'send':
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          ...chatOptions,
        });
        return {
          deliveryActionLabel: 'sent',
          deliveryTarget: 'copilot-chat',
          deliveryTargetLabel: 'Copilot Chat',
        };
      default:
        throw new Error(`Unsupported Copilot Chat delivery mode: ${request.mode}`);
    }
  },
  target: 'copilot-chat',
};
