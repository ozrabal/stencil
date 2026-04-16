import { describe, expect, it } from 'vitest';
import { validateTemplate } from '../src/validator.js';
import type { Template } from '../src/types.js';

describe('validateTemplate', () => {
  it('should return a ValidationResult with valid and issues fields', () => {
    const template: Template = {
      body: 'Hello {{entity_name}}',
      filePath: '/fake/path.md',
      frontmatter: {
        description: 'A test template',
        name: 'test-template',
        version: 1,
      },
      source: 'project',
    };
    const result = validateTemplate(template);
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('issues');
    expect(Array.isArray(result.issues)).toBe(true);
  });
});
