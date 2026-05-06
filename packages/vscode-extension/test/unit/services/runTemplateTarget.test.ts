import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Template } from '../../../src/core/index.js';

describe('resolveRunTemplateTarget', () => {
  const showInformationMessage = vi.fn();
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

    showInformationMessage.mockReset();
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
        showInformationMessage,
        showQuickPick,
      },
    }));
  });

  it('returns an explicit string command target without listing templates', async () => {
    const { resolveRunTemplateTarget } = await import('../../../src/services/runTemplateTarget.js');

    const templateName = await resolveRunTemplateTarget({
      commandArgs: ['alpha'],
      stencil: { list } as never,
      workspace,
    });

    expect(templateName).toBe('alpha');
    expect(list).not.toHaveBeenCalled();
    expect(showQuickPick).not.toHaveBeenCalled();
  });

  it('returns an explicit object command target without listing templates', async () => {
    const { resolveRunTemplateTarget } = await import('../../../src/services/runTemplateTarget.js');

    const templateName = await resolveRunTemplateTarget({
      commandArgs: [{ templateName: 'beta' }],
      stencil: { list } as never,
      workspace,
    });

    expect(templateName).toBe('beta');
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
    const templateName = await resolveRunTemplateTarget({
      commandArgs: [],
      stencil: { list } as never,
      workspace,
    });

    expect(templateName).toBe('beta');
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
    const templateName = await resolveRunTemplateTarget({
      commandArgs: [{ unsupported: true }],
      stencil: { list } as never,
      workspace,
    });

    expect(templateName).toBe('alpha');
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

  it('returns undefined when the quick pick is cancelled', async () => {
    list.mockResolvedValue([createTemplate({ name: 'alpha' })]);
    showQuickPick.mockResolvedValue(undefined);

    const { resolveRunTemplateTarget } = await import('../../../src/services/runTemplateTarget.js');
    const templateName = await resolveRunTemplateTarget({
      commandArgs: [],
      stencil: { list } as never,
      workspace,
    });

    expect(templateName).toBeUndefined();
    expect(showInformationMessage).not.toHaveBeenCalled();
  });

  it('shows the empty-state message when no templates are available', async () => {
    list.mockResolvedValue([]);

    const { resolveRunTemplateTarget } = await import('../../../src/services/runTemplateTarget.js');
    const templateName = await resolveRunTemplateTarget({
      commandArgs: [],
      stencil: { list } as never,
      workspace,
    });

    expect(templateName).toBeUndefined();
    expect(showInformationMessage).toHaveBeenCalledWith(
      'No Stencil templates were found in this workspace.',
    );
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
