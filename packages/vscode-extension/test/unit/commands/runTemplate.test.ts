import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('registerRunTemplateCommand', () => {
  const registerCommand = vi.fn();
  const showInformationMessage = vi.fn();
  const showCommandError = vi.fn();
  const hasStencilWorkspaceSetup = vi.fn();
  const resolveWorkspace = vi.fn();
  const getStencil = vi.fn();
  const resolveRunTemplateTarget = vi.fn();
  const openResolvedTemplateOutput = vi.fn();
  const buildPlaceholderPromptPlan = vi.fn();
  const collectPlaceholderInputs = vi.fn();

  const workspace = {
    kind: 'workspace' as const,
    rootPath: '/workspace',
    workspaceFolder: {
      index: 0,
      name: 'workspace',
      uri: { fsPath: '/workspace' },
    },
  };

  beforeEach(() => {
    vi.resetModules();

    registerCommand.mockReset();
    showInformationMessage.mockReset();
    showCommandError.mockReset();
    hasStencilWorkspaceSetup.mockReset();
    resolveWorkspace.mockReset();
    getStencil.mockReset();
    resolveRunTemplateTarget.mockReset();
    openResolvedTemplateOutput.mockReset();
    buildPlaceholderPromptPlan.mockReset();
    collectPlaceholderInputs.mockReset();

    registerCommand.mockImplementation(
      (commandId: string, callback: (...args: unknown[]) => Promise<void>) => ({
        callback,
        commandId,
        dispose: vi.fn(),
      }),
    );
    hasStencilWorkspaceSetup.mockResolvedValue(true);
    resolveWorkspace.mockReturnValue(workspace);

    vi.doMock('vscode', () => ({
      commands: {
        registerCommand,
      },
      window: {
        showInformationMessage,
      },
    }));

    vi.doMock('../../../src/services/errors.js', () => ({
      showCommandError,
    }));

    vi.doMock('../../../src/services/getStencil.js', () => ({
      getStencil,
    }));

    vi.doMock('../../../src/services/workspace.js', () => ({
      hasStencilWorkspaceSetup,
      resolveWorkspace,
    }));

    vi.doMock('../../../src/services/runTemplateTarget.js', () => ({
      resolveRunTemplateTarget,
    }));

    vi.doMock('../../../src/services/output.js', () => ({
      openResolvedTemplateOutput,
    }));

    vi.doMock('../../../src/services/placeholderInput.js', () => ({
      buildPlaceholderPromptPlan,
      collectPlaceholderInputs,
    }));
  });

  it('resolves and opens a no-placeholder template', async () => {
    const resolve = vi.fn().mockResolvedValue({
      placeholders: [],
      resolvedBody: '# Prompt',
      unresolvedCount: 0,
    });
    const get = vi.fn();
    getStencil.mockReturnValue({ get, resolve });
    resolveRunTemplateTarget.mockResolvedValue('alpha');
    openResolvedTemplateOutput.mockResolvedValue({ deliveryTargetLabel: 'new editor' });

    const callback = await registerCommandAndGetCallback();
    await callback();

    expect(resolveRunTemplateTarget).toHaveBeenCalledWith({
      commandArgs: [],
      stencil: expect.objectContaining({ resolve }),
      workspace,
    });
    expect(get).toHaveBeenCalledWith('alpha');
    expect(resolve).toHaveBeenCalledWith('alpha', {});
    expect(openResolvedTemplateOutput).toHaveBeenCalledWith('# Prompt');
    expect(buildPlaceholderPromptPlan).not.toHaveBeenCalled();
    expect(collectPlaceholderInputs).not.toHaveBeenCalled();
    expect(showInformationMessage).toHaveBeenCalledWith(
      'Ran "alpha". Opened resolved prompt in a new editor.',
    );
  });

  it('resolves and opens a defaults-only template', async () => {
    const resolve = vi.fn().mockResolvedValue({
      placeholders: [],
      resolvedBody: '# Prompt with defaults',
      unresolvedCount: 0,
    });
    const get = vi.fn();
    getStencil.mockReturnValue({ get, resolve });
    resolveRunTemplateTarget.mockResolvedValue('with-default');
    openResolvedTemplateOutput.mockResolvedValue({ deliveryTargetLabel: 'new editor' });

    const callback = await registerCommandAndGetCallback();
    await callback();

    expect(resolve).toHaveBeenCalledWith('with-default', {});
    expect(openResolvedTemplateOutput).toHaveBeenCalledWith('# Prompt with defaults');
  });

  it('resolves and opens a context-only template', async () => {
    const resolve = vi.fn().mockResolvedValue({
      placeholders: [],
      resolvedBody: '# Prompt with context',
      unresolvedCount: 0,
    });
    const get = vi.fn();
    getStencil.mockReturnValue({ get, resolve });
    resolveRunTemplateTarget.mockResolvedValue('ctx-template');
    openResolvedTemplateOutput.mockResolvedValue({ deliveryTargetLabel: 'new editor' });

    const callback = await registerCommandAndGetCallback();
    await callback('ctx-template');

    expect(resolveRunTemplateTarget).toHaveBeenCalledWith({
      commandArgs: ['ctx-template'],
      stencil: expect.objectContaining({ resolve }),
      workspace,
    });
    expect(resolve).toHaveBeenCalledWith('ctx-template', {});
    expect(openResolvedTemplateOutput).toHaveBeenCalledWith('# Prompt with context');
  });

  it('collects unresolved placeholders and opens resolved output', async () => {
    const template = {
      body: '# Needs input',
      filePath: '/workspace/.stencil/templates/needs-input.md',
      frontmatter: {
        description: 'Needs manual input',
        name: 'needs-input',
        placeholders: [{ description: 'Project name', name: 'project_name', required: true }],
        version: 1,
      },
      source: 'project',
    };
    const resolve = vi
      .fn()
      .mockResolvedValueOnce({
        placeholders: [{ name: 'project_name', source: 'unresolved', value: '' }],
        resolvedBody: '# Needs input',
        unresolvedCount: 1,
      })
      .mockResolvedValueOnce({
        placeholders: [{ name: 'project_name', source: 'explicit', value: 'Stencil' }],
        resolvedBody: '# Stencil',
        unresolvedCount: 0,
      });
    const get = vi.fn().mockResolvedValue(template);
    getStencil.mockReturnValue({ get, resolve });
    resolveRunTemplateTarget.mockResolvedValue('needs-input');
    buildPlaceholderPromptPlan.mockReturnValue({
      initialResolution: { placeholders: [], resolvedBody: '# Needs input', unresolvedCount: 1 },
      queue: [{ description: 'Project name', name: 'project_name', required: true }],
    });
    collectPlaceholderInputs.mockResolvedValue({
      kind: 'completed',
      values: { project_name: 'Stencil' },
    });
    openResolvedTemplateOutput.mockResolvedValue({ deliveryTargetLabel: 'new editor' });

    const callback = await registerCommandAndGetCallback();
    await callback();

    expect(get).toHaveBeenCalledWith('needs-input');
    expect(resolve).toHaveBeenNthCalledWith(1, 'needs-input', {});
    expect(buildPlaceholderPromptPlan).toHaveBeenCalledWith(template, {
      placeholders: [{ name: 'project_name', source: 'unresolved', value: '' }],
      resolvedBody: '# Needs input',
      unresolvedCount: 1,
    });
    expect(collectPlaceholderInputs).toHaveBeenCalledWith([
      { description: 'Project name', name: 'project_name', required: true },
    ]);
    expect(resolve).toHaveBeenNthCalledWith(2, 'needs-input', { project_name: 'Stencil' });
    expect(openResolvedTemplateOutput).toHaveBeenCalledWith('# Stencil');
    expect(showInformationMessage).toHaveBeenCalledWith(
      'Ran "needs-input". Opened resolved prompt in a new editor.',
    );
  });

  it('exits quietly when template selection is cancelled', async () => {
    const resolve = vi.fn();
    const get = vi.fn();
    getStencil.mockReturnValue({ get, resolve });
    resolveRunTemplateTarget.mockResolvedValue(undefined);

    const callback = await registerCommandAndGetCallback();
    await callback();

    expect(get).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    expect(openResolvedTemplateOutput).not.toHaveBeenCalled();
    expect(showInformationMessage).not.toHaveBeenCalled();
  });

  it('shows a cancellation message and stops when placeholder collection is cancelled', async () => {
    const template = {
      body: '# Needs input',
      filePath: '/workspace/.stencil/templates/needs-input.md',
      frontmatter: {
        description: 'Needs manual input',
        name: 'needs-input',
        placeholders: [{ description: 'Project name', name: 'project_name', required: true }],
        version: 1,
      },
      source: 'project',
    };
    const resolve = vi.fn().mockResolvedValue({
      placeholders: [{ name: 'project_name', source: 'unresolved', value: '' }],
      resolvedBody: '# Needs input',
      unresolvedCount: 1,
    });
    const get = vi.fn().mockResolvedValue(template);
    getStencil.mockReturnValue({ get, resolve });
    resolveRunTemplateTarget.mockResolvedValue('needs-input');
    buildPlaceholderPromptPlan.mockReturnValue({
      initialResolution: { placeholders: [], resolvedBody: '# Needs input', unresolvedCount: 1 },
      queue: [{ description: 'Project name', name: 'project_name', required: true }],
    });
    collectPlaceholderInputs.mockResolvedValue({ kind: 'cancelled' });

    const callback = await registerCommandAndGetCallback();
    await callback();

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(openResolvedTemplateOutput).not.toHaveBeenCalled();
    expect(showInformationMessage).toHaveBeenCalledWith(
      'Cancelled running template "needs-input".',
    );
  });

  it('shows unresolved placeholders when values remain missing after prompting', async () => {
    const template = {
      body: '# Needs input',
      filePath: '/workspace/.stencil/templates/needs-input.md',
      frontmatter: {
        description: 'Needs manual input',
        name: 'needs-input',
        placeholders: [{ description: 'Project name', name: 'project_name', required: true }],
        version: 1,
      },
      source: 'project',
    };
    const resolve = vi
      .fn()
      .mockResolvedValueOnce({
        placeholders: [{ name: 'project_name', source: 'unresolved', value: '' }],
        resolvedBody: '# Needs input',
        unresolvedCount: 1,
      })
      .mockResolvedValueOnce({
        placeholders: [{ name: 'project_name', source: 'unresolved', value: '' }],
        resolvedBody: '# Needs input',
        unresolvedCount: 1,
      });
    const get = vi.fn().mockResolvedValue(template);
    getStencil.mockReturnValue({ get, resolve });
    resolveRunTemplateTarget.mockResolvedValue('needs-input');
    buildPlaceholderPromptPlan.mockReturnValue({
      initialResolution: { placeholders: [], resolvedBody: '# Needs input', unresolvedCount: 1 },
      queue: [{ description: 'Project name', name: 'project_name', required: true }],
    });
    collectPlaceholderInputs.mockResolvedValue({
      kind: 'completed',
      values: { project_name: '' },
    });

    const callback = await registerCommandAndGetCallback();
    await callback();

    expect(openResolvedTemplateOutput).not.toHaveBeenCalled();
    expect(showInformationMessage).toHaveBeenCalledWith(
      'Template "needs-input" is still missing placeholder values: project_name.',
    );
  });

  it('routes failures through the shared command error handler', async () => {
    const failure = new Error('run failed');
    const resolve = vi.fn().mockRejectedValue(failure);
    const get = vi.fn().mockResolvedValue({
      body: '# Prompt',
      filePath: '/workspace/.stencil/templates/alpha.md',
      frontmatter: { description: 'Alpha', name: 'alpha', version: 1 },
      source: 'project',
    });
    getStencil.mockReturnValue({ get, resolve });
    resolveRunTemplateTarget.mockResolvedValue('alpha');

    const callback = await registerCommandAndGetCallback();
    await callback();

    expect(showCommandError).toHaveBeenCalledWith(failure);
  });

  async function registerCommandAndGetCallback(): Promise<(...args: unknown[]) => Promise<void>> {
    const { registerRunTemplateCommand } = await import('../../../src/commands/runTemplate.js');
    registerRunTemplateCommand();
    return registerCommand.mock.calls[0][1];
  }
});
