import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ConfigContextProvider,
  ContextEngine,
  GitContextProvider,
  ProjectContextProvider,
  StaticContextProvider,
  SystemContextProvider,
} from '../src/context.js';
import type { ContextProvider } from '../src/types.js';

const execFileAsync = promisify(execFile);

// ── Helpers ───────────────────────────────────────────

function makeProvider(name: string, data: Record<string, string>): ContextProvider {
  return {
    name,
    resolve: () => Promise.resolve(data),
  };
}

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'stencil-ctx-test-'));
}

// ── ContextEngine ─────────────────────────────────────

describe('ContextEngine — resolveAll', () => {
  it('returns an empty object when no providers are registered', async () => {
    const engine = new ContextEngine();

    await expect(engine.resolveAll()).resolves.toEqual({});
  });

  it('returns variables from a registered provider', async () => {
    const engine = new ContextEngine();
    engine.register(makeProvider('A', { foo: 'bar' }));

    await expect(engine.resolveAll()).resolves.toEqual({ foo: 'bar' });
  });

  it('merges variables from multiple providers', async () => {
    const engine = new ContextEngine();
    engine.register(makeProvider('A', { a: '1' }));
    engine.register(makeProvider('B', { b: '2' }));

    await expect(engine.resolveAll()).resolves.toEqual({ a: '1', b: '2' });
  });

  it('lets later providers win on key collision', async () => {
    const engine = new ContextEngine();
    engine.register(makeProvider('First', { key: 'first' }));
    engine.register(makeProvider('Second', { key: 'second' }));

    await expect(engine.resolveAll()).resolves.toEqual({ key: 'second' });
  });

  it('isolates throwing providers so others still resolve', async () => {
    const engine = new ContextEngine();
    engine.register({
      name: 'Broken',
      resolve: () => Promise.reject(new Error('boom')),
    });
    engine.register(makeProvider('Good', { ok: 'yes' }));

    await expect(engine.resolveAll()).resolves.toEqual({ ok: 'yes' });
  });

  it('resolves values from StaticContextProvider', async () => {
    const engine = new ContextEngine();
    engine.register(new StaticContextProvider({ team_name: 'Platform' }, 'Config'));

    await expect(engine.resolveAll()).resolves.toEqual({ team_name: 'Platform' });
  });

  it('resolves values from ConfigContextProvider lazily', async () => {
    const engine = new ContextEngine();
    engine.register(new ConfigContextProvider(async () => ({ jira_project: 'PLAT' }), 'Config'));

    await expect(engine.resolveAll()).resolves.toEqual({ jira_project: 'PLAT' });
  });
});

describe('ContextEngine — resolve', () => {
  it('returns the value for an existing key', async () => {
    const engine = new ContextEngine();
    engine.register(makeProvider('A', { project_name: 'stencil' }));

    await expect(engine.resolve('project_name')).resolves.toBe('stencil');
  });

  it('returns undefined for a missing key', async () => {
    const engine = new ContextEngine();

    await expect(engine.resolve('missing')).resolves.toBeUndefined();
  });
});

// ── SystemContextProvider ─────────────────────────────

describe('SystemContextProvider', () => {
  it('resolves date in ISO 8601 format', async () => {
    const result = await new SystemContextProvider().resolve();

    expect(result['date']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('resolves os as a non-empty string', async () => {
    const result = await new SystemContextProvider().resolve();

    expect(result['os']).toBe(process.platform);
  });

  it('resolves cwd as the current working directory', async () => {
    const result = await new SystemContextProvider().resolve();

    expect(result['cwd']).toBe(process.cwd());
  });
});

// ── GitContextProvider ────────────────────────────────

describe('GitContextProvider — real git repo', () => {
  it('resolves without throwing', async () => {
    await expect(new GitContextProvider().resolve()).resolves.toBeDefined();
  });

  it('returns git values as non-empty strings when available', async () => {
    const isGitRepo = await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'])
      .then(() => true)
      .catch(() => false);
    if (!isGitRepo) return;

    const result = await new GitContextProvider().resolve();

    if ('current_branch' in result) expect(result['current_branch']?.length).toBeGreaterThan(0);
    if ('git_user' in result) expect(result['git_user']?.length).toBeGreaterThan(0);
  });
});

describe('GitContextProvider — non-git directory', () => {
  let originalCwd: string;
  let tempDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = makeTempDir();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { force: true, recursive: true });
  });

  it('does not throw outside a git repo', async () => {
    const result = await new GitContextProvider().resolve();

    expect(result).toEqual(expect.any(Object));
    expect(result['current_branch']).toBeUndefined();
  });
});

// ── ProjectContextProvider ────────────────────────────

describe('ProjectContextProvider — this repo', () => {
  it('resolves non-empty project variables', async () => {
    const result = await new ProjectContextProvider().resolve();

    expect(result['project_name']?.length).toBeGreaterThan(0);
    expect(result['language']?.length).toBeGreaterThan(0);
  });
});

describe('ProjectContextProvider — temp directory scenarios', () => {
  let originalCwd: string;
  let tempDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = makeTempDir();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { force: true, recursive: true });
  });

  it('falls back to directory name when no project files are present', async () => {
    const result = await new ProjectContextProvider().resolve();

    expect(result['project_name']).toBe(basename(tempDir));
  });

  it('returns unknown language when no known project files are present', async () => {
    const result = await new ProjectContextProvider().resolve();

    expect(result['language']).toBe('unknown');
  });

  it('detects package.json project name and TypeScript language', async () => {
    writeFileSync(join(tempDir, 'package.json'), '{"name":"pkg-project"}\n');
    writeFileSync(join(tempDir, 'index.ts'), 'export {};\n');

    const result = await new ProjectContextProvider().resolve();

    expect(result).toMatchObject({
      language: 'typescript',
      project_name: 'pkg-project',
    });
  });

  it('detects JavaScript when package.json exists without TypeScript files', async () => {
    writeFileSync(join(tempDir, 'package.json'), '{"name":"js-project"}\n');
    writeFileSync(join(tempDir, 'index.js'), 'export {};\n');

    const result = await new ProjectContextProvider().resolve();

    expect(result['language']).toBe('javascript');
  });

  it('detects pom.xml artifactId and Java language', async () => {
    writeFileSync(
      join(tempDir, 'pom.xml'),
      '<project><artifactId>java-project</artifactId></project>\n',
    );

    const result = await new ProjectContextProvider().resolve();

    expect(result).toMatchObject({
      language: 'java',
      project_name: 'java-project',
    });
  });

  it('detects Rust, Go, and Python project markers by priority', async () => {
    writeFileSync(join(tempDir, 'script.py'), 'print("hi")\n');
    expect((await new ProjectContextProvider().resolve())['language']).toBe('python');

    writeFileSync(join(tempDir, 'go.mod'), 'module example.com/project\n');
    expect((await new ProjectContextProvider().resolve())['language']).toBe('go');

    writeFileSync(join(tempDir, 'Cargo.toml'), '[package]\nname = "rust-project"\n');
    expect((await new ProjectContextProvider().resolve())['language']).toBe('rust');
  });
});
