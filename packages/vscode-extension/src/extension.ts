import * as vscode from 'vscode';

import { registerCreateTemplateCommand } from './commands/createTemplate.js';
import { registerListTemplatesCommand } from './commands/listTemplates.js';
import { registerOpenTemplateCommand } from './commands/openTemplate.js';
import {
  registerRunTemplateCommand,
  registerRunTemplateInCopilotChatWithModeCommand,
  registerRunTemplateWithLanguageModelSelectModelCommand,
  registerRunTemplateWithModeCommand,
  RUN_TEMPLATE_IN_COPILOT_CHAT_COMMAND_ID,
  RUN_TEMPLATE_IN_COPILOT_CHAT_SEND_COMMAND_ID,
  RUN_TEMPLATE_IN_EDITOR_COMMAND_ID,
  RUN_TEMPLATE_WITH_LANGUAGE_MODEL_COMMAND_ID,
  RUN_TEMPLATE_WITH_MODE_COMMAND_ID,
} from './commands/runTemplate.js';
import {
  registerRefreshTemplatesViewCommand,
  STENCIL_TEMPLATES_VIEW_ID,
  TemplateTreeProvider,
} from './providers/templateTreeProvider.js';
import { RunPreferenceStore } from './services/runPreferenceStore.js';

export function activate(context: vscode.ExtensionContext): void {
  const templateTreeProvider = new TemplateTreeProvider();
  const runPreferenceStore = new RunPreferenceStore(context);

  context.subscriptions.push(
    registerOpenTemplateCommand(),
    registerRunTemplateCommand(undefined, undefined, {
      preferenceStore: runPreferenceStore,
    }),
    registerRunTemplateWithModeCommand(RUN_TEMPLATE_WITH_MODE_COMMAND_ID, {
      preferenceStore: runPreferenceStore,
    }),
    registerRunTemplateCommand(
      RUN_TEMPLATE_IN_EDITOR_COMMAND_ID,
      {
        deliveryTarget: 'editor',
      },
      {
        preferenceStore: runPreferenceStore,
      },
    ),
    registerRunTemplateCommand(
      RUN_TEMPLATE_IN_COPILOT_CHAT_COMMAND_ID,
      {
        deliveryTarget: 'copilot-chat',
        mode: 'insert',
      },
      {
        preferenceStore: runPreferenceStore,
      },
    ),
    registerRunTemplateCommand(
      RUN_TEMPLATE_IN_COPILOT_CHAT_SEND_COMMAND_ID,
      {
        deliveryTarget: 'copilot-chat',
        mode: 'send',
      },
      {
        preferenceStore: runPreferenceStore,
      },
    ),
    registerRunTemplateCommand(
      RUN_TEMPLATE_WITH_LANGUAGE_MODEL_COMMAND_ID,
      {
        deliveryTarget: 'lm-api',
      },
      {
        preferenceStore: runPreferenceStore,
      },
    ),
    registerRunTemplateWithLanguageModelSelectModelCommand(undefined, {
      preferenceStore: runPreferenceStore,
    }),
    registerRunTemplateInCopilotChatWithModeCommand(undefined, {
      preferenceStore: runPreferenceStore,
    }),
    registerCreateTemplateCommand(templateTreeProvider),
    registerListTemplatesCommand(),
    registerRefreshTemplatesViewCommand(templateTreeProvider),
    vscode.window.registerTreeDataProvider(STENCIL_TEMPLATES_VIEW_ID, templateTreeProvider),
  );
}

export function deactivate(): void {
  // Nothing to dispose outside context.subscriptions.
}
