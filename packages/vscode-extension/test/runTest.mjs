import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runTests } from '@vscode/test-electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = path.resolve(__dirname, '..');
const extensionTestsPath = path.resolve(__dirname, 'smoke', 'extension.test.mjs');
const fixtureWorkspace = path.resolve(__dirname, 'fixtures', 'workspace-run-template');

await runTests({
  extensionDevelopmentPath,
  extensionTestsPath,
  launchArgs: [fixtureWorkspace, '--disable-extensions'],
});
