# Plan: Epic 4 — Context Engine

**Goal:** Implement the `ContextEngine` class and three built-in `ContextProvider` implementations (`SystemContextProvider`, `GitContextProvider`, `ProjectContextProvider`) in `context.ts`, and write a full test suite in `context.test.ts`.

**Prerequisite:** Epic 1 (types) must be complete. Verify before starting:

```bash
cd packages/core && npm run typecheck && npm test
```

Zero errors and all existing tests passing expected. (Epic 4 is independent of Epics 2 and 3 — it only depends on the `ContextProvider` interface in `types.ts`.)

**Validation command (run after each step):**

```bash
cd packages/core && npm run typecheck
```

**Full test run (run after all steps):**

```bash
cd packages/core && npm test
```

---

## Context: What Changes and Why

### Current state

`context.ts` has three provider stubs. Each class has a `name` and a `resolve()` method that returns `Promise.resolve({})`. There is no `ContextEngine` class. There is no `context.test.ts`.

### Target state

| Concern                    | Current             | Target                                                              |
| -------------------------- | ------------------- | ------------------------------------------------------------------- |
| `ContextEngine` class      | Missing             | `register()`, `resolveAll()`, `resolve(name)` — full implementation |
| `SystemContextProvider`    | Stub — returns `{}` | Returns `date`, `os`, `cwd`                                         |
| `GitContextProvider`       | Stub — returns `{}` | Returns `current_branch`, `git_user` via `git` shell commands       |
| `ProjectContextProvider`   | Stub — returns `{}` | Returns `project_name`, `language` via filesystem detection         |
| Provider failure isolation | N/A                 | Any throwing provider returns `{}` and never blocks others          |
| Key collision resolution   | N/A                 | Later-registered providers win                                      |
| `context.test.ts`          | Missing             | Full suite — every provider and engine behaviour exercised          |

### Variables by provider

| Provider                 | Key              | Implementation                                                                      |
| ------------------------ | ---------------- | ----------------------------------------------------------------------------------- |
| `SystemContextProvider`  | `date`           | `new Date().toISOString()`                                                          |
| `SystemContextProvider`  | `os`             | `process.platform`                                                                  |
| `SystemContextProvider`  | `cwd`            | `process.cwd()`                                                                     |
| `GitContextProvider`     | `current_branch` | `git rev-parse --abbrev-ref HEAD` (trimmed stdout)                                  |
| `GitContextProvider`     | `git_user`       | `git config user.name` (trimmed stdout)                                             |
| `ProjectContextProvider` | `project_name`   | `name` field from `package.json`, or `artifactId` from `pom.xml`, or directory name |
| `ProjectContextProvider` | `language`       | Detected from presence of `package.json`, `pom.xml`, `Cargo.toml`, `go.mod`, `*.py` |

### Language detection priority

Check in this order; first match wins:

| File(s) present     | `language` value                                                       |
| ------------------- | ---------------------------------------------------------------------- |
| `package.json`      | `typescript` if any `.ts` files exist under the cwd, else `javascript` |
| `pom.xml`           | `java`                                                                 |
| `Cargo.toml`        | `rust`                                                                 |
| `go.mod`            | `go`                                                                   |
| `*.py` (any)        | `python`                                                               |
| _(nothing matched)_ | `unknown`                                                              |

### Impact on other files

| File                                 | Impact                                                  |
| ------------------------------------ | ------------------------------------------------------- |
| `packages/core/src/context.ts`       | Full implementation replaces stubs                      |
| `packages/core/test/context.test.ts` | New file — full test suite                              |
| `packages/core/src/index.ts`         | No change — already uses `export * from './context.js'` |
| All other `src/` files               | No changes                                              |

---

## Steps

### Step 1 — Verify baseline

Before touching any files, confirm the starting state is clean.

```bash
cd packages/core && npm run typecheck && npm test
```

Expected output: zero TypeScript errors, all existing tests pass (parser suite from Epic 2 + validator suite from Epic 3).

