import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('createTemplateWizard helpers', () => {
  beforeEach(() => {
    vi.resetModules();

    vi.doMock('vscode', () => ({
      QuickPickItemKind: {
        Separator: -1,
      },
    }));
  });

  it('normalizes and validates template names for prompt UX', async () => {
    const { normalizeTemplateName, validateTemplateNameInput } =
      await import('../../../src/services/createTemplateWizard.js');

    expect(normalizeTemplateName('  my-template  ')).toBe('my-template');
    expect(validateTemplateNameInput('')).toBe('Template name is required.');
    expect(validateTemplateNameInput('BadName')).toBe(
      'Template name must be kebab-case, like "my-template".',
    );
    expect(validateTemplateNameInput('good-template')).toBeUndefined();
  });

  it('normalizes and validates descriptions', async () => {
    const { normalizeTemplateDescription, validateTemplateDescriptionInput } =
      await import('../../../src/services/createTemplateWizard.js');

    expect(normalizeTemplateDescription('  Helpful template  ')).toBe('Helpful template');
    expect(validateTemplateDescriptionInput('   ')).toBe('Template description is required.');
    expect(validateTemplateDescriptionInput('A useful template')).toBeUndefined();
  });

  it('parses comma-separated tags into a deduplicated lowercase list', async () => {
    const { parseTemplateTags } = await import('../../../src/services/createTemplateWizard.js');

    expect(parseTemplateTags(' backend, review,Backend, , docs  ,review ')).toEqual([
      'backend',
      'review',
      'docs',
    ]);
  });

  it('builds collection items with uncategorized first and a default option when needed', async () => {
    const { buildCreateTemplateCollectionItems } =
      await import('../../../src/services/createTemplateWizard.js');

    expect(
      buildCreateTemplateCollectionItems({
        collections: ['backend', 'review'],
        defaultCollection: 'docs',
      }),
    ).toEqual([
      {
        choice: { kind: 'uncategorized' },
        description: 'Save under .stencil/templates/',
        detail: 'Creates a root template outside any collection.',
        label: 'Uncategorized',
      },
      {
        choice: { collectionName: 'docs', kind: 'default' },
        description: 'docs',
        detail: 'Uses the workspace default collection from .stencil/config.yaml.',
        label: 'Workspace Default',
      },
      {
        choice: { collectionName: 'backend', kind: 'collection' },
        description: 'Collection',
        detail: 'Save under .stencil/collections/backend/.',
        label: 'backend',
      },
      {
        choice: { collectionName: 'review', kind: 'collection' },
        description: 'Collection',
        detail: 'Save under .stencil/collections/review/.',
        label: 'review',
      },
    ]);
  });

  it('skips the default option when it is already covered by an existing collection', async () => {
    const { buildCreateTemplateCollectionItems } =
      await import('../../../src/services/createTemplateWizard.js');

    expect(
      buildCreateTemplateCollectionItems({
        collections: ['backend'],
        defaultCollection: 'backend',
      }),
    ).toEqual([
      {
        choice: { kind: 'uncategorized' },
        description: 'Save under .stencil/templates/',
        detail: 'Creates a root template outside any collection.',
        label: 'Uncategorized',
      },
      {
        choice: { collectionName: 'backend', kind: 'collection' },
        description: 'Collection',
        detail: 'Save under .stencil/collections/backend/.',
        label: 'backend',
      },
    ]);
  });

  it('builds a scaffold body from the optional seed and maps collection choice values', async () => {
    const { buildCreateTemplateBodyScaffold, toCreateTemplateCollectionValue } =
      await import('../../../src/services/createTemplateWizard.js');

    expect(buildCreateTemplateBodyScaffold('  First line  ')).toBe('First line');
    expect(buildCreateTemplateBodyScaffold('   ')).toBe('Write the prompt body here.');
    expect(toCreateTemplateCollectionValue({ kind: 'uncategorized' })).toBeNull();
    expect(toCreateTemplateCollectionValue({ collectionName: 'backend', kind: 'collection' })).toBe(
      'backend',
    );
    expect(
      toCreateTemplateCollectionValue({ collectionName: 'docs', kind: 'default' }),
    ).toBeUndefined();
  });
});
