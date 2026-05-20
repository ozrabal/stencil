import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const commandScriptPath = path.join(packageRoot, 'scripts', 'stencil-command.sh');

function makeTempProject() {
  const projectDir = mkdtempSync(path.join(os.tmpdir(), 'stencil-claude-bridge-'));
  return projectDir;
}

function runBridge(projectDir, args, options = {}) {
  return spawnSync('bash', [commandScriptPath, ...args], {
    cwd: projectDir,
    encoding: 'utf8',
    input: options.stdin,
  });
}

function parseJsonStdout(result) {
  assert.equal(result.stderr, '');
  assert.equal(result.status, 0);
  return JSON.parse(result.stdout);
}

function normalizePath(targetPath) {
  return realpathSync(targetPath);
}

test('init returns handled JSON and creates the stencil directories', () => {
  const projectDir = makeTempProject();

  try {
    const result = runBridge(projectDir, ['init']);
    const envelope = parseJsonStdout(result);

    assert.equal(envelope.command, 'init');
    assert.equal(envelope.status, 'ok');
    assert.equal(normalizePath(envelope.data.projectDir), normalizePath(projectDir));
    assert.equal(
      normalizePath(envelope.data.stencilDir),
      normalizePath(path.join(projectDir, '.stencil')),
    );
  } finally {
    rmSync(projectDir, { force: true, recursive: true });
  }
});

test('create, show, run, list, validate, and delete flow across the real bridge', () => {
  const projectDir = makeTempProject();

  try {
    parseJsonStdout(runBridge(projectDir, ['init']));

    const createPayload = JSON.stringify({
      body: 'Review {{component_name}} in {{$ctx.project_name}}.',
      frontmatter: {
        description: 'Review template',
        name: 'review-checklist',
        placeholders: [{ description: 'Component under review', name: 'component_name', required: true }],
        version: 1,
      },
    });

    const createEnvelope = parseJsonStdout(
      runBridge(projectDir, ['create', 'review-checklist'], { stdin: createPayload }),
    );
    assert.equal(createEnvelope.command, 'create');
    assert.equal(createEnvelope.status, 'ok');
    assert.equal(createEnvelope.data.template.name, 'review-checklist');

    const showEnvelope = parseJsonStdout(runBridge(projectDir, ['show', 'review-checklist']));
    assert.equal(showEnvelope.command, 'show');
    assert.equal(showEnvelope.data.template.body, 'Review {{component_name}} in {{$ctx.project_name}}.');

    const needsInputEnvelope = parseJsonStdout(runBridge(projectDir, ['run', 'review-checklist']));
    assert.equal(needsInputEnvelope.command, 'resolve');
    assert.equal(needsInputEnvelope.status, 'needs_input');
    assert.equal(needsInputEnvelope.data.unresolvedCount, 1);

    const runEnvelope = parseJsonStdout(
      runBridge(projectDir, ['run', 'review-checklist', 'component_name=AuthService']),
    );
    assert.equal(runEnvelope.command, 'resolve');
    assert.equal(runEnvelope.status, 'ok');
    assert.match(runEnvelope.data.resolvedBody, /AuthService/);

    const listEnvelope = parseJsonStdout(runBridge(projectDir, ['list']));
    assert.equal(listEnvelope.command, 'list');
    assert.equal(listEnvelope.data.templates.length, 1);
    assert.equal(listEnvelope.data.templates[0].name, 'review-checklist');
    assert.equal(Object.hasOwn(listEnvelope.data.templates[0], 'body'), false);

    const validateEnvelope = parseJsonStdout(runBridge(projectDir, ['validate', 'review-checklist']));
    assert.equal(validateEnvelope.command, 'validate');
    assert.equal(validateEnvelope.status, 'ok');
    assert.equal(validateEnvelope.data.validation.valid, true);

    const deleteEnvelope = parseJsonStdout(runBridge(projectDir, ['delete', 'review-checklist']));
    assert.equal(deleteEnvelope.command, 'delete');
    assert.equal(deleteEnvelope.data.deleted, true);

    const secondDeleteEnvelope = parseJsonStdout(runBridge(projectDir, ['delete', 'review-checklist']));
    assert.equal(secondDeleteEnvelope.data.deleted, false);
  } finally {
    rmSync(projectDir, { force: true, recursive: true });
  }
});

test('validate returns validation_failed JSON for broken templates', () => {
  const projectDir = makeTempProject();

  try {
    mkdirSync(path.join(projectDir, '.stencil', 'templates'), { recursive: true });
    writeFileSync(
      path.join(projectDir, '.stencil', 'templates', 'broken.md'),
      ['---', 'name: broken', 'description: ""', 'version: 1', '---', '', 'Body'].join('\n'),
      'utf8',
    );

    const envelope = parseJsonStdout(runBridge(projectDir, ['validate', 'broken']));
    assert.equal(envelope.command, 'validate');
    assert.equal(envelope.status, 'validation_failed');
    assert.equal(envelope.data.validation.valid, false);
  } finally {
    rmSync(projectDir, { force: true, recursive: true });
  }
});

test('detect-context remains available as an internal bridge helper', () => {
  const projectDir = makeTempProject();

  try {
    const envelope = parseJsonStdout(runBridge(projectDir, ['detect-context']));
    assert.equal(envelope.command, 'detect-context');
    assert.equal(envelope.status, 'ok');
    assert.equal(typeof envelope.data.context, 'object');
  } finally {
    rmSync(projectDir, { force: true, recursive: true });
  }
});
