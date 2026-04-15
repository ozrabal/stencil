import { describe, expect, it } from 'vitest';
import { resolveTemplate } from '../src/resolver.js';
import type { Template } from '../src/types.js';

describe('resolveTemplate', () => {
  it('should return a RenderResult', async () => {
    const template: Template = {
      body: 'Hello world',
      filePath: '/fake/path.md',
      frontmatter: { name: 'test' },
    };
    const result = await resolveTemplate(template, []);
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('unresolvedPlaceholders');
  });
});
