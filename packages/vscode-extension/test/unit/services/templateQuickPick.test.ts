import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Template } from '../../../src/core/index.js';

describe('buildTemplateQuickPickItems', () => {
  beforeEach(() => {
    vi.resetModules();

    vi.doMock('vscode', () => ({
      QuickPickItemKind: {
        Separator: -1,
      },
    }));
  });

  it('groups templates by collection and preserves their incoming order', async () => {
    const { buildTemplateQuickPickItems } =
      await import('../../../src/services/templateQuickPick.js');

    const templates: Template[] = [
      createTemplate({
        description: 'Root alpha description',
        filePath: '/workspace/.stencil/alpha.md',
        name: 'alpha',
        source: 'project',
      }),
      createTemplate({
        collection: 'Engineering',
        description: 'Engineering beta description',
        filePath: '/workspace/.stencil/collections/engineering/beta.md',
        name: 'beta',
        source: 'global',
      }),
      createTemplate({
        collection: 'Engineering',
        description: 'Engineering gamma description',
        filePath: '/workspace/.stencil/collections/engineering/gamma.md',
        name: 'gamma',
        source: 'project',
      }),
      createTemplate({
        collection: 'Product',
        description: 'Product delta description',
        filePath: '/workspace/.stencil/collections/product/delta.md',
        name: 'delta',
        source: 'global',
      }),
    ];

    expect(buildTemplateQuickPickItems(templates)).toEqual([
      {
        kind: -1,
        label: 'Templates',
      },
      {
        description: 'project',
        detail: 'Root alpha description',
        label: 'alpha',
        template: templates[0],
      },
      {
        kind: -1,
        label: 'Engineering',
      },
      {
        description: 'global',
        detail: 'Engineering beta description',
        label: 'beta',
        template: templates[1],
      },
      {
        description: 'project',
        detail: 'Engineering gamma description',
        label: 'gamma',
        template: templates[2],
      },
      {
        kind: -1,
        label: 'Product',
      },
      {
        description: 'global',
        detail: 'Product delta description',
        label: 'delta',
        template: templates[3],
      },
    ]);
  });

  it('returns no items for an empty template list', async () => {
    const { buildTemplateQuickPickItems } =
      await import('../../../src/services/templateQuickPick.js');

    expect(buildTemplateQuickPickItems([])).toEqual([]);
  });
});

function createTemplate({
  collection,
  description,
  filePath,
  name,
  source,
}: {
  collection?: string;
  description: string;
  filePath: string;
  name: string;
  source: Template['source'];
}): Template {
  return {
    body: `# ${name}`,
    collection,
    filePath,
    frontmatter: {
      description,
      name,
      version: 1,
    },
    source,
  };
}
