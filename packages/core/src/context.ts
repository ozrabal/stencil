// ContextProvider implementations (stubs — full logic in Epic 4).
import type { ContextProvider } from './types.js';

/**
 * Resolves system-level context variables: date, os, cwd.
 * Full implementation in Epic 4.
 */
export class SystemContextProvider implements ContextProvider {
  readonly name = 'System';

  resolve(): Promise<Record<string, string>> {
    // TODO: implement (Epic 4)
    return Promise.resolve({});
  }
}

/**
 * Resolves git context variables: current_branch, git_user.
 * Full implementation in Epic 4.
 */
export class GitContextProvider implements ContextProvider {
  readonly name = 'Git';

  resolve(): Promise<Record<string, string>> {
    // TODO: implement via child_process (Epic 4)
    return Promise.resolve({});
  }
}

/**
 * Resolves project context variables: project_name, language.
 * Full implementation in Epic 4.
 */
export class ProjectContextProvider implements ContextProvider {
  readonly name = 'Project';

  resolve(): Promise<Record<string, string>> {
    // TODO: implement (Epic 4)
    return Promise.resolve({});
  }
}
