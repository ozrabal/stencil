import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveGlobalStencilDir } from '../src/paths.js';

describe('resolveGlobalStencilDir()', () => {
  it('returns the default ~/.stencil path when globalDir is omitted', () => {
    expect(resolveGlobalStencilDir(undefined, '/tmp/home')).toBe(
      path.join('/tmp/home', '.stencil'),
    );
  });

  it('returns the explicit globalDir unchanged when provided', () => {
    expect(resolveGlobalStencilDir('/custom/stencil', '/tmp/home')).toBe('/custom/stencil');
  });

  it('returns undefined when globalDir is null', () => {
    expect(resolveGlobalStencilDir(null, '/tmp/home')).toBeUndefined();
  });
});
