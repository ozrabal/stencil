import * as vscode from 'vscode';

import { registerCreateTemplateCommand } from './commands/createTemplate.js';
import { registerListTemplatesCommand } from './commands/listTemplates.js';
import { registerRunTemplateCommand } from './commands/runTemplate.js';
import {
  STENCIL_TEMPLATES_VIEW_ID,
  TemplateTreeProvider,
} from './providers/templateTreeProvider.js';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    registerRunTemplateCommand(),
    registerCreateTemplateCommand(),
    registerListTemplatesCommand(),
    vscode.window.registerTreeDataProvider(STENCIL_TEMPLATES_VIEW_ID, new TemplateTreeProvider()),
  );
}

export function deactivate(): void {
  // Nothing to dispose outside context.subscriptions.
}
