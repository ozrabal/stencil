import * as vscode from 'vscode';

import type { RunTemplateExecutionOptions } from './runOptions.js';

import { getDeliveryTargetCapability } from './delivery/capabilities.js';

interface RunProfileQuickPickItem extends vscode.QuickPickItem {
  profile: RunTemplateExecutionOptions;
}

export async function pickRunProfile(): Promise<RunTemplateExecutionOptions | undefined> {
  const [editorCapability, clipboardCapability, copilotCapability, languageModelCapability] =
    await Promise.all([
      getDeliveryTargetCapability('editor'),
      getDeliveryTargetCapability('clipboard'),
      getDeliveryTargetCapability('copilot-chat'),
      getDeliveryTargetCapability('lm-api'),
    ]);

  const items: RunProfileQuickPickItem[] = [];

  if (editorCapability.available && editorCapability.implemented) {
    items.push({
      description: 'Open the resolved prompt in a new editor',
      label: 'Editor',
      profile: {
        chatMode: 'ask',
        deliveryTarget: 'editor',
        mode: 'default',
      },
    });
  }

  if (clipboardCapability.available && clipboardCapability.implemented) {
    items.push({
      description: 'Copy the resolved prompt to the clipboard',
      label: 'Clipboard',
      profile: {
        chatMode: 'ask',
        deliveryTarget: 'clipboard',
        mode: 'default',
      },
    });
  }

  if (copilotCapability.available && copilotCapability.implemented) {
    const defaultChatMode = copilotCapability.supportedChatModes[0] ?? 'ask';
    items.push({
      description: 'Insert into Copilot Chat without sending',
      label: 'Copilot Chat',
      profile: {
        chatMode: defaultChatMode,
        deliveryTarget: 'copilot-chat',
        mode: 'insert',
      },
    });
    items.push({
      description: 'Send directly to Copilot Chat',
      label: 'Copilot Chat (Send)',
      profile: {
        chatMode: defaultChatMode,
        deliveryTarget: 'copilot-chat',
        mode: 'send',
      },
    });

    if (copilotCapability.supportedChatModes.length > 1) {
      for (const chatMode of copilotCapability.supportedChatModes) {
        items.push({
          description: `Insert into Copilot Chat ${formatChatModeLabel(chatMode)} mode`,
          label: `Copilot Chat: ${formatChatModeLabel(chatMode)}`,
          profile: {
            chatMode,
            deliveryTarget: 'copilot-chat',
            mode: 'insert',
          },
        });
      }
    }
  }

  if (languageModelCapability.available && languageModelCapability.implemented) {
    items.push({
      description: 'Run with the default compatible language model',
      label: 'Language Model',
      profile: {
        chatMode: 'ask',
        deliveryTarget: 'lm-api',
        mode: 'execute',
      },
    });
  }

  if (items.length === 0) {
    return undefined;
  }

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a run target or mode',
    title: 'Stencil: Run Template With Mode...',
  });

  return selected?.profile;
}

function formatChatModeLabel(chatMode: RunTemplateExecutionOptions['chatMode']): string {
  return chatMode === 'ask' ? 'Ask' : chatMode === 'edit' ? 'Edit' : 'Agent';
}
