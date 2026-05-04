import * as vscode from 'vscode';

import type { CommandContext } from '../types.js';

import { showCommandError } from '../services/errors.js';
import { getStencil } from '../services/getStencil.js';
import { hasStencilWorkspaceSetup, resolveWorkspace } from '../services/workspace.js';

interface CommandOptions {
  commandId: string;
  handler: (context: CommandContext) => Promise<void>;
  requireStencilSetup?: boolean;
}

export function registerWorkspaceCommand(options: CommandOptions): vscode.Disposable {
  return vscode.commands.registerCommand(options.commandId, async () => {
    try {
      const workspace = resolveWorkspace();
      if (workspace.kind === 'missing-workspace') {
        await vscode.window.showInformationMessage(
          'Open a workspace folder to use Stencil commands.',
        );
        return;
      }

      if (options.requireStencilSetup !== false) {
        const hasSetup = await hasStencilWorkspaceSetup(workspace.rootPath);
        if (!hasSetup) {
          await vscode.window.showInformationMessage(
            'Stencil is not set up in this workspace yet. Add a .stencil/ directory to continue.',
          );
          return;
        }
      }

      const stencil = getStencil(workspace);
      await options.handler({ stencil, workspace });
    } catch (error) {
      await showCommandError(error);
    }
  });
}
