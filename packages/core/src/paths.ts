import os from 'node:os';
import path from 'node:path';

export function resolveGlobalStencilDir(
  explicitGlobalDir?: null | string,
  homeDir: string = os.homedir(),
): string | undefined {
  if (explicitGlobalDir === null) {
    return undefined;
  }

  if (explicitGlobalDir !== undefined) {
    return explicitGlobalDir;
  }

  return path.join(homeDir, '.stencil');
}
