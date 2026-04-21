import { describe, expect, it } from 'vitest';
import { resolveTemplate } from '../src/resolver.js';
import type { PlaceholderDefinition, ResolutionInput, Template } from '../src/types.js';

function makeTemplate(body: string, placeholders: PlaceholderDefinition[] = []): Template {
  return {
    body,
    filePath: '/fake/template.md',
    frontmatter: {
      description: 'Test template',
      name: 'test-template',
      placeholders,
      version: 1,
    },
    source: 'project',
  };
}

function makePlaceholder(
  name: string,
  overrides: Partial<Omit<PlaceholderDefinition, 'name'>> = {},
): PlaceholderDefinition {
  return {
    description: `${name} placeholder`,
    name,
    required: true,
    ...overrides,
  };
}

function makeInput(overrides: Partial<ResolutionInput> = {}): ResolutionInput {
  return {
    context: {},
    explicit: {},
    ...overrides,
  };
}

describe('resolveTemplate', () => {
  it('keeps body unchanged when there are no placeholders or tokens', () => {
    const result = resolveTemplate(makeTemplate('Hello world'), makeInput());

    expect(result).toEqual({
      placeholders: [],
      resolvedBody: 'Hello world',
      unresolvedCount: 0,
    });
  });

  it('resolves declared placeholders from explicit input', () => {
    const result = resolveTemplate(
      makeTemplate('Hello {{name}}', [makePlaceholder('name')]),
      makeInput({ explicit: { name: 'Ada' } }),
    );

    expect(result.resolvedBody).toBe('Hello Ada');
    expect(result.placeholders).toEqual([{ name: 'name', source: 'explicit', value: 'Ada' }]);
    expect(result.unresolvedCount).toBe(0);
  });

  it('resolves declared placeholders from context input', () => {
    const result = resolveTemplate(
      makeTemplate('Project: {{project_name}}', [makePlaceholder('project_name')]),
      makeInput({ context: { project_name: 'stencil' } }),
    );

    expect(result.resolvedBody).toBe('Project: stencil');
    expect(result.placeholders).toEqual([
      { name: 'project_name', source: 'context', value: 'stencil' },
    ]);
    expect(result.unresolvedCount).toBe(0);
  });

  it('resolves declared placeholders from defaults', () => {
    const result = resolveTemplate(
      makeTemplate('Mode: {{mode}}', [makePlaceholder('mode', { default: 'draft' })]),
      makeInput(),
    );

    expect(result.resolvedBody).toBe('Mode: draft');
    expect(result.placeholders).toEqual([{ name: 'mode', source: 'default', value: 'draft' }]);
    expect(result.unresolvedCount).toBe(0);
  });

  it('marks declared placeholders unresolved and leaves their body tokens unchanged', () => {
    const result = resolveTemplate(
      makeTemplate('Owner: {{owner}}', [makePlaceholder('owner')]),
      makeInput(),
    );

    expect(result.resolvedBody).toBe('Owner: {{owner}}');
    expect(result.placeholders).toEqual([{ name: 'owner', source: 'unresolved', value: '' }]);
    expect(result.unresolvedCount).toBe(1);
  });

  it('prefers explicit input over context input', () => {
    const result = resolveTemplate(
      makeTemplate('{{name}}', [makePlaceholder('name')]),
      makeInput({ context: { name: 'Context' }, explicit: { name: 'Explicit' } }),
    );

    expect(result.resolvedBody).toBe('Explicit');
    expect(result.placeholders).toEqual([{ name: 'name', source: 'explicit', value: 'Explicit' }]);
  });

  it('prefers explicit input over defaults', () => {
    const result = resolveTemplate(
      makeTemplate('{{name}}', [makePlaceholder('name', { default: 'Default' })]),
      makeInput({ explicit: { name: 'Explicit' } }),
    );

    expect(result.resolvedBody).toBe('Explicit');
    expect(result.placeholders).toEqual([{ name: 'name', source: 'explicit', value: 'Explicit' }]);
  });

  it('prefers context input over defaults', () => {
    const result = resolveTemplate(
      makeTemplate('{{name}}', [makePlaceholder('name', { default: 'Default' })]),
      makeInput({ context: { name: 'Context' } }),
    );

    expect(result.resolvedBody).toBe('Context');
    expect(result.placeholders).toEqual([{ name: 'name', source: 'context', value: 'Context' }]);
  });

  it('replaces $ctx tokens from context input without declaring placeholders', () => {
    const result = resolveTemplate(
      makeTemplate('Today is {{$ctx.date}}'),
      makeInput({ context: { date: '2026-04-20' } }),
    );

    expect(result.resolvedBody).toBe('Today is 2026-04-20');
    expect(result.placeholders).toEqual([]);
    expect(result.unresolvedCount).toBe(0);
  });

  it('leaves missing $ctx tokens unchanged', () => {
    const result = resolveTemplate(makeTemplate('Branch: {{$ctx.branch}}'), makeInput());

    expect(result.resolvedBody).toBe('Branch: {{$ctx.branch}}');
    expect(result.placeholders).toEqual([]);
    expect(result.unresolvedCount).toBe(0);
  });

  it('leaves unknown tokens unchanged', () => {
    const result = resolveTemplate(makeTemplate('Hello {{unknown}}'), makeInput());

    expect(result.resolvedBody).toBe('Hello {{unknown}}');
    expect(result.placeholders).toEqual([]);
    expect(result.unresolvedCount).toBe(0);
  });

  it('replaces every occurrence of the same placeholder', () => {
    const result = resolveTemplate(
      makeTemplate('{{name}} reviewed {{name}}', [makePlaceholder('name')]),
      makeInput({ explicit: { name: 'Ada' } }),
    );

    expect(result.resolvedBody).toBe('Ada reviewed Ada');
    expect(result.placeholders).toEqual([{ name: 'name', source: 'explicit', value: 'Ada' }]);
  });

  it('replaces multiple placeholders independently', () => {
    const result = resolveTemplate(
      makeTemplate('{{greeting}}, {{name}}', [
        makePlaceholder('greeting'),
        makePlaceholder('name'),
      ]),
      makeInput({ explicit: { greeting: 'Hello', name: 'Ada' } }),
    );

    expect(result.resolvedBody).toBe('Hello, Ada');
    expect(result.placeholders).toEqual([
      { name: 'greeting', source: 'explicit', value: 'Hello' },
      { name: 'name', source: 'explicit', value: 'Ada' },
    ]);
  });

  it('supports partial resolution with mixed resolved and unresolved placeholders', () => {
    const result = resolveTemplate(
      makeTemplate('{{one}} {{two}} {{three}}', [
        makePlaceholder('one'),
        makePlaceholder('two'),
        makePlaceholder('three', { default: '3' }),
      ]),
      makeInput({ explicit: { one: '1' } }),
    );

    expect(result.resolvedBody).toBe('1 {{two}} 3');
    expect(result.placeholders).toEqual([
      { name: 'one', source: 'explicit', value: '1' },
      { name: 'two', source: 'unresolved', value: '' },
      { name: 'three', source: 'default', value: '3' },
    ]);
    expect(result.unresolvedCount).toBe(1);
  });

  it('does not create resolved placeholder entries for undeclared body tokens', () => {
    const result = resolveTemplate(
      makeTemplate('{{declared}} {{undeclared}}', [makePlaceholder('declared')]),
      makeInput({ explicit: { declared: 'value' } }),
    );

    expect(result.resolvedBody).toBe('value {{undeclared}}');
    expect(result.placeholders).toEqual([{ name: 'declared', source: 'explicit', value: 'value' }]);
    expect(result.unresolvedCount).toBe(0);
  });

  it('trims whitespace inside body tokens before matching', () => {
    const result = resolveTemplate(
      makeTemplate('Hello {{ name }}', [makePlaceholder('name')]),
      makeInput({ explicit: { name: 'Ada' } }),
    );

    expect(result.resolvedBody).toBe('Hello Ada');
    expect(result.placeholders).toEqual([{ name: 'name', source: 'explicit', value: 'Ada' }]);
  });
});
