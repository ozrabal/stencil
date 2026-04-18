import { describe, expect, it } from 'vitest';
import { validateFrontmatter, validateTemplate } from '../src/validator.js';
import type { Template } from '../src/types.js';

// ── Helpers ───────────────────────────────────────────

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    body: 'Hello {{entity_name}}',
    filePath: '/fake/path.md',
    frontmatter: {
      description: 'A test template',
      name: 'test-template',
      placeholders: [
        {
          description: 'The entity name',
          name: 'entity_name',
          required: true,
        },
      ],
      version: 1,
    },
    source: 'project',
    ...overrides,
  };
}

// ── validateTemplate — happy path ─────────────────────

describe('validateTemplate — happy path', () => {
  it('returns valid=true and empty issues for a correct template', () => {
    const result = validateTemplate(makeTemplate());
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('returns valid=true when there are only warnings', () => {
    // V9: placeholder declared but not used in body
    const template = makeTemplate({
      body: 'No placeholders here',
      frontmatter: {
        description: 'A test template',
        name: 'test-template',
        placeholders: [{ description: 'Entity name', name: 'entity_name', required: true }],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.severity === 'warning')).toBe(true);
    expect(result.issues.every((i) => i.severity !== 'error')).toBe(true);
  });

  it('returns valid=false when there is at least one error', () => {
    const template = makeTemplate({
      frontmatter: {
        description: '',
        name: 'test-template',
        version: 1,
      },
    });
    const result = validateTemplate(template);
    expect(result.valid).toBe(false);
  });
});

// ── V1: name present ──────────────────────────────────

describe('validateTemplate — V1: name present', () => {
  it('reports error when name is an empty string', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: 'desc', name: '', version: 1 } }),
    );
    const v1 = result.issues.find((i) => i.field === 'name' && i.severity === 'error');
    expect(v1).toBeDefined();
  });

  it('reports error when name is whitespace only', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: 'desc', name: '   ', version: 1 } }),
    );
    expect(result.issues.some((i) => i.field === 'name' && i.severity === 'error')).toBe(true);
  });
});

// ── V2: name is kebab-case ────────────────────────────

describe('validateTemplate — V2: name format is kebab-case', () => {
  it('accepts a valid kebab-case name', () => {
    const result = validateTemplate(
      makeTemplate({
        body: '',
        frontmatter: { description: 'desc', name: 'my-template', version: 1 },
      }),
    );
    expect(result.issues.some((i) => i.field === 'name')).toBe(false);
  });

  it('accepts a single-word lowercase name', () => {
    const result = validateTemplate(
      makeTemplate({
        body: '',
        frontmatter: { description: 'desc', name: 'template', version: 1 },
      }),
    );
    expect(result.issues.some((i) => i.field === 'name')).toBe(false);
  });

  it('reports error for PascalCase name', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: 'desc', name: 'MyTemplate', version: 1 } }),
    );
    const v2 = result.issues.find((i) => i.field === 'name' && i.severity === 'error');
    expect(v2).toBeDefined();
  });

  it('reports error for snake_case name', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: 'desc', name: 'my_template', version: 1 } }),
    );
    expect(result.issues.some((i) => i.field === 'name' && i.severity === 'error')).toBe(true);
  });

  it('reports error for name with trailing hyphen', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: 'desc', name: 'my-template-', version: 1 } }),
    );
    expect(result.issues.some((i) => i.field === 'name' && i.severity === 'error')).toBe(true);
  });

  it('reports error for name with uppercase characters', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: 'desc', name: 'My-Template', version: 1 } }),
    );
    expect(result.issues.some((i) => i.field === 'name' && i.severity === 'error')).toBe(true);
  });
});

// ── V3: description present ───────────────────────────

describe('validateTemplate — V3: description present', () => {
  it('reports error when description is an empty string', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: '', name: 'test', version: 1 } }),
    );
    const v3 = result.issues.find((i) => i.field === 'description' && i.severity === 'error');
    expect(v3).toBeDefined();
  });

  it('reports error when description is whitespace only', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: '  ', name: 'test', version: 1 } }),
    );
    expect(result.issues.some((i) => i.field === 'description' && i.severity === 'error')).toBe(
      true,
    );
  });
});

// ── V4: version is positive integer ──────────────────

