import * as vscode from 'vscode';

import { registerCreateTemplateCommand } from './commands/createTemplate.js';
import { registerListTemplatesCommand } from './commands/listTemplates.js';
import { registerOpenTemplateCommand } from './commands/openTemplate.js';
import {
  registerRunTemplateCommand,
  registerRunTemplateInCopilotChatWithModeCommand,
  registerRunTemplateWithLanguageModelSelectModelCommand,
  RUN_TEMPLATE_IN_COPILOT_CHAT_COMMAND_ID,
  RUN_TEMPLATE_IN_COPILOT_CHAT_SEND_COMMAND_ID,
  RUN_TEMPLATE_WITH_LANGUAGE_MODEL_COMMAND_ID,
} from './commands/runTemplate.js';
import {
  registerRefreshTemplatesViewCommand,
  STENCIL_TEMPLATES_VIEW_ID,
  TemplateTreeProvider,
} from './providers/templateTreeProvider.js';

export function activate(context: vscode.ExtensionContext): void {
  const templateTreeProvider = new TemplateTreeProvider();

  context.subscriptions.push(
    registerOpenTemplateCommand(),
    registerRunTemplateCommand(),
    registerRunTemplateCommand(RUN_TEMPLATE_IN_COPILOT_CHAT_COMMAND_ID, {
      deliveryTarget: 'copilot-chat',
      mode: 'insert',
    }),
    registerRunTemplateCommand(RUN_TEMPLATE_IN_COPILOT_CHAT_SEND_COMMAND_ID, {
      deliveryTarget: 'copilot-chat',
      mode: 'send',
    }),
    registerRunTemplateCommand(RUN_TEMPLATE_WITH_LANGUAGE_MODEL_COMMAND_ID, {
      deliveryTarget: 'lm-api',
    }),
    registerRunTemplateWithLanguageModelSelectModelCommand(),
    registerRunTemplateInCopilotChatWithModeCommand(),
    registerCreateTemplateCommand(templateTreeProvider),
    registerListTemplatesCommand(),
    registerRefreshTemplatesViewCommand(templateTreeProvider),
    vscode.window.registerTreeDataProvider(STENCIL_TEMPLATES_VIEW_ID, templateTreeProvider),
  );
}

export function deactivate(): void {
  // Nothing to dispose outside context.subscriptions.
}
