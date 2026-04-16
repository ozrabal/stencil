import { describe, expect, it } from 'vitest';
import { resolveTemplate } from '../src/resolver.js';
import type { ResolutionInput, Template } from '../src/types.js';

describe('resolveTemplate', () => {
  it('should return a ResolutionResult with resolvedBody, placeholders, unresolvedCount', () => {
    const template: Template = {
      body: 'Hello world',
      filePath: '/fake/path.md',
      frontmatter: {
        description: 'A test template',
        name: 'test-template',
        version: 1,
      },
      source: 'project',
    };
    const input: ResolutionInput = { context: {}, explicit: {} };
    const result = resolveTemplate(template, input);
    expect(result).toHaveProperty('resolvedBody');
    expect(result).toHaveProperty('placeholders');
    expect(result).toHaveProperty('unresolvedCount');
  });
});