If typecheck or tests fail, do not proceed until they pass.

---

### Step 2 — Implement `context.ts`

Replace the entire stub file with the full implementation.

**File:** `packages/core/src/context.ts`

**What to write:**

```typescript
// Context Engine and built-in ContextProvider implementations.
// Architecture §3.6
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ContextProvider } from './types.js';

const execFileAsync = promisify(execFile);

// ── ContextEngine ─────────────────────────────────────

/**
 * Maintains a registry of ContextProvider instances and resolves
 * all $ctx.* variables from them.
 *
 * - Providers run in parallel (Promise.all).
 * - A failing provider returns {} and never blocks others.
 * - Later-registered providers override earlier ones on key collision.
 */
export class ContextEngine {
  private providers: ContextProvider[] = [];

  /** Register a context provider. Later registrations override earlier ones on collision. */
  register(provider: ContextProvider): void {
    this.providers.push(provider);
  }

  /**
   * Resolve all context variables from all registered providers.
   * Returns a flat Record where later providers win on key collision.
   */
  async resolveAll(): Promise<Record<string, string>> {
    const results = await Promise.all(
      this.providers.map((p) => p.resolve().catch(() => ({}) as Record<string, string>)),
    );
    return Object.assign({}, ...results);
  }

  /**
   * Resolve a single variable by name (without $ctx. prefix).
   * Returns undefined if no provider resolves the key.
   */
  async resolve(name: string): Promise<string | undefined> {
    const all = await this.resolveAll();
    return all[name];
  }
}

// ── SystemContextProvider ─────────────────────────────

/**
 * Resolves system-level context variables: date, os, cwd.
 */
export class SystemContextProvider implements ContextProvider {
  readonly name = 'System';

  async resolve(): Promise<Record<string, string>> {
    return {
      cwd: process.cwd(),
      date: new Date().toISOString(),
      os: process.platform,
    };
  }
}

// ── GitContextProvider ────────────────────────────────

/**
 * Resolves git context variables: current_branch, git_user.
 * Returns {} for each variable that cannot be resolved (e.g., no git installed,
 * not inside a git repo, or user.name not configured).
 */
export class GitContextProvider implements ContextProvider {
  readonly name = 'Git';

  async resolve(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    const [branch, user] = await Promise.all([
      execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
        .then(({ stdout }) => stdout.trim())
        .catch(() => ''),
      execFileAsync('git', ['config', 'user.name'])
        .then(({ stdout }) => stdout.trim())
        .catch(() => ''),
    ]);

    if (branch) result['current_branch'] = branch;
    if (user) result['git_user'] = user;

    return result;
  }
}

// ── ProjectContextProvider ────────────────────────────

/**
 * Resolves project context variables: project_name, language.
 *
 * project_name: read from package.json "name", pom.xml <artifactId>,
 *               or fall back to the current directory name.
 *
 * language: detected from the presence of known project files.
 *           Detection order: package.json → pom.xml → Cargo.toml
 *                            → go.mod → *.py → "unknown"
 *           For package.json projects: "typescript" if any .ts files exist, else "javascript".
 */
export class ProjectContextProvider implements ContextProvider {
  readonly name = 'Project';

  async resolve(): Promise<Record<string, string>> {
    const cwd = process.cwd();
    return {
      language: detectLanguage(cwd),
      project_name: detectProjectName(cwd),
    };
  }
}

// ── Helpers ───────────────────────────────────────────

function detectProjectName(cwd: string): string {
  // 1. Try package.json
  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
      if (pkg.name && pkg.name.trim()) return pkg.name.trim();
    } catch {
      // fall through
    }
  }

  // 2. Try pom.xml (extract first <artifactId> value)
  const pomPath = join(cwd, 'pom.xml');
  if (existsSync(pomPath)) {
    try {
      const pom = readFileSync(pomPath, 'utf8');
      const match = /<artifactId>([^<]+)<\/artifactId>/.exec(pom);
      if (match) return match[1].trim();
    } catch {
      // fall through
    }
  }

  // 3. Fall back to directory name
  return cwd.split('/').filter(Boolean).pop() ?? cwd;
}

function detectLanguage(cwd: string): string {
  if (existsSync(join(cwd, 'package.json'))) {
    // Distinguish TypeScript from JavaScript by looking for .ts files
    return hasTsFiles(cwd) ? 'typescript' : 'javascript';
  }
  if (existsSync(join(cwd, 'pom.xml'))) return 'java';
  if (existsSync(join(cwd, 'Cargo.toml'))) return 'rust';
  if (existsSync(join(cwd, 'go.mod'))) return 'go';
  if (hasPyFiles(cwd)) return 'python';
  return 'unknown';
}

function hasTsFiles(dir: string): boolean {
  try {
    return readdirSync(dir).some((f) => f.endsWith('.ts'));
  } catch {
    return false;
  }
}

function hasPyFiles(dir: string): boolean {
  try {
    return readdirSync(dir).some((f) => f.endsWith('.py'));
  } catch {
    return false;
  }
}
```