describe('validateTemplate — V4: version is positive integer', () => {
  it('accepts version=1', () => {
    const result = validateTemplate(
      makeTemplate({ body: '', frontmatter: { description: 'desc', name: 'test', version: 1 } }),
    );
    expect(result.issues.some((i) => i.field === 'version')).toBe(false);
  });

  it('accepts version=42', () => {
    const result = validateTemplate(
      makeTemplate({ body: '', frontmatter: { description: 'desc', name: 'test', version: 42 } }),
    );
    expect(result.issues.some((i) => i.field === 'version')).toBe(false);
  });

  it('reports error when version=0', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: 'desc', name: 'test', version: 0 } }),
    );
    const v4 = result.issues.find((i) => i.field === 'version' && i.severity === 'error');
    expect(v4).toBeDefined();
  });

  it('reports error when version is negative', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: 'desc', name: 'test', version: -1 } }),
    );
    expect(result.issues.some((i) => i.field === 'version' && i.severity === 'error')).toBe(true);
  });

  it('reports error when version is a float', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: 'desc', name: 'test', version: 1.5 } }),
    );
    expect(result.issues.some((i) => i.field === 'version' && i.severity === 'error')).toBe(true);
  });
});

// ── V5: placeholder name is snake_case ───────────────

describe('validateTemplate — V5: placeholder name is snake_case', () => {
  it('accepts a valid snake_case placeholder name', () => {
    const result = validateTemplate(makeTemplate());
    expect(result.issues.some((i) => i.field?.includes('placeholders[0].name'))).toBe(false);
  });

  it('accepts a single-word lowercase placeholder name', () => {
    const template = makeTemplate({
      body: '{{name}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [{ description: 'Name', name: 'name', required: true }],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    expect(result.issues.some((i) => i.field?.includes('.name') && i.severity === 'error')).toBe(
      false,
    );
  });

  it('reports error for camelCase placeholder name', () => {
    const template = makeTemplate({
      body: '{{entityName}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [{ description: 'Entity name', name: 'entityName', required: true }],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    expect(
      result.issues.some(
        (i) => i.field?.includes('placeholders[0].name') && i.severity === 'error',
      ),
    ).toBe(true);
  });

  it('reports error for kebab-case placeholder name', () => {
    const template = makeTemplate({
      body: '{{entity-name}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [{ description: 'Entity name', name: 'entity-name', required: true }],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    expect(
      result.issues.some(
        (i) => i.field?.includes('placeholders[0].name') && i.severity === 'error',
      ),
    ).toBe(true);
  });
});

// ── V6: placeholder description present ──────────────

describe('validateTemplate — V6: placeholder description present', () => {
  it('reports error when placeholder description is empty', () => {
    const template = makeTemplate({
      body: '{{entity_name}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [{ description: '', name: 'entity_name', required: true }],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    expect(
      result.issues.some((i) => i.field?.includes('description') && i.severity === 'error'),
    ).toBe(true);
  });

  it('reports error when placeholder description is whitespace only', () => {
    const template = makeTemplate({
      body: '{{entity_name}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [{ description: '   ', name: 'entity_name', required: true }],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    expect(
      result.issues.some((i) => i.field?.includes('description') && i.severity === 'error'),
    ).toBe(true);
  });
});

// ── V7: no duplicate placeholder names ───────────────

describe('validateTemplate — V7: no duplicate placeholder names', () => {
  it('reports error when two placeholders have the same name', () => {
    const template = makeTemplate({
      body: '{{entity_name}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [
          { description: 'First', name: 'entity_name', required: true },
          { description: 'Second', name: 'entity_name', required: true },
        ],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    const v7 = result.issues.find((i) => i.message.includes('Duplicate') && i.severity === 'error');
    expect(v7).toBeDefined();
  });

  it('does not report error when placeholder names are unique', () => {
    const template = makeTemplate({
      body: '{{entity_name}} {{operations}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [
          { description: 'First', name: 'entity_name', required: true },
          { description: 'Second', name: 'operations', required: true },
        ],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    expect(result.issues.some((i) => i.message.includes('Duplicate'))).toBe(false);
  });
});

// ── V8: body references undeclared placeholder ────────

describe('validateTemplate — V8: undeclared placeholder in body', () => {
  it('reports warning when body uses {{token}} not in frontmatter', () => {
    const template = makeTemplate({
      body: 'Hello {{entity_name}} and {{undeclared_var}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [{ description: 'Entity name', name: 'entity_name', required: true }],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    const v8 = result.issues.find(
      (i) => i.message.includes('undeclared') && i.severity === 'warning',
    );
    expect(v8).toBeDefined();
    expect(v8?.message).toContain('undeclared_var');
  });

  it('does not report warning for $ctx.* tokens in body', () => {
    const template = makeTemplate({
      body: 'Project: {{$ctx.project_name}}, entity: {{entity_name}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [{ description: 'Entity name', name: 'entity_name', required: true }],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    expect(result.issues.some((i) => i.message.includes('$ctx.') && i.severity === 'warning')).toBe(
      false,
    );
  });

  it('reports warning for each individual undeclared token', () => {
    const template = makeTemplate({
      body: '{{a_var}} and {{b_var}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        version: 1,
      },
    });
    const result = validateTemplate(template);
    const undeclared = result.issues.filter(
      (i) => i.message.includes('undeclared') && i.severity === 'warning',
    );
    expect(undeclared).toHaveLength(2);
  });
});

// ── V9: declared placeholder not used in body ─────────

describe('validateTemplate — V9: declared placeholder not used in body', () => {
  it('reports warning when placeholder is declared but not in body', () => {
    const template = makeTemplate({
      body: 'No placeholders here',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [{ description: 'Entity name', name: 'entity_name', required: true }],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    const v9 = result.issues.find(
      (i) =>
        i.message.includes('entity_name') &&
        i.message.includes('not referenced') &&
        i.severity === 'warning',
    );
    expect(v9).toBeDefined();
  });

  it('does not report warning when all declared placeholders are used', () => {
    const result = validateTemplate(makeTemplate());
    expect(result.issues.some((i) => i.message.includes('not referenced'))).toBe(false);
  });
});

// ── V10: required placeholder with default ────────────

describe('validateTemplate — V10: required placeholder with default', () => {
  it('reports warning when required=true and default is set', () => {
    const template = makeTemplate({
      body: '{{entity_name}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [
          {
            default: 'Invoice',
            description: 'Entity name',
            name: 'entity_name',
            required: true,
          },
        ],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    const v10 = result.issues.find(
      (i) => i.field?.includes('placeholders[0]') && i.severity === 'warning',
    );
    expect(v10).toBeDefined();
  });

  it('does not report warning when required=false and default is set', () => {
    const template = makeTemplate({
      body: '{{entity_name}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [
          {
            default: 'Invoice',
            description: 'Entity name',
            name: 'entity_name',
            required: false,
          },
        ],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    expect(
      result.issues.some((i) => i.severity === 'warning' && i.message.includes('entity_name')),
    ).toBe(false);
  });

  it('does not report warning when required=true but no default', () => {
    const result = validateTemplate(makeTemplate());
    expect(
      result.issues.some(
        (i) => i.severity === 'warning' && i.message.includes('effectively optional'),
      ),
    ).toBe(false);
  });
});

// ── Multiple issues ───────────────────────────────────

describe('validateTemplate — multiple issues', () => {
  it('reports all applicable issues in a single call', () => {
    const template = makeTemplate({
      body: '{{entity_name}}',
      frontmatter: {
        description: '', // V3 error
        name: 'BadName', // V2 error
        placeholders: [
          { description: '', name: 'entityName', required: true }, // V5 + V6 errors
        ],
        version: 0, // V4 error
      },
    });
    const result = validateTemplate(template);
    const errors = result.issues.filter((i) => i.severity === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(4);
    expect(result.valid).toBe(false);
  });
});

// ── validateFrontmatter — happy path ──────────────────

describe('validateFrontmatter — happy path', () => {
  it('returns valid=true for a correct frontmatter object', () => {
    const raw = {
      description: 'A test template',
      name: 'my-template',
      version: 1,
    };
    const result = validateFrontmatter(raw);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('returns valid=true with placeholders that pass all rules', () => {
    const raw = {
      description: 'desc',
      name: 'my-template',
      placeholders: [{ description: 'The entity name', name: 'entity_name', required: true }],
      version: 1,
    };
    const result = validateFrontmatter(raw);
    expect(result.valid).toBe(true);
  });
});

// ── validateFrontmatter — invalid input ───────────────

describe('validateFrontmatter — invalid input types', () => {
  it('returns error for null input', () => {
    const result = validateFrontmatter(null);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('returns error for array input', () => {
    const result = validateFrontmatter(['item1', 'item2']);
    expect(result.valid).toBe(false);
  });

  it('returns error for string input', () => {
    const result = validateFrontmatter('just a string');
    expect(result.valid).toBe(false);
  });
});

// ── validateFrontmatter — V1–V4 ───────────────────────

describe('validateFrontmatter — V1: name present', () => {
  it('reports error when name is missing', () => {
    const result = validateFrontmatter({ description: 'desc', version: 1 });
    expect(result.issues.some((i) => i.field === 'name' && i.severity === 'error')).toBe(true);
    expect(result.valid).toBe(false);
  });
});

describe('validateFrontmatter — V2: name is kebab-case', () => {
  it('reports error for PascalCase name', () => {
    const result = validateFrontmatter({ description: 'desc', name: 'MyTemplate', version: 1 });
    expect(result.issues.some((i) => i.field === 'name' && i.severity === 'error')).toBe(true);
  });
});

describe('validateFrontmatter — V3: description present', () => {
  it('reports error when description is missing', () => {
    const result = validateFrontmatter({ name: 'my-template', version: 1 });
    expect(result.issues.some((i) => i.field === 'description' && i.severity === 'error')).toBe(
      true,
    );
  });
});

describe('validateFrontmatter — V4: version is positive integer', () => {
  it('reports error when version is 0', () => {
    const result = validateFrontmatter({ description: 'desc', name: 'my-template', version: 0 });
    expect(result.issues.some((i) => i.field === 'version' && i.severity === 'error')).toBe(true);
  });

  it('reports error when version is missing', () => {
    const result = validateFrontmatter({ description: 'desc', name: 'my-template' });
    expect(result.issues.some((i) => i.field === 'version' && i.severity === 'error')).toBe(true);
  });
});

// ── validateFrontmatter — V5–V7, V10 ─────────────────

describe('validateFrontmatter — V5–V7, V10: placeholder rules', () => {
  it('reports error for camelCase placeholder name (V5)', () => {
    const result = validateFrontmatter({
      description: 'desc',
      name: 'my-template',
      placeholders: [{ description: 'Entity', name: 'entityName', required: true }],
      version: 1,
    });
    expect(
      result.issues.some(
        (i) => i.field?.includes('placeholders[0].name') && i.severity === 'error',
      ),
    ).toBe(true);
  });

  it('reports error for missing placeholder description (V6)', () => {
    const result = validateFrontmatter({
      description: 'desc',
      name: 'my-template',
      placeholders: [{ description: '', name: 'entity_name', required: true }],
      version: 1,
    });
    expect(
      result.issues.some((i) => i.field?.includes('description') && i.severity === 'error'),
    ).toBe(true);
  });

  it('reports error for duplicate placeholder names (V7)', () => {
    const result = validateFrontmatter({
      description: 'desc',
      name: 'my-template',
      placeholders: [
        { description: 'First', name: 'entity_name', required: true },
        { description: 'Second', name: 'entity_name', required: true },
      ],
      version: 1,
    });
    expect(
      result.issues.some((i) => i.message.includes('Duplicate') && i.severity === 'error'),
    ).toBe(true);
  });

  it('reports warning for required placeholder with default (V10)', () => {
    const result = validateFrontmatter({
      description: 'desc',
      name: 'my-template',
      placeholders: [
        { default: 'Invoice', description: 'Entity name', name: 'entity_name', required: true },
      ],
      version: 1,
    });
    expect(result.issues.some((i) => i.severity === 'warning')).toBe(true);
    expect(result.valid).toBe(true); // warnings don't make it invalid
  });

  it('reports error when placeholder entry is not an object', () => {
    const result = validateFrontmatter({
      description: 'desc',
      name: 'my-template',
      placeholders: ['not-an-object'],
      version: 1,
    });
    expect(result.issues.some((i) => i.severity === 'error')).toBe(true);
  });
});
