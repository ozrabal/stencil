// Context Engine and built-in ContextProvider implementations.
// Architecture §3.6
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';

import type { ContextProvider } from './types.js';

const execFileAsync = promisify(execFile);
const IGNORED_SCAN_DIRS = new Set(['.git', 'dist', 'node_modules']);

// ── ContextEngine ─────────────────────────────────────

/**
 * Maintains a registry of ContextProvider instances and resolves all $ctx.* variables from them.
 *
 * - Providers run in parallel.
 * - A failing provider returns {} and never blocks others.
 * - Later-registered providers override earlier ones on key collision.
 */
export class ContextEngine {
  private readonly providers: ContextProvider[] = [];

  /** Register a context provider. Later registrations override earlier ones on collision. */
  register(provider: ContextProvider): void {
    this.providers.push(provider);
  }

  /**
   * Resolve all context variables from all registered providers.
   * Returns a flat record where later providers win on key collision.
   */
  async resolveAll(): Promise<Record<string, string>> {
    const results = await Promise.all(
      this.providers.map((provider) => provider.resolve().catch(() => ({}))),
    );

    return Object.assign({}, ...results) as Record<string, string>;
  }

  /**
   * Resolve a single variable by name, without the $ctx. prefix.
   * Returns undefined if no provider resolves the key.
   */
  async resolve(name: string): Promise<string | undefined> {
    const context = await this.resolveAll();
    return context[name];
  }
}

// ── SystemContextProvider ─────────────────────────────

/** Resolves system-level context variables: date, os, cwd. */
export class SystemContextProvider implements ContextProvider {
  readonly name = 'System';

  resolve(): Promise<Record<string, string>> {
    return Promise.resolve({
      cwd: process.cwd(),
      date: new Date().toISOString(),
      os: process.platform,
    });
  }
}

// ── GitContextProvider ────────────────────────────────

/**
 * Resolves git context variables: current_branch, git_user.
 * Missing git, non-repository directories, and unset config values are omitted.
 */
export class GitContextProvider implements ContextProvider {
  readonly name = 'Git';

  async resolve(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    const [branch, user] = await Promise.all([
      execGit(['rev-parse', '--abbrev-ref', 'HEAD']),
      execGit(['config', 'user.name']),
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
 * project_name: package.json name, pom.xml artifactId, or current directory name.
 * language: package.json -> pom.xml -> Cargo.toml -> go.mod -> *.py -> unknown.
 */
export class ProjectContextProvider implements ContextProvider {
  readonly name = 'Project';

  resolve(): Promise<Record<string, string>> {
    const cwd = process.cwd();

    return Promise.resolve({
      language: detectLanguage(cwd),
      project_name: detectProjectName(cwd),
    });
  }
}

// ── Helpers ───────────────────────────────────────────

async function execGit(args: string[]): Promise<string> {
  return execFileAsync('git', args)
    .then(({ stdout }) => stdout.trim())
    .catch(() => '');
}

function detectProjectName(cwd: string): string {
  const packageName = readPackageName(cwd);
  if (packageName) return packageName;

  const artifactId = readPomArtifactId(cwd);
  if (artifactId) return artifactId;

  return basename(cwd) || cwd;
}

function detectLanguage(cwd: string): string {
  if (existsSync(join(cwd, 'package.json'))) {
    return hasFileWithExtension(cwd, '.ts') ? 'typescript' : 'javascript';
  }

  if (existsSync(join(cwd, 'pom.xml'))) return 'java';
  if (existsSync(join(cwd, 'Cargo.toml'))) return 'rust';
  if (existsSync(join(cwd, 'go.mod'))) return 'go';
  if (hasFileWithExtension(cwd, '.py')) return 'python';

  return 'unknown';
}

function readPackageName(cwd: string): string | undefined {
  const packagePath = join(cwd, 'package.json');
  if (!existsSync(packagePath)) return undefined;

  try {
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as { name?: unknown };
    return typeof packageJson.name === 'string' && packageJson.name.trim()
      ? packageJson.name.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

function readPomArtifactId(cwd: string): string | undefined {
  const pomPath = join(cwd, 'pom.xml');
  if (!existsSync(pomPath)) return undefined;

  try {
    const pom = readFileSync(pomPath, 'utf8');
    const match = /<artifactId>([^<]+)<\/artifactId>/.exec(pom);
    return match?.[1]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function hasFileWithExtension(dir: string, extension: string): boolean {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(extension)) return true;
      if (
        entry.isDirectory() &&
        !IGNORED_SCAN_DIRS.has(entry.name) &&
        hasFileWithExtension(join(dir, entry.name), extension)
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}
