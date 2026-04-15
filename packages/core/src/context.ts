// ContextProvider interface and built-in resolver stubs.
import type { ContextProvider } from './types.js';

/**
 * Resolves placeholder values from environment variables.
 */
export class EnvContextProvider implements ContextProvider {
  resolve(key: string): Promise<string | undefined> {
    return Promise.resolve(process.env[key]);
  }
}

/**
 * Resolves placeholder values from git metadata (branch, commit, author, etc.).
 */
export class GitContextProvider implements ContextProvider {
  resolve(_key: string): Promise<string | undefined> {
    // TODO: implement git context resolution via child_process
    return Promise.resolve(undefined);
  }
}
