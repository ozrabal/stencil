import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { StencilError, StencilErrorCode } from '../src/errors.js';
import { loadStencilConfig, mergeStencilConfig, StencilConfigError } from '../src/config.js';

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = path.join(
    os.tmpdir(),
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

async function writeConfig(stencilDir: string, content: string): Promise<void> {
  await mkdir(stencilDir, { recursive: true });
  await writeFile(path.join(stencilDir, 'config.yaml'), content, 'utf8');
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe('mergeStencilConfig', () => {
  it('merges customContext keys instead of replacing the object', () => {
    const result = mergeStencilConfig(
      {
        customContext: { team_name: 'Platform' },
        placeholderEnd: '}}',
        placeholderStart: '{{',
        version: 1,
      },
      {
        customContext: { jira_project: 'PLAT' },
      },
      {
        customContext: { team_name: 'Core' },
      },
    );

    expect(result.customContext).toEqual({
      jira_project: 'PLAT',
      team_name: 'Core',
    });
  });
});

describe('loadStencilConfig', () => {
  it('loads defaults when no config files exist', async () => {
    const projectDir = await makeTempDir('stencil-config-project');

    await expect(loadStencilConfig(path.join(projectDir, '.stencil'))).resolves.toEqual({
      placeholderEnd: '}}',
      placeholderStart: '{{',
      version: 1,
    });
  });

  it('loads only project config', async () => {
    const projectDir = await makeTempDir('stencil-config-project');
    await writeConfig(
      path.join(projectDir, '.stencil'),
      [
        'version: 2',
        "default_collection: 'backend'",
        'custom_context:',
        "  team_name: 'Platform'",
        "placeholder_start: '[['",
        "placeholder_end: ']]'",
      ].join('\n'),
    );

    await expect(loadStencilConfig(path.join(projectDir, '.stencil'))).resolves.toEqual({
      customContext: { team_name: 'Platform' },
      defaultCollection: 'backend',
      placeholderEnd: ']]',
      placeholderStart: '[[',
      version: 2,
    });
  });

  it('loads only global config', async () => {
    const projectDir = await makeTempDir('stencil-config-project');
    const globalDir = await makeTempDir('stencil-config-global');
    await writeConfig(
      globalDir,
      ['version: 3', "default_collection: 'review'", "placeholder_start: '<<'"].join('\n'),
    );

    await expect(loadStencilConfig(path.join(projectDir, '.stencil'), globalDir)).resolves.toEqual({
      defaultCollection: 'review',
      placeholderEnd: '}}',
      placeholderStart: '<<',
      version: 3,
    });
  });

  it('merges global and project config with project precedence', async () => {
    const projectDir = await makeTempDir('stencil-config-project');
    const globalDir = await makeTempDir('stencil-config-global');

    await writeConfig(
      globalDir,
      [
        "default_collection: 'review'",
        'custom_context:',
        "  team_name: 'Platform'",
        "placeholder_start: '<<'",
      ].join('\n'),
    );
    await writeConfig(
      path.join(projectDir, '.stencil'),
      [
        "default_collection: 'backend'",
        'custom_context:',
        "  jira_project: 'PLAT'",
        "placeholder_end: ']]'",
      ].join('\n'),
    );

    await expect(loadStencilConfig(path.join(projectDir, '.stencil'), globalDir)).resolves.toEqual({
      customContext: {
        jira_project: 'PLAT',
        team_name: 'Platform',
      },
      defaultCollection: 'backend',
      placeholderEnd: ']]',
      placeholderStart: '<<',
      version: 1,
    });
  });

  it('applies runtime overrides after file-based config', async () => {
    const projectDir = await makeTempDir('stencil-config-project');
    const globalDir = await makeTempDir('stencil-config-global');

    await writeConfig(
      globalDir,
      ['custom_context:', "  team_name: 'Platform'", "placeholder_start: '<<'"].join('\n'),
    );
    await writeConfig(
      path.join(projectDir, '.stencil'),
      ['custom_context:', "  jira_project: 'PLAT'", "placeholder_end: ']]'"].join('\n'),
    );

    await expect(
      loadStencilConfig(path.join(projectDir, '.stencil'), globalDir, {
        customContext: {
          jira_project: 'CORE',
          release_train: 'spring-26',
        },
        defaultCollection: 'docs',
      }),
    ).resolves.toEqual({
      customContext: {
        jira_project: 'CORE',
        release_train: 'spring-26',
        team_name: 'Platform',
      },
      defaultCollection: 'docs',
      placeholderEnd: ']]',
      placeholderStart: '<<',
      version: 1,
    });
  });

  it('normalizes snake_case keys and treats default_collection null as undefined', async () => {
    const projectDir = await makeTempDir('stencil-config-project');
    await writeConfig(
      path.join(projectDir, '.stencil'),
      ['version: 4', 'default_collection: null', 'custom_context:', "  team_name: 'Platform'"].join(
        '\n',
      ),
    );

    const result = await loadStencilConfig(path.join(projectDir, '.stencil'));

    expect(result).toEqual({
      customContext: { team_name: 'Platform' },
      placeholderEnd: '}}',
      placeholderStart: '{{',
      version: 4,
    });
    expect(result.defaultCollection).toBeUndefined();
  });

  it('throws StencilConfigError on malformed YAML', async () => {
    const projectDir = await makeTempDir('stencil-config-project');
    const stencilDir = path.join(projectDir, '.stencil');
    await writeConfig(stencilDir, 'custom_context: [broken');

    await expect(loadStencilConfig(stencilDir)).rejects.toMatchObject({
      code: StencilErrorCode.CONFIG_INVALID,
      filePath: path.join(stencilDir, 'config.yaml'),
      name: 'StencilConfigError',
    } as Partial<StencilConfigError>);
  });

  it('throws StencilConfigError on invalid schema types', async () => {
    const projectDir = await makeTempDir('stencil-config-project');
    const stencilDir = path.join(projectDir, '.stencil');
    await writeConfig(
      stencilDir,
      ['custom_context:', '  retries: 3', "placeholder_start: '{{'"].join('\n'),
    );

    await expect(loadStencilConfig(stencilDir)).rejects.toMatchObject({
      code: StencilErrorCode.CONFIG_INVALID,
      field: 'custom_context.retries',
      filePath: path.join(stencilDir, 'config.yaml'),
      name: 'StencilConfigError',
    } as Partial<StencilConfigError>);
  });

  it('config errors are StencilError instances with structured metadata', async () => {
    const projectDir = await makeTempDir('stencil-config-project');
    const stencilDir = path.join(projectDir, '.stencil');
    await writeConfig(stencilDir, 'version: wrong');

    await expect(loadStencilConfig(stencilDir)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(StencilError);
      expect(error).toBeInstanceOf(StencilConfigError);
      expect((error as StencilConfigError).code).toBe(StencilErrorCode.CONFIG_INVALID);
      expect((error as StencilConfigError).filePath).toBe(path.join(stencilDir, 'config.yaml'));
      expect((error as StencilConfigError).field).toBe('version');
      return true;
    });
  });

  it('throws StencilConfigError when placeholder_start is empty', async () => {
    const projectDir = await makeTempDir('stencil-config-project');
    const stencilDir = path.join(projectDir, '.stencil');
    await writeConfig(stencilDir, "placeholder_start: ''");

    await expect(loadStencilConfig(stencilDir)).rejects.toMatchObject({
      code: StencilErrorCode.CONFIG_INVALID,
      field: 'placeholder_start',
      filePath: path.join(stencilDir, 'config.yaml'),
      name: 'StencilConfigError',
    } as Partial<StencilConfigError>);
  });

  it('throws StencilConfigError when placeholder_end is empty', async () => {
    const projectDir = await makeTempDir('stencil-config-project');
    const stencilDir = path.join(projectDir, '.stencil');
    await writeConfig(stencilDir, "placeholder_end: ''");

    await expect(loadStencilConfig(stencilDir)).rejects.toMatchObject({
      code: StencilErrorCode.CONFIG_INVALID,
      field: 'placeholder_end',
      filePath: path.join(stencilDir, 'config.yaml'),
      name: 'StencilConfigError',
    } as Partial<StencilConfigError>);
  });

  it('throws StencilConfigError when placeholder delimiters are identical in one file', async () => {
    const projectDir = await makeTempDir('stencil-config-project');
    const stencilDir = path.join(projectDir, '.stencil');
    await writeConfig(stencilDir, ["placeholder_start: '[['", "placeholder_end: '[['"].join('\n'));

    await expect(loadStencilConfig(stencilDir)).rejects.toMatchObject({
      code: StencilErrorCode.CONFIG_INVALID,
      field: 'placeholder_start',
      filePath: path.join(stencilDir, 'config.yaml'),
      name: 'StencilConfigError',
    } as Partial<StencilConfigError>);
  });

  it('throws StencilConfigError when merged delimiter values become identical', async () => {
    const projectDir = await makeTempDir('stencil-config-project');
    const globalDir = await makeTempDir('stencil-config-global');

    await writeConfig(globalDir, "placeholder_start: '[['");
    await writeConfig(path.join(projectDir, '.stencil'), "placeholder_end: '[['");

    await expect(
      loadStencilConfig(path.join(projectDir, '.stencil'), globalDir),
    ).rejects.toMatchObject({
      code: StencilErrorCode.CONFIG_INVALID,
      field: 'placeholder_start',
      filePath: '<runtime>',
      name: 'StencilConfigError',
    } as Partial<StencilConfigError>);
  });
});
