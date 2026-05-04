import type { ResolvedWorkspace } from '../types.js';

import { Stencil } from '../core/index.js';
import { VSCodeContextProvider } from '../providers/contextResolver.js';

const stencilCache = new Map<string, Stencil>();

export function getStencil(workspace: ResolvedWorkspace): Stencil {
  const cachedStencil = stencilCache.get(workspace.rootPath);
  if (cachedStencil) {
    return cachedStencil;
  }

  const stencil = new Stencil({
    contextProviders: [new VSCodeContextProvider()],
    projectDir: workspace.rootPath,
  });

  stencilCache.set(workspace.rootPath, stencil);
  return stencil;
}

export function resetStencilCache(): void {
  stencilCache.clear();
}
