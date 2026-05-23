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
    env: {
      ...process.env,
      ...options.env,
    },
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

test('init returns handled JSON and creates the bootstrap sample', () => {
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
    assert.equal(envelope.data.sampleTemplateCreated, true);
    assert.equal(envelope.data.sampleTemplateName, 'quick-fix');
    assert.equal(
      normalizePath(envelope.data.sampleTemplatePath),
      normalizePath(path.join(projectDir, '.stencil', 'templates', 'quick-fix.md')),
    );
  } finally {
    rmSync(projectDir, { force: true, recursive: true });
  }
});

test('init, list, show, create, run, validate, and delete flow across the real bridge', () => {
  const projectDir = makeTempProject();

  try {
    const initEnvelope = parseJsonStdout(runBridge(projectDir, ['init']));
    assert.equal(initEnvelope.data.sampleTemplateName, 'quick-fix');

    const initialListEnvelope = parseJsonStdout(runBridge(projectDir, ['list']));
    assert.equal(initialListEnvelope.command, 'list');
    assert.deepEqual(
      initialListEnvelope.data.templates.map((template) => template.name),
      ['quick-fix'],
    );

    const sampleShowEnvelope = parseJsonStdout(runBridge(projectDir, ['show', 'quick-fix']));
    assert.equal(sampleShowEnvelope.command, 'show');
    assert.equal(sampleShowEnvelope.data.template.name, 'quick-fix');
    assert.match(sampleShowEnvelope.data.template.body, /Review the change in/);

    const createPayload = JSON.stringify({
      body: 'Review {{component_name}} in {{$ctx.project_name}}.',
      frontmatter: {
        description: 'Review template',
        name: 'review-checklist',
        placeholders: [{ description: 'Component under review', name: 'component_name', required: true }],
        tags: ['review', 'checklist'],
        version: 1,
      },
    });

    const createEnvelope = parseJsonStdout(
      runBridge(projectDir, ['create', 'review-checklist'], { stdin: createPayload }),
    );
    assert.equal(createEnvelope.command, 'create');
    assert.equal(createEnvelope.status, 'ok');
    assert.equal(createEnvelope.data.template.name, 'review-checklist');
    assert.deepEqual(createEnvelope.data.template.tags, ['review', 'checklist']);
    assert.deepEqual(createEnvelope.data.template.bodyTokens, [
      {
        kind: 'legacy-placeholder',
        placeholderName: 'component_name',
        raw: 'component_name',
        token: 'component_name',
      },
      {
        contextKey: 'project_name',
        kind: 'context',
        raw: '$ctx.project_name',
        token: '$ctx.project_name',
      },
    ]);

    const showEnvelope = parseJsonStdout(runBridge(projectDir, ['show', 'review-checklist']));
    assert.equal(showEnvelope.command, 'show');
    assert.equal(showEnvelope.data.template.body, 'Review {{component_name}} in {{$ctx.project_name}}.');
    assert.deepEqual(showEnvelope.data.template.tags, ['review', 'checklist']);
    assert.deepEqual(showEnvelope.data.template.bodyTokens, [
      {
        kind: 'legacy-placeholder',
        placeholderName: 'component_name',
        raw: 'component_name',
        token: 'component_name',
      },
      {
        contextKey: 'project_name',
        kind: 'context',
        raw: '$ctx.project_name',
        token: '$ctx.project_name',
      },
    ]);

    const needsInputEnvelope = parseJsonStdout(runBridge(projectDir, ['run', 'review-checklist']));
    assert.equal(needsInputEnvelope.command, 'resolve');
    assert.equal(needsInputEnvelope.status, 'needs_input');
    assert.equal(needsInputEnvelope.data.unresolvedCount, 1);
    assert.deepEqual(needsInputEnvelope.data.inputs, [
      {
        description: 'Component under review',
        name: 'component_name',
        required: true,
        source: 'unresolved',
        sources: ['legacy', 'frontmatter'],
        value: '',
      },
    ]);
    assert.deepEqual(needsInputEnvelope.data.placeholders, [
      { name: 'component_name', source: 'unresolved', value: '' },
    ]);
    assert.match(needsInputEnvelope.data.resolvedBody, /{{component_name}}/);

    const runEnvelope = parseJsonStdout(
      runBridge(projectDir, ['run', 'review-checklist', 'component_name=AuthService']),
    );
    assert.equal(runEnvelope.command, 'resolve');
    assert.equal(runEnvelope.status, 'ok');
    assert.match(runEnvelope.data.resolvedBody, /AuthService/);
    assert.deepEqual(runEnvelope.data.inputs, [
      {
        description: 'Component under review',
        name: 'component_name',
        required: true,
        source: 'explicit',
        sources: ['legacy', 'frontmatter'],
        value: 'AuthService',
      },
    ]);

    const listEnvelope = parseJsonStdout(runBridge(projectDir, ['list']));
    assert.equal(listEnvelope.command, 'list');
    assert.deepEqual(
      listEnvelope.data.templates.map((template) => template.name),
      ['quick-fix', 'review-checklist'],
    );
    assert.equal(
      Object.hasOwn(
        listEnvelope.data.templates.find((template) => template.name === 'review-checklist'),
        'body',
      ),
      false,
    );

    const validateEnvelope = parseJsonStdout(runBridge(projectDir, ['validate', 'review-checklist']));
    assert.equal(validateEnvelope.command, 'validate');
    assert.equal(validateEnvelope.status, 'ok');
    assert.equal(validateEnvelope.data.validation.valid, true);

    const duplicateCreateEnvelope = parseJsonStdout(
      runBridge(projectDir, ['create', 'review-checklist'], { stdin: createPayload }),
    );
    assert.equal(duplicateCreateEnvelope.command, 'create');
    assert.equal(duplicateCreateEnvelope.status, 'error');
    assert.equal(duplicateCreateEnvelope.error.code, 'TEMPLATE_ALREADY_EXISTS');
    assert.equal(duplicateCreateEnvelope.data.templateName, 'review-checklist');

    const deleteEnvelope = parseJsonStdout(runBridge(projectDir, ['delete', 'review-checklist']));
    assert.equal(deleteEnvelope.command, 'delete');
    assert.equal(deleteEnvelope.data.deleted, true);

    const secondDeleteEnvelope = parseJsonStdout(runBridge(projectDir, ['delete', 'review-checklist']));
    assert.equal(secondDeleteEnvelope.data.deleted, false);
  } finally {
    rmSync(projectDir, { force: true, recursive: true });
  }
});

