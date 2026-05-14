import assert from 'node:assert/strict';
import path from 'node:path';

import * as vscode from 'vscode';

const EXTENSION_ID = 'stencil-pm.stencil-vscode';
const CONTRIBUTED_COMMANDS = [
  'stencil.openTemplate',
  'stencil.runTemplate',
  'stencil.runTemplateInCopilotChat',
  'stencil.runTemplateInCopilotChatSend',
  'stencil.runTemplateWithLanguageModel',
  'stencil.runTemplateWithLanguageModelSelectModel',
  'stencil.runTemplateInCopilotChatWithMode',
  'stencil.createTemplate',
  'stencil.listTemplates',
  'stencil.refreshTemplatesView',
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
  await assert.doesNotReject(
    vscode.commands.executeCommand('stencil.refreshTemplatesView'),
    'Expected the tree refresh command to execute in a real workspace host.',
  );

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspaceFolder, 'Expected the smoke test workspace to be open.');

  const templateUri = vscode.Uri.joinPath(
    workspaceFolder.uri,
    '.stencil',
    'templates',
    'example.md',
  );
  const readmeUri = vscode.Uri.joinPath(workspaceFolder.uri, 'README.md');

  const templateDocument = await vscode.workspace.openTextDocument(templateUri);
  const readmeDocument = await vscode.workspace.openTextDocument(readmeUri);

  assert.equal(
    templateDocument.languageId,
    'stencil-template',
    `Expected ${path.basename(templateUri.fsPath)} inside .stencil/ to resolve to the stencil-template language.`,
  );
  assert.equal(
    readmeDocument.languageId,
    'markdown',
    `Expected ${path.basename(readmeUri.fsPath)} outside .stencil/ to remain Markdown.`,
  );
}