**Validation:**

```bash
cd packages/core && npm run typecheck
```

Expected: zero errors.

---

### Step 3 — Write `context.test.ts`

Create a new file with a complete test suite.

**File:** `packages/core/test/context.test.ts`

**Coverage requirements:**

| Area                       | Tests required                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ContextEngine.register`   | Registering a provider is reflected in `resolveAll()`                                                             |
| `ContextEngine.resolveAll` | Empty engine returns `{}`; single provider; multiple providers; key collision (later wins)                        |
| `ContextEngine.resolve`    | Existing key returns value; missing key returns `undefined`                                                       |
| Provider failure isolation | A provider that throws does not block others; result is `{}` for that provider                                    |
| `SystemContextProvider`    | Returns `date` (ISO 8601 format), `os` (non-empty string), `cwd` (non-empty string)                               |
| `GitContextProvider`       | Resolves in a real git repo (this repo); result contains `current_branch` and/or `git_user` (may be absent in CI) |
| `GitContextProvider`       | Never throws even when `cwd` is not a git repo (use a temp dir or mock)                                           |
| `ProjectContextProvider`   | Resolves in a Node project (this repo); `project_name` is non-empty, `language` is non-empty                      |
| `ProjectContextProvider`   | `project_name` falls back to directory name when no `package.json` present                                        |
| `ProjectContextProvider`   | `language` returns `'unknown'` for a directory with no known project files                                        |

**What to write:**

```typescript
import { execFile } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ContextEngine,
  GitContextProvider,
  ProjectContextProvider,
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
  const dir = join(tmpdir(), `stencil-ctx-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ── ContextEngine ─────────────────────────────────────

describe('ContextEngine — resolveAll', () => {
  it('returns {} when no providers are registered', async () => {
    const engine = new ContextEngine();
    expect(await engine.resolveAll()).toEqual({});
  });

  it('returns variables from a single provider', async () => {
    const engine = new ContextEngine();
    engine.register(makeProvider('A', { foo: 'bar' }));
    expect(await engine.resolveAll()).toEqual({ foo: 'bar' });
  });

  it('merges variables from multiple providers', async () => {
    const engine = new ContextEngine();
    engine.register(makeProvider('A', { a: '1' }));
    engine.register(makeProvider('B', { b: '2' }));
    expect(await engine.resolveAll()).toEqual({ a: '1', b: '2' });
  });

  it('later provider wins on key collision', async () => {
    const engine = new ContextEngine();
    engine.register(makeProvider('First', { key: 'first' }));
    engine.register(makeProvider('Second', { key: 'second' }));
    const result = await engine.resolveAll();
    expect(result['key']).toBe('second');
  });

  it('isolates a throwing provider — others still resolve', async () => {
    const engine = new ContextEngine();
    engine.register({
      name: 'Broken',
      resolve: () => Promise.reject(new Error('boom')),
    });
    engine.register(makeProvider('Good', { ok: 'yes' }));
    const result = await engine.resolveAll();
    expect(result['ok']).toBe('yes');
    expect(result['broken']).toBeUndefined();
  });
});

describe('ContextEngine — resolve', () => {
  it('returns the value for an existing key', async () => {
    const engine = new ContextEngine();
    engine.register(makeProvider('A', { name: 'stencil' }));
    expect(await engine.resolve('name')).toBe('stencil');
  });

  it('returns undefined for a missing key', async () => {
    const engine = new ContextEngine();
    expect(await engine.resolve('nonexistent')).toBeUndefined();
  });
});

// ── SystemContextProvider ─────────────────────────────

describe('SystemContextProvider', () => {
  it('resolves date in ISO 8601 format', async () => {
    const provider = new SystemContextProvider();
    const result = await provider.resolve();
    expect(result['date']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('resolves os as a non-empty string', async () => {
    const provider = new SystemContextProvider();
    const result = await provider.resolve();
    expect(typeof result['os']).toBe('string');
    expect(result['os']!.length).toBeGreaterThan(0);
  });

  it('resolves cwd as a non-empty string', async () => {
    const provider = new SystemContextProvider();
    const result = await provider.resolve();
    expect(typeof result['cwd']).toBe('string');
    expect(result['cwd']!.length).toBeGreaterThan(0);
  });
});

// ── GitContextProvider ────────────────────────────────

describe('GitContextProvider — real git repo', () => {
  it('resolves without throwing in a valid git repo', async () => {
    const provider = new GitContextProvider();
    await expect(provider.resolve()).resolves.toBeDefined();
  });

  it('current_branch is a non-empty string when inside a git repo', async () => {
    // Skip gracefully if git is not available
    const isGitRepo = await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'])
      .then(() => true)
      .catch(() => false);
    if (!isGitRepo) return;

    const provider = new GitContextProvider();
    const result = await provider.resolve();
    if ('current_branch' in result) {
      expect(result['current_branch']!.length).toBeGreaterThan(0);
    }
  });
});

describe('GitContextProvider — non-git directory', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = makeTempDir();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns {} or partial result and does not throw outside a git repo', async () => {
    const provider = new GitContextProvider();
    const result = await provider.resolve();
    // Should not throw; result is {} or partial
    expect(typeof result).toBe('object');
    expect('current_branch' in result).toBe(false);
  });
});

// ── ProjectContextProvider ────────────────────────────

describe('ProjectContextProvider — this repo (Node/TypeScript project)', () => {
  it('resolves without throwing', async () => {
    const provider = new ProjectContextProvider();
    await expect(provider.resolve()).resolves.toBeDefined();
  });

  it('returns a non-empty project_name', async () => {
    const provider = new ProjectContextProvider();
    const result = await provider.resolve();
    expect(typeof result['project_name']).toBe('string');
    expect(result['project_name']!.length).toBeGreaterThan(0);
  });

  it('returns a non-empty language', async () => {
    const provider = new ProjectContextProvider();
    const result = await provider.resolve();
    expect(typeof result['language']).toBe('string');
    expect(result['language']!.length).toBeGreaterThan(0);
  });
});

describe('ProjectContextProvider — temp directory scenarios', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = makeTempDir();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('falls back to directory name when no project files are present', async () => {
    const provider = new ProjectContextProvider();
    const result = await provider.resolve();
    const dirName = tempDir.split('/').filter(Boolean).pop()!;
    expect(result['project_name']).toBe(dirName);
  });

  it("returns 'unknown' language when no known project files are present", async () => {
    const provider = new ProjectContextProvider();
    const result = await provider.resolve();
    expect(result['language']).toBe('unknown');
  });

  it('reads project_name from package.json name field', async () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'my-test-project' }));
    const provider = new ProjectContextProvider();
    const result = await provider.resolve();
    expect(result['project_name']).toBe('my-test-project');
  });

  it("returns 'javascript' for a package.json project with no .ts files", async () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'js-proj' }));
    const provider = new ProjectContextProvider();
    const result = await provider.resolve();
    expect(result['language']).toBe('javascript');
  });

  it("returns 'typescript' for a package.json project with .ts files", async () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'ts-proj' }));
    writeFileSync(join(tempDir, 'index.ts'), '');
    const provider = new ProjectContextProvider();
    const result = await provider.resolve();
    expect(result['language']).toBe('typescript');
  });

  it("returns 'java' for a project with pom.xml", async () => {
    writeFileSync(
      join(tempDir, 'pom.xml'),
      '<project><artifactId>my-service</artifactId></project>',
    );
    const provider = new ProjectContextProvider();
    const result = await provider.resolve();
    expect(result['language']).toBe('java');
    expect(result['project_name']).toBe('my-service');
  });

  it("returns 'rust' for a project with Cargo.toml", async () => {
    writeFileSync(join(tempDir, 'Cargo.toml'), '[package]\nname = "my-crate"\n');
    const provider = new ProjectContextProvider();
    const result = await provider.resolve();
    expect(result['language']).toBe('rust');
  });

  it("returns 'go' for a project with go.mod", async () => {
    writeFileSync(join(tempDir, 'go.mod'), 'module example.com/myapp\n');
    const provider = new ProjectContextProvider();
    const result = await provider.resolve();
    expect(result['language']).toBe('go');
  });

  it("returns 'python' for a project with .py files", async () => {
    writeFileSync(join(tempDir, 'main.py'), '');
    const provider = new ProjectContextProvider();
    const result = await provider.resolve();
    expect(result['language']).toBe('python');
  });
});
```

**Validation:**

```bash
cd packages/core && npm run typecheck
```

Expected: zero errors.

---

### Step 4 — Run the full test suite

```bash
cd packages/core && npm test
```

**Expected outcome:**

- All previously passing tests (parser, validator) still pass.
- All new `context.test.ts` tests pass.
- The git-related tests that depend on git availability skip or pass gracefully — they must never fail due to environment differences.

**If tests fail:**

| Symptom                                                   | Likely cause                                                                         | Fix                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `execFile` type error                                     | Missing `@types/node` or wrong import style                                          | Confirm `node:child_process` import; check tsconfig targets       |
| `current_branch` test fails in CI / detached HEAD         | `git rev-parse --abbrev-ref HEAD` returns `HEAD`                                     | Accept `HEAD` as a valid result, or guard the assertion           |
| `project_name` from this repo doesn't match expected      | `package.json` at cwd may have a scoped name                                         | Assert non-empty string rather than exact value                   |
| `language` for this repo is `javascript` not `typescript` | Tests run from `packages/core/` which has `.ts` files but `process.cwd()` may differ | Run from the right directory or assert `language` is in known set |

---

### Step 5 — Verify typecheck and final state

```bash
cd packages/core && npm run typecheck && npm test
```

Expected: zero TypeScript errors, all tests pass.

This is the exit criterion for Epic 4.

---

## Exit Criteria Checklist

- [ ] `ContextEngine.register()` registers providers
- [ ] `ContextEngine.resolveAll()` runs providers in parallel and merges results
- [ ] `ContextEngine.resolveAll()` returns `{}` when no providers registered
- [ ] `ContextEngine.resolveAll()` applies later-provider-wins collision rule
- [ ] `ContextEngine.resolve(name)` returns a single value or `undefined`
- [ ] A provider that throws does not block other providers
- [ ] `SystemContextProvider` returns `date` (ISO 8601), `os`, `cwd`
- [ ] `GitContextProvider` returns `current_branch` and `git_user` when git is available
- [ ] `GitContextProvider` returns `{}` (no throw) when git is unavailable or not in a repo
- [ ] `ProjectContextProvider` returns `project_name` from `package.json`, `pom.xml`, or dir name
- [ ] `ProjectContextProvider` returns `language` from known project files or `'unknown'`
- [ ] `npm run typecheck` exits with zero errors
- [ ] `npm test` passes — all tests green, no regressions in parser/validator suites
