import assert from 'node:assert/strict';

import * as vscode from 'vscode';

const EXTENSION_ID = 'stencil-pm.stencil-vscode';
const CONTRIBUTED_COMMANDS = [
  'stencil.runTemplate',
  'stencil.createTemplate',
  'stencil.listTemplates',
];

export async function run() {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);

  assert.ok(extension, `Expected extension "${EXTENSION_ID}" to be installed in the test host.`);

  await extension.activate();

  assert.equal(extension.isActive, true, 'Expected the extension to activate successfully.');

  const registeredCommands = await vscode.commands.getCommands(true);
  for (const commandId of CONTRIBUTED_COMMANDS) {
    assert.ok(
      registeredCommands.includes(commandId),
      `Expected command "${commandId}" to be contributed after activation.`,
    );
  }
}
