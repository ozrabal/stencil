import assert from 'node:assert/strict';
import path from 'node:path';

import * as vscode from 'vscode';

import {
  getWorkspaceFolder,
  getWorkspaceUri,
  openWorkspaceDocument,
  showWorkspaceDocument,
} from './helpers.mjs';

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

  const workspaceFolder = getWorkspaceFolder();

  const templateUri = getWorkspaceUri('.stencil', 'templates', 'run-editor.md');
  const readmeUri = getWorkspaceUri('README.md');

  const templateDocument = await openWorkspaceDocument('.stencil', 'templates', 'run-editor.md');
  const readmeDocument = await openWorkspaceDocument('README.md');

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

  await showWorkspaceDocument('src', 'example.js');

  await assert.doesNotReject(
    vscode.commands.executeCommand('stencil.runTemplateInEditor', 'run-editor'),
    'Expected the editor run command to execute in a real workspace host.',
  );

  const runEditor = vscode.window.activeTextEditor;
  assert.ok(runEditor, 'Expected the editor run command to open a document.');
  assert.equal(
    runEditor.document.getText(),
    'Summarize src/example.ts for a code review.',
    'Expected the editor run command to open the resolved prompt body.',
  );
  assert.equal(
    runEditor.document.languageId,
    'markdown',
    'Expected editor delivery to open the resolved prompt as Markdown.',
  );

  await assert.doesNotReject(
    vscode.commands.executeCommand('stencil.runTemplateToClipboard', 'run-clipboard'),
    'Expected the clipboard run command to execute in a real workspace host.',
  );

  if (typeof vscode.env.clipboard.readText === 'function') {
    const clipboardText = await vscode.env.clipboard.readText();
    assert.equal(
      clipboardText,
      'Create a review checklist for src/example.ts.',
      'Expected clipboard delivery to write the resolved prompt body when clipboard reads are available.',
    );
  }
}
