import * as vscode from 'vscode';

import type { RunTemplateDeliveryTarget, RunTemplateMode } from '../runOptions.js';

export interface RunTemplateDeliveryCapability {
  available: boolean;
  implemented: boolean;
  supportedModes: RunTemplateMode[];
  target: RunTemplateDeliveryTarget;
  unavailableReason?: string;
}

export function getDeliveryTargetCapability(
  target: RunTemplateDeliveryTarget,
): RunTemplateDeliveryCapability {
  switch (target) {
    case 'clipboard':
      return {
        available: typeof vscode.env?.clipboard?.writeText === 'function',
        implemented: false,
        supportedModes: ['default', 'insert'],
        target,
        unavailableReason: 'VS Code clipboard services are not available in the current runtime.',
      };
    case 'copilot-chat':
      return {
        available: false,
        implemented: false,
        supportedModes: ['default', 'send'],
        target,
        unavailableReason: 'Copilot Chat delivery is not available in this extension build.',
      };
    case 'editor':
      return {
        available:
          typeof vscode.workspace.openTextDocument === 'function' &&
          typeof vscode.window.showTextDocument === 'function',
        implemented: true,
        supportedModes: ['default'],
        target,
        unavailableReason: 'VS Code editor services are not available in the current runtime.',
      };
    case 'lm-api':
      return {
        available: false,
        implemented: false,
        supportedModes: ['default', 'execute'],
        target,
        unavailableReason: 'LM API delivery is not available in this extension build.',
      };
  }
}
