import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolutionResult, Template } from '../../../src/core/index.js';

describe('placeholderInput', () => {
  const showInputBox = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    showInputBox.mockReset();

    vi.doMock('vscode', () => ({
      window: {
        showInputBox,
      },
    }));
  });

  it('builds a queue only for unresolved placeholders in frontmatter order', async () => {
    const { buildPlaceholderPromptPlan } =
      await import('../../../src/services/placeholderInput.js');
    const template = createTemplate({
      placeholders: [
        { description: 'First', name: 'first_name', required: true },
        { description: 'Second', name: 'second_name', required: false },
        { description: 'Third', name: 'third_name', required: true },
      ],
    });
    const initialResolution = createResolutionResult([
      { name: 'third_name', source: 'unresolved', value: '' },
      { name: 'first_name', source: 'default', value: 'A' },
      { name: 'second_name', source: 'unresolved', value: '' },
    ]);

    const plan = buildPlaceholderPromptPlan(template, initialResolution);

    expect(plan.queue).toEqual([
      { description: 'Second', name: 'second_name', required: false },
      { description: 'Third', name: 'third_name', required: true },
    ]);
  });

  it('throws when unresolved placeholders are missing frontmatter metadata', async () => {
    const { buildPlaceholderPromptPlan } =
      await import('../../../src/services/placeholderInput.js');
    const template = createTemplate({ placeholders: [] });
    const initialResolution = createResolutionResult([
      { name: 'missing_name', source: 'unresolved', value: '' },
    ]);

    expect(() => buildPlaceholderPromptPlan(template, initialResolution)).toThrow(
      'Template "alpha" has unresolved placeholders missing frontmatter metadata: missing_name.',
    );
  });

  it('collects multiple placeholders sequentially', async () => {
    const { collectPlaceholderInputs } = await import('../../../src/services/placeholderInput.js');
    showInputBox.mockResolvedValueOnce('Stencil').mockResolvedValueOnce('Docs');

    const result = await collectPlaceholderInputs([
      { description: 'Project name', name: 'project_name', required: true },
      { description: 'Section', name: 'section_name', required: true },
    ]);

    expect(result).toEqual({
      kind: 'completed',
      values: {
        project_name: 'Stencil',
        section_name: 'Docs',
      },
    });
    expect(showInputBox).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        placeHolder: 'project_name',
        prompt: 'Project name',
        title: 'Stencil: Run Template',
      }),
    );
    expect(showInputBox).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        placeHolder: 'section_name',
        prompt: 'Section',
        title: 'Stencil: Run Template',
      }),
    );
  });

  it('retries required placeholders after an empty submission and preserves the attempted value', async () => {
    const { collectPlaceholderInputs } = await import('../../../src/services/placeholderInput.js');
    let firstOptions: undefined | { validateInput?(value: string): string | undefined };
    let secondOptions:
      | undefined
      | { validateInput?(value: string): string | undefined; value?: string };

    showInputBox
      .mockImplementationOnce(async (options) => {
        firstOptions = options;
        return '';
      })
      .mockImplementationOnce(async (options) => {
        secondOptions = options;
        return 'Stencil';
      });

    const result = await collectPlaceholderInputs([
      { description: 'Project name', name: 'project_name', required: true },
    ]);

    expect(firstOptions?.validateInput?.('')).toBe('A value is required.');
    expect(secondOptions?.value).toBe('');
    expect(result).toEqual({
      kind: 'completed',
      values: {
        project_name: 'Stencil',
      },
    });
  });

  it('accepts an empty string for optional unresolved placeholders', async () => {
    const { collectPlaceholderInputs } = await import('../../../src/services/placeholderInput.js');
    showInputBox.mockResolvedValueOnce('');

    const result = await collectPlaceholderInputs([
      { description: 'Optional note', name: 'note', required: false },
    ]);

    expect(result).toEqual({
      kind: 'completed',
      values: {
        note: '',
      },
    });
  });

  it('returns a cancellation result when the user cancels input', async () => {
    const { collectPlaceholderInputs } = await import('../../../src/services/placeholderInput.js');
    showInputBox.mockResolvedValueOnce(undefined);

    const result = await collectPlaceholderInputs([
      { description: 'Project name', name: 'project_name', required: true },
    ]);

    expect(result).toEqual({ kind: 'cancelled' });
  });

  function createTemplate(options: {
    placeholders: NonNullable<Template['frontmatter']['placeholders']>;
  }): Template {
    return {
      body: '# Prompt',
      filePath: '/workspace/.stencil/templates/alpha.md',
      frontmatter: {
        description: 'Alpha template',
        name: 'alpha',
        placeholders: options.placeholders,
        version: 1,
      },
      source: 'project',
    };
  }

  function createResolutionResult(
    placeholders: ResolutionResult['placeholders'],
  ): ResolutionResult {
    return {
      placeholders,
      resolvedBody: '# Prompt',
      unresolvedCount: placeholders.filter((placeholder) => placeholder.source === 'unresolved')
        .length,
    };
  }
});
