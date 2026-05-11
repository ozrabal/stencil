import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Template } from '../../../src/core/index.js';

describe('resolveRunTemplateTarget', () => {
  const showQuickPick = vi.fn();
  const list = vi.fn();

  const workspace = {
    kind: 'workspace' as const,
    rootPath: '/workspace',
    workspaceFolder: {
      index: 0,
      name: 'workspace',
      uri: { fsPath: '/workspace' },
    },
  };

  let activeTextEditor: undefined | { document: { uri: { fsPath: string; scheme: string } } };

  beforeEach(() => {
    vi.resetModules();

    showQuickPick.mockReset();
    list.mockReset();
    activeTextEditor = undefined;

    vi.doMock('vscode', () => ({
      QuickPickItemKind: {
        Separator: -1,
      },
      window: {
        get activeTextEditor() {
          return activeTextEditor;
        },
        showQuickPick,
      },
    }));
  });

  it('returns an explicit request target without listing templates', async () => {
    const { resolveRunTemplateTarget } = await import('../../../src/services/runTemplateTarget.js');

    const result = await resolveRunTemplateTarget({
      requestedTarget: { templateName: 'alpha' },
      stencil: { list } as never,
      workspace: workspace as never,
    });

    expect(result).toEqual({ kind: 'selected', templateName: 'alpha' });
    expect(list).not.toHaveBeenCalled();
    expect(showQuickPick).not.toHaveBeenCalled();
  });

  it('resolves the active template file before falling back to a quick pick', async () => {
    const beta = createTemplate({
      filePath: '/workspace/.stencil/templates/beta.md',
      name: 'beta',
    });
    list.mockResolvedValue([beta]);
    activeTextEditor = {
      document: {
        uri: {
          fsPath: '/workspace/.stencil/templates/beta.md',
          scheme: 'file',
        },
      },
    };

    const { resolveRunTemplateTarget } = await import('../../../src/services/runTemplateTarget.js');
    const result = await resolveRunTemplateTarget({
      stencil: { list } as never,
      workspace: workspace as never,
    });

    expect(result).toEqual({ kind: 'selected', templateName: 'beta' });
    expect(list).toHaveBeenCalledTimes(1);
    expect(showQuickPick).not.toHaveBeenCalled();
  });

  it('falls back to a quick pick when the active file is not a stencil template', async () => {
    const alpha = createTemplate({ name: 'alpha' });
    list.mockResolvedValue([alpha]);
    activeTextEditor = {
      document: {
        uri: {
          fsPath: '/workspace/src/app.ts',
          scheme: 'file',
        },
      },
    };
    showQuickPick.mockResolvedValue({
      description: 'project',
      detail: 'Alpha description',
      label: 'alpha',
      template: alpha,
    });

    const { resolveRunTemplateTarget } = await import('../../../src/services/runTemplateTarget.js');
    const result = await resolveRunTemplateTarget({
      stencil: { list } as never,
      workspace: workspace as never,
    });

    expect(result).toEqual({ kind: 'selected', templateName: 'alpha' });
    expect(showQuickPick).toHaveBeenCalledWith(
      [
        { kind: -1, label: 'Templates' },
        {
          description: 'project',
          detail: 'Alpha description',
          label: 'alpha',
          template: alpha,
        },
      ],
      {
        placeHolder: 'Select a template to run',
        title: 'Stencil: Run Template',
      },
    );
  });

  it('returns a picker cancellation outcome when the quick pick is cancelled', async () => {
    list.mockResolvedValue([createTemplate({ name: 'alpha' })]);
    showQuickPick.mockResolvedValue(undefined);

    const { resolveRunTemplateTarget } = await import('../../../src/services/runTemplateTarget.js');
    const result = await resolveRunTemplateTarget({
      stencil: { list } as never,
      workspace: workspace as never,
    });

    expect(result).toEqual({ kind: 'not-selected', reason: 'picker-cancelled' });
  });

  it('returns an empty-state outcome when no templates are available', async () => {
    list.mockResolvedValue([]);

    const { resolveRunTemplateTarget } = await import('../../../src/services/runTemplateTarget.js');
    const result = await resolveRunTemplateTarget({
      stencil: { list } as never,
      workspace: workspace as never,
    });

    expect(result).toEqual({ kind: 'not-selected', reason: 'no-templates-available' });
    expect(showQuickPick).not.toHaveBeenCalled();
  });
});

function createTemplate({ filePath, name }: { filePath?: string; name: string }): Template {
  return {
    body: `# ${name}`,
    filePath: filePath ?? `/workspace/.stencil/${name}.md`,
    frontmatter: {
      description: `${capitalize(name)} description`,
      name,
      version: 1,
    },
    source: 'project',
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