test('bridge list and show stay project-only even when HOME has global templates', () => {
  const projectDir = makeTempProject();
  const homeDir = mkdtempSync(path.join(os.tmpdir(), 'stencil-claude-home-'));

  try {
    writeTemplate(
      path.join(homeDir, '.stencil'),
      'global-only',
      'Global body',
      ['- name: ignored', '  description: ignored', '  required: true'],
    );
    parseJsonStdout(runBridge(projectDir, ['init'], { env: { HOME: homeDir } }));

    const listEnvelope = parseJsonStdout(runBridge(projectDir, ['list'], { env: { HOME: homeDir } }));
    assert.deepEqual(
      listEnvelope.data.templates.map((template) => template.name),
      ['quick-fix'],
    );

    const showEnvelope = parseJsonStdout(
      runBridge(projectDir, ['show', 'global-only'], { env: { HOME: homeDir } }),
    );
    assert.equal(showEnvelope.status, 'error');
    assert.equal(showEnvelope.error.code, 'TEMPLATE_NOT_FOUND');
  } finally {
    rmSync(projectDir, { force: true, recursive: true });
    rmSync(homeDir, { force: true, recursive: true });
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

test('show surfaces validation warnings from core without converting them into errors', () => {
  const projectDir = makeTempProject();

  try {
    writeTemplate(
      path.join(projectDir, '.stencil'),
      'warning-template',
      'Body without placeholders.',
      ['- name: orphaned_input', '  description: Declared but unused', '  required: true'],
    );

    const envelope = parseJsonStdout(runBridge(projectDir, ['show', 'warning-template']));
    assert.equal(envelope.command, 'show');
    assert.equal(envelope.status, 'ok');
    assert.equal(envelope.data.validation.valid, true);
    assert.equal(envelope.data.validation.issues.length > 0, true);
  } finally {
    rmSync(projectDir, { force: true, recursive: true });
  }
});

test('run preserves provenance for context and default resolved inputs', () => {
  const projectDir = makeTempProject();

  try {
    const createPayload = JSON.stringify({
      body: 'Project {{$ctx.project_name}} in {{input:mode:draft}} mode for {{input:owner}}.',
      frontmatter: {
        description: 'Default and context resolution',
        name: 'defaults-and-context',
        version: 1,
      },
    });

    parseJsonStdout(runBridge(projectDir, ['create', 'defaults-and-context'], { stdin: createPayload }));

    const unresolvedEnvelope = parseJsonStdout(runBridge(projectDir, ['run', 'defaults-and-context']));
    assert.equal(unresolvedEnvelope.command, 'resolve');
    assert.equal(unresolvedEnvelope.status, 'needs_input');
    assert.equal(unresolvedEnvelope.data.unresolvedCount, 1);
    assert.deepEqual(unresolvedEnvelope.data.inputs, [
      {
        defaultValue: 'draft',
        name: 'mode',
        required: false,
        source: 'default',
        sources: ['inline'],
        value: 'draft',
      },
      {
        name: 'owner',
        required: true,
        source: 'unresolved',
        sources: ['inline'],
        value: '',
      },
    ]);
    assert.deepEqual(unresolvedEnvelope.data.placeholders, [
      { name: 'mode', source: 'default', value: 'draft' },
      { name: 'owner', source: 'unresolved', value: '' },
    ]);
    assert.match(unresolvedEnvelope.data.resolvedBody, /draft mode/);
    assert.doesNotMatch(unresolvedEnvelope.data.resolvedBody, /\{\{\$ctx\.project_name\}\}/);

    const resolvedEnvelope = parseJsonStdout(
      runBridge(projectDir, ['run', 'defaults-and-context', 'owner=Platform']),
    );
    assert.equal(resolvedEnvelope.status, 'ok');
    assert.equal(resolvedEnvelope.data.unresolvedCount, 0);
    assert.deepEqual(resolvedEnvelope.data.inputs, [
      {
        defaultValue: 'draft',
        name: 'mode',
        required: false,
        source: 'default',
        sources: ['inline'],
        value: 'draft',
      },
      {
        name: 'owner',
        required: true,
        source: 'explicit',
        sources: ['inline'],
        value: 'Platform',
      },
    ]);
    assert.deepEqual(resolvedEnvelope.data.placeholders, [
      { name: 'mode', source: 'default', value: 'draft' },
      { name: 'owner', source: 'explicit', value: 'Platform' },
    ]);
    assert.match(resolvedEnvelope.data.resolvedBody, /Platform/);
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

function writeTemplate(stencilDir, name, body, placeholderLines = []) {
  mkdirSync(path.join(stencilDir, 'templates'), { recursive: true });
  const placeholdersBlock =
    placeholderLines.length === 0 ? '' : `placeholders:\n${placeholderLines.join('\n')}\n`;
  writeFileSync(
    path.join(stencilDir, 'templates', `${name}.md`),
    [
      '---',
      `name: ${name}`,
      `description: Description for ${name}`,
      'version: 1',
      placeholdersBlock.trimEnd(),
      '---',
      '',
      body,
    ]
      .filter(Boolean)
      .join('\n'),
    'utf8',
  );
}
