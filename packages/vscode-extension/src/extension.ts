import * as vscode from 'vscode';

import { registerCreateTemplateCommand } from './commands/createTemplate.js';
import { registerListTemplatesCommand } from './commands/listTemplates.js';
import { registerOpenTemplateCommand } from './commands/openTemplate.js';
import { registerRunTemplateCommand } from './commands/runTemplate.js';
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
    registerCreateTemplateCommand(templateTreeProvider),
    registerListTemplatesCommand(),
    registerRefreshTemplatesViewCommand(templateTreeProvider),
    vscode.window.registerTreeDataProvider(STENCIL_TEMPLATES_VIEW_ID, templateTreeProvider),
  );
}

export function deactivate(): void {
  // Nothing to dispose outside context.subscriptions.
}
