import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CliInputError,
  CliUsageError,
  parseCliArgs,
  STENCIL_CLI_EXIT_INVALID_USAGE,
  STENCIL_CLI_EXIT_RUNTIME_FAILURE,
} from '../src/cli-args.js';
import { runParsedCliCommand } from '../src/cli-runner.js';
import { Stencil } from '../src/stencil.js';
import { LocalStorageProvider } from '../src/storage.js';

let projectDir: string;

beforeEach(async () => {
  projectDir = await makeTempDir('stencil-cli');
});

afterEach(async () => {
  await rm(projectDir, { force: true, recursive: true });
});

describe('CLI runner', () => {
  it('returns help as a usage error with exit code 0', () => {
    expect(() => parseCliArgs(['--help'], '')).toThrowError(
      /Usage:\n {2}stencil-cli init\n {2}stencil-cli list/,
    );
  });

  it('rejects malformed argv with exit code 64 semantics', async () => {
    const result = await runCli(['show'], '');

    expect(result.exitCode).toBe(STENCIL_CLI_EXIT_INVALID_USAGE);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/Missing template name for command "show"\./);
  });

  it('rejects malformed stdin JSON with exit code 70 semantics', async () => {
    const result = await runCli(['create', '--stdin-json'], '{not-json');

    expect(result.exitCode).toBe(STENCIL_CLI_EXIT_RUNTIME_FAILURE);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/Failed to parse create payload from stdin as JSON/);
  });

  it('handles init with JSON stdout and empty stderr', async () => {
    const result = await runCli(['init'], '');
    const envelope = parseJson(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(envelope.status).toBe('ok');
    expect(envelope.command).toBe('init');
    expect(envelope.data.projectDir).toBe(projectDir);
    expect(envelope.data.createdPaths).toContain(path.join(projectDir, '.stencil'));
    expect(envelope.data.sampleTemplateCreated).toBe(true);
    expect(envelope.data.sampleTemplateName).toBe('quick-fix');
    expect(envelope.data.sampleTemplatePath).toBe(
      path.join(projectDir, '.stencil', 'templates', 'quick-fix.md'),
    );
  });

  it('creates templates from stdin JSON payloads', async () => {
    const payload = JSON.stringify({
      body: 'Review {{input:component_name}} in {{$ctx.project_name}} carefully.',
      frontmatter: {
        description: 'Code review checklist',
        name: 'review-checklist',
        tags: ['review', 'mvp'],
        version: 1,
      },
    });

    const result = await runCli(['create', '--stdin-json'], payload);
    const envelope = parseJson(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(envelope.status).toBe('ok');
    expect(envelope.command).toBe('create');
    expect(envelope.data.template.name).toBe('review-checklist');
    expect(envelope.data.template.body).toContain('component_name');
    expect(envelope.data.template.tags).toEqual(['review', 'mvp']);
    expect(envelope.data.template.bodyTokens).toEqual([
      {
        inputName: 'component_name',
        kind: 'inline-input',
        raw: 'input:component_name',
        token: 'input:component_name',
      },
      {
        contextKey: 'project_name',
        kind: 'context',
        raw: '$ctx.project_name',
        token: '$ctx.project_name',
      },
    ]);
    expect(envelope.data.validation.valid).toBe(true);
  });

  it('returns handled JSON errors for duplicate create names', async () => {
    await createTemplate('duplicate-template', 'Original body');

    const payload = JSON.stringify({
      body: 'Replacement body',
      frontmatter: {
        description: 'Duplicate name',
        name: 'duplicate-template',
        version: 1,
      },
    });

    const result = await runCli(['create', '--stdin-json'], payload);
    const envelope = parseJson(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(envelope.status).toBe('error');
    expect(envelope.command).toBe('create');
    expect(envelope.error.code).toBe('TEMPLATE_ALREADY_EXISTS');
    expect(envelope.data.templateName).toBe('duplicate-template');
  });

  it('returns validation_failed for invalid create payloads that reach core validation', async () => {
    const payload = JSON.stringify({
      body: 'Body',
      frontmatter: {
        description: '',
        name: 'bad-template',
        version: 1,
      },
    });

    const result = await runCli(['create', '--stdin-json'], payload);
    const envelope = parseJson(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(envelope.status).toBe('validation_failed');
    expect(envelope.command).toBe('create');
    expect(envelope.issues.length).toBeGreaterThan(0);
  });

  it('lists template summaries only', async () => {
    await createTemplate('alpha', 'Alpha body');

    const result = await runCli(['list'], '');
    const envelope = parseJson(result.stdout);

    expect(envelope.status).toBe('ok');
    expect(envelope.command).toBe('list');
    expect(envelope.data.templates).toHaveLength(1);
    expect(envelope.data.templates[0].name).toBe('alpha');
    expect(envelope.data.templates[0].body).toBeUndefined();
  });

  it('retains default global lookup when project-only is not requested', async () => {
    const globalDir = await makeTempDir('stencil-global');

    try {
      await createTemplate('alpha', 'Alpha body');
      await saveTemplateInStorageRoot(globalDir, 'global-only', 'Global body');

      const result = await runCli(['list'], '', { globalDir });
      const envelope = parseJson(result.stdout);

      expect(envelope.data.templates.map((template: { name: string }) => template.name)).toEqual([
        'alpha',
        'global-only',
      ]);
    } finally {
      await rm(globalDir, { force: true, recursive: true });
    }
  });

  it('uses project-only mode to ignore global-only templates', async () => {
    const globalDir = await makeTempDir('stencil-global');

    try {
      await createTemplate('alpha', 'Alpha body');
      await saveTemplateInStorageRoot(globalDir, 'global-only', 'Global body');

      const result = await runCli(['list', '--project-only'], '', { globalDir });
      const envelope = parseJson(result.stdout);

      expect(envelope.data.templates.map((template: { name: string }) => template.name)).toEqual([
        'alpha',
      ]);
    } finally {
      await rm(globalDir, { force: true, recursive: true });
    }
  });

  it('shows template details with validation', async () => {
    await createTemplate('alpha', 'Alpha {{input:component_name}} {{$ctx.project_name}} body');

    const result = await runCli(['show', 'alpha'], '');
    const envelope = parseJson(result.stdout);

    expect(envelope.status).toBe('ok');
    expect(envelope.command).toBe('show');
    expect(envelope.data.template.name).toBe('alpha');
    expect(envelope.data.template.body).toBe(
      'Alpha {{input:component_name}} {{$ctx.project_name}} body',
    );
    expect(envelope.data.template.bodyTokens).toEqual([
      {
        inputName: 'component_name',
        kind: 'inline-input',
        raw: 'input:component_name',
        token: 'input:component_name',
      },
      {
        contextKey: 'project_name',
        kind: 'context',
        raw: '$ctx.project_name',
        token: '$ctx.project_name',
      },
    ]);
    expect(envelope.data.validation.valid).toBe(true);
  });

  it('returns handled JSON errors for missing show templates', async () => {
    const result = await runCli(['show', 'ghost'], '');
    const envelope = parseJson(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(envelope.status).toBe('error');
    expect(envelope.error.code).toBe('TEMPLATE_NOT_FOUND');
  });

  it('returns handled JSON errors for global-only templates in project-only show mode', async () => {
    const globalDir = await makeTempDir('stencil-global');

    try {
      await saveTemplateInStorageRoot(globalDir, 'global-only', 'Global body');

      const result = await runCli(['show', '--project-only', 'global-only'], '', { globalDir });
      const envelope = parseJson(result.stdout);

      expect(envelope.status).toBe('error');
      expect(envelope.error.code).toBe('TEMPLATE_NOT_FOUND');
    } finally {
      await rm(globalDir, { force: true, recursive: true });
    }
  });

  it('returns validation_failed for invalid validate results and ok for warnings-free templates', async () => {
    await createTemplate('healthy', 'Healthy body');
    await mkdir(path.join(projectDir, '.stencil', 'templates'), { recursive: true });
    await writeFile(
      path.join(projectDir, '.stencil', 'templates', 'broken.md'),
      ['---', 'name: broken', 'description: ""', 'version: 1', '---', '', 'Body'].join('\n'),
      'utf8',
    );

    const okResult = await runCli(['validate', 'healthy'], '');
    const okEnvelope = parseJson(okResult.stdout);
    expect(okEnvelope.status).toBe('ok');
    expect(okEnvelope.data.validation.valid).toBe(true);

    const brokenResult = await runCli(['validate', 'broken'], '');
    const brokenEnvelope = parseJson(brokenResult.stdout);
    expect(brokenEnvelope.status).toBe('validation_failed');
    expect(brokenEnvelope.data.validation.valid).toBe(false);
  });

  it('resolves templates and reports unresolved inputs without stderr noise', async () => {
    const stencil = new Stencil({ projectDir });
    await stencil.create(
      {
        description: 'Review template',
        name: 'review',
        placeholders: [{ description: 'Component name', name: 'component_name', required: true }],
        version: 1,
      },
      'Review {{component_name}} in {{$ctx.project_name}}.',
    );

    const unresolved = await runCli(['resolve', 'review'], '');
    const unresolvedEnvelope = parseJson(unresolved.stdout);
    expect(unresolvedEnvelope.status).toBe('needs_input');
    expect(unresolvedEnvelope.data.unresolvedCount).toBe(1);

    const resolved = await runCli(['resolve', 'review', 'component_name=AuthService'], '');
    const resolvedEnvelope = parseJson(resolved.stdout);
    expect(resolvedEnvelope.status).toBe('ok');
    expect(resolvedEnvelope.data.unresolvedCount).toBe(0);
    expect(resolvedEnvelope.data.resolvedBody).toContain('AuthService');
  });

  it('returns handled JSON errors for missing resolve templates', async () => {
    const result = await runCli(['resolve', 'ghost'], '');
    const envelope = parseJson(result.stdout);

    expect(envelope.status).toBe('error');
    expect(envelope.error.code).toBe('TEMPLATE_NOT_FOUND');
  });

  it('deletes templates idempotently', async () => {
    await createTemplate('alpha', 'Alpha body');

    const deleted = parseJson((await runCli(['delete', 'alpha'], '')).stdout);
    expect(deleted.status).toBe('ok');
    expect(deleted.data.deleted).toBe(true);

    const missing = parseJson((await runCli(['delete', 'alpha'], '')).stdout);
    expect(missing.status).toBe('ok');
    expect(missing.data.deleted).toBe(false);
  });

  it('returns adapter-agnostic context detection data', async () => {
    const result = await runCli(['detect-context'], '');
    const envelope = parseJson(result.stdout);

    expect(envelope.status).toBe('ok');
    expect(envelope.command).toBe('detect-context');
    expect(typeof envelope.data.context).toBe('object');
  });
});

async function runCli(args: string[], stdinText: string, options: { globalDir?: string } = {}) {
  try {
    const parsed = parseCliArgs(args, stdinText);
    return await runParsedCliCommand(
      parsed,
      new Stencil({
        globalDir: 'projectOnly' in parsed && parsed.projectOnly ? null : options.globalDir,
        projectDir,
      }),
    );
  } catch (error) {
    if (error instanceof CliUsageError || error instanceof CliInputError) {
      return {
        exitCode: error.exitCode,
        stderr: `${error.message}\n`,
        stdout: '',
      };
    }

    throw error;
  }
}

async function createTemplate(name: string, body: string): Promise<void> {
  const stencil = new Stencil({ projectDir });
  await stencil.create(
    {
      description: `Description for ${name}`,
      name,
      version: 1,
    },
    body,
  );
}

async function saveTemplateInStorageRoot(
  storageRoot: string,
  name: string,
  body: string,
): Promise<void> {
  const storage = new LocalStorageProvider(storageRoot);
  await storage.saveTemplate({
    body,
    filePath: '',
    frontmatter: {
      description: `Description for ${name}`,
      name,
      version: 1,
    },
    source: 'project',
  });
}

function parseJson(stdout: string) {
  return JSON.parse(stdout);
}

async function makeTempDir(prefix: string): Promise<string> {
  const dir = path.join(
    os.tmpdir(),
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(dir, { recursive: true });
  return dir;
}
