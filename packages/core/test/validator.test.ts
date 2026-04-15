import { describe, expect, it } from 'vitest';
import { validateTemplate } from '../src/validator.js';
import type { Template } from '../src/types.js';

describe('validateTemplate', () => {
  it('should return valid for a basic template', () => {
    const template: Template = {
      body: 'Hello {{name}}',
      filePath: '/fake/path.md',
      frontmatter: { name: 'test' },
    };
    const result = validateTemplate(template);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
