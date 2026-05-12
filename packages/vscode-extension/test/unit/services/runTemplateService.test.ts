import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('runTemplateService', () => {
  const buildPlaceholderPromptPlan = vi.fn();
  const collectPlaceholderInputs = vi.fn();
  const resolveRunTemplateTarget = vi.fn();
  const getDeliveryTargetCapability = vi.fn();
  const deliver = vi.fn();
  const getDiagnostics = vi.fn();
  const showInformationMessage = vi.fn();
  const vscodeWindow = {
    activeTextEditor: {
      document: {
        getText: vi.fn().mockReturnValue('selected text'),
        languageId: 'typescript',
        uri: {
          fsPath: '/workspace/src/file.ts',
          scheme: 'file',
        },
      },
      selection: {
        end: { line: 1 },
        isEmpty: false,
        start: { line: 1 },
      },
    },
    showInformationMessage,
  };
  const vscodeWorkspace = {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
  };

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

    buildPlaceholderPromptPlan.mockReset();
    collectPlaceholderInputs.mockReset();
    resolveRunTemplateTarget.mockReset();
    getDeliveryTargetCapability.mockReset();
    deliver.mockReset();
    getDiagnostics.mockReset();
    showInformationMessage.mockReset();

    getDeliveryTargetCapability.mockReturnValue({
      available: true,
      implemented: true,
      supportedModes: ['default'],
      target: 'editor',
      unavailableReason: 'editor unavailable',
    });
    getDiagnostics.mockReturnValue([]);
    deliver.mockResolvedValue({
      deliveryTarget: 'editor',
      deliveryTargetLabel: 'new editor',
      documentUri: { scheme: 'untitled' },
    });
    vscodeWindow.activeTextEditor = {
      document: {
        getText: vi.fn().mockReturnValue('selected text'),
        languageId: 'typescript',
        uri: {
          fsPath: '/workspace/src/file.ts',
          scheme: 'file',
        },
      },
      selection: {
        end: { line: 1 },
        isEmpty: false,
        start: { line: 1 },
      },
    };
    vscodeWorkspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];

    vi.doMock('vscode', () => ({
      languages: {
        getDiagnostics,
      },
      window: vscodeWindow,
      workspace: vscodeWorkspace,
    }));

    vi.doMock('../../../src/services/placeholderInput.js', () => ({
      buildPlaceholderPromptPlan,
      collectPlaceholderInputs,
    }));

    vi.doMock('../../../src/services/runTemplateTarget.js', () => ({
      resolveRunTemplateTarget,
    }));

    vi.doMock('../../../src/services/delivery/capabilities.js', () => ({
      getDeliveryTargetCapability,
    }));

    vi.doMock('../../../src/services/delivery/editorDelivery.js', () => ({
      editorDeliveryAdapter: {
        deliver,
        target: 'editor',
      },
    }));
  });

  it('delivers a no-placeholder template directly to the editor', async () => {
    const resolve = vi.fn().mockResolvedValue({
      placeholders: [],
      resolvedBody: '# Prompt',
      unresolvedCount: 0,
    });
    const stencil = {
      get: vi.fn().mockResolvedValue({
        body: '# Prompt',
        filePath: '/workspace/.stencil/templates/alpha.md',
        frontmatter: { description: 'Alpha', name: 'alpha', version: 1 },
        source: 'project',
      }),
      resolve,
    };
    resolveRunTemplateTarget.mockResolvedValue({ kind: 'selected', templateName: 'alpha' });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(resolveRunTemplateTarget).toHaveBeenCalledWith({
      requestedTarget: undefined,
      stencil,
      workspace,
    });
    expect(resolve).toHaveBeenCalledWith('alpha', {});
    expect(buildPlaceholderPromptPlan).not.toHaveBeenCalled();
    expect(deliver).toHaveBeenCalledWith({
      mode: 'default',
      resolvedBody: '# Prompt',
      templateName: 'alpha',
    });
    expect(outcome).toEqual({
      delivery: {
        deliveryTarget: 'editor',
        deliveryTargetLabel: 'new editor',
        documentUri: { scheme: 'untitled' },
      },
      kind: 'completed',
      templateName: 'alpha',
    });
  });

  it('collects unresolved placeholders and delivers the final result', async () => {
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
    const stencil = {
      get: vi.fn().mockResolvedValue(template),
      resolve,
    };
    resolveRunTemplateTarget.mockResolvedValue({
      kind: 'selected',
      templateName: 'needs-input',
    });
    buildPlaceholderPromptPlan.mockReturnValue({
      initialResolution: { placeholders: [], resolvedBody: '# Needs input', unresolvedCount: 1 },
      queue: [{ description: 'Project name', name: 'project_name', required: true }],
    });
    collectPlaceholderInputs.mockResolvedValue({
      kind: 'completed',
      values: { project_name: 'Stencil' },
    });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(buildPlaceholderPromptPlan).toHaveBeenCalledWith(template, {
      placeholders: [{ name: 'project_name', source: 'unresolved', value: '' }],
      resolvedBody: '# Needs input',
      unresolvedCount: 1,
    });
    expect(collectPlaceholderInputs).toHaveBeenCalledWith([
      { description: 'Project name', name: 'project_name', required: true },
    ]);
    expect(resolve).toHaveBeenNthCalledWith(2, 'needs-input', { project_name: 'Stencil' });
    expect(deliver).toHaveBeenCalledWith({
      mode: 'default',
      resolvedBody: '# Stencil',
      templateName: 'needs-input',
    });
    expect(outcome).toMatchObject({
      kind: 'completed',
      templateName: 'needs-input',
    });
  });

  it('delivers templates with expanded VS Code context resolved through the real stencil facade', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'stencil-vscode-run-template-'));
    await mkdir(join(workspaceRoot, '.stencil', 'templates'), { recursive: true });
    await writeFile(
      join(workspaceRoot, '.stencil', 'templates', 'context-check.md'),
      [
        '---',
        'name: context-check',
        'description: Verify VS Code context resolution',
        'version: 1',
        '---',
        'File: {{$ctx.active_file_name}}',
        'Relative: {{$ctx.active_file_relative_path}}',
        'Workspace: {{$ctx.active_workspace_folder}}',
        'Selection: {{$ctx.active_selection_start_line}}-{{$ctx.active_selection_end_line}}/{{$ctx.active_selection_line_count}}',
      ].join('\n'),
    );

    const { Stencil } = await import('../../../src/core/index.js');
    const { VSCodeContextProvider } = await import('../../../src/providers/contextResolver.js');
    const stencil = new Stencil({
      contextProviders: [new VSCodeContextProvider()],
      projectDir: workspaceRoot,
    });

    resolveRunTemplateTarget.mockResolvedValue({
      kind: 'selected',
      templateName: 'context-check',
    });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(buildPlaceholderPromptPlan).not.toHaveBeenCalled();
    expect(deliver).toHaveBeenCalledWith({
      mode: 'default',
      resolvedBody: [
        'File: file.ts',
        'Relative: src/file.ts',
        'Workspace: /workspace',
        'Selection: 2-2/1',
      ].join('\n'),
      templateName: 'context-check',
    });
    expect(outcome).toMatchObject({
      kind: 'completed',
      templateName: 'context-check',
    });
  });

  it('keeps run execution non-blocking when active editor context is missing', async () => {
    vscodeWindow.activeTextEditor = undefined as never;

    const workspaceRoot = await mkdtemp(join(tmpdir(), 'stencil-vscode-run-template-'));
    await mkdir(join(workspaceRoot, '.stencil', 'templates'), { recursive: true });
    await writeFile(
      join(workspaceRoot, '.stencil', 'templates', 'context-fallback.md'),
      [
        '---',
        'name: context-fallback',
        'description: Verify missing context fallback',
        'version: 1',
        '---',
        'File: {{$ctx.active_file}}',
        'Workspace count: {{$ctx.workspace_folder_count}}',
      ].join('\n'),
    );

    const { Stencil } = await import('../../../src/core/index.js');
    const { VSCodeContextProvider } = await import('../../../src/providers/contextResolver.js');
    const stencil = new Stencil({
      contextProviders: [new VSCodeContextProvider()],
      projectDir: workspaceRoot,
    });

    resolveRunTemplateTarget.mockResolvedValue({
      kind: 'selected',
      templateName: 'context-fallback',
    });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(buildPlaceholderPromptPlan).not.toHaveBeenCalled();
    expect(collectPlaceholderInputs).not.toHaveBeenCalled();
    expect(deliver).toHaveBeenCalledWith({
      mode: 'default',
      resolvedBody: ['File: {{$ctx.active_file}}', 'Workspace count: 1'].join('\n'),
      templateName: 'context-fallback',
    });
    expect(outcome).toMatchObject({
      kind: 'completed',
      templateName: 'context-fallback',
    });
  });

  it('returns a cancellation outcome when placeholder collection is cancelled', async () => {
    const stencil = {
      get: vi.fn().mockResolvedValue({
        body: '# Needs input',
        filePath: '/workspace/.stencil/templates/needs-input.md',
        frontmatter: {
          description: 'Needs manual input',
          name: 'needs-input',
          placeholders: [{ description: 'Project name', name: 'project_name', required: true }],
          version: 1,
        },
        source: 'project',
      }),
      resolve: vi.fn().mockResolvedValue({
        placeholders: [{ name: 'project_name', source: 'unresolved', value: '' }],
        resolvedBody: '# Needs input',
        unresolvedCount: 1,
      }),
    };
    resolveRunTemplateTarget.mockResolvedValue({
      kind: 'selected',
      templateName: 'needs-input',
    });
    buildPlaceholderPromptPlan.mockReturnValue({
      initialResolution: { placeholders: [], resolvedBody: '# Needs input', unresolvedCount: 1 },
      queue: [{ description: 'Project name', name: 'project_name', required: true }],
    });
    collectPlaceholderInputs.mockResolvedValue({ kind: 'cancelled' });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(deliver).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      kind: 'cancelled',
      stage: 'placeholder-input',
      templateName: 'needs-input',
    });
  });

  it('returns unresolved placeholders when values remain missing after prompting', async () => {
    const stencil = {
      get: vi.fn().mockResolvedValue({
        body: '# Needs input',
        filePath: '/workspace/.stencil/templates/needs-input.md',
        frontmatter: {
          description: 'Needs manual input',
          name: 'needs-input',
          placeholders: [{ description: 'Project name', name: 'project_name', required: true }],
          version: 1,
        },
        source: 'project',
      }),
      resolve: vi
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
        }),
    };
    resolveRunTemplateTarget.mockResolvedValue({
      kind: 'selected',
      templateName: 'needs-input',
    });
    buildPlaceholderPromptPlan.mockReturnValue({
      initialResolution: { placeholders: [], resolvedBody: '# Needs input', unresolvedCount: 1 },
      queue: [{ description: 'Project name', name: 'project_name', required: true }],
    });
    collectPlaceholderInputs.mockResolvedValue({
      kind: 'completed',
      values: { project_name: '' },
    });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(deliver).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      kind: 'unresolved-after-prompt',
      templateName: 'needs-input',
      unresolvedNames: ['project_name'],
    });
  });

  it('throws when the selected template can no longer be loaded', async () => {
    resolveRunTemplateTarget.mockResolvedValue({ kind: 'selected', templateName: 'alpha' });
    const stencil = {
      get: vi.fn().mockResolvedValue(null),
      resolve: vi.fn(),
    };

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');

    await expect(
      runTemplate({
        invocationSource: 'command-palette',
        stencil: stencil as never,
        workspace: workspace as never,
      }),
    ).rejects.toMatchObject({
      code: 'TEMPLATE_NOT_FOUND',
      message: 'Template "alpha" could not be found.',
    });
  });

  it('returns an unsupported outcome for non-editor targets', async () => {
    getDeliveryTargetCapability.mockReturnValue({
      available: false,
      implemented: false,
      supportedModes: ['default', 'send'],
      target: 'copilot-chat',
      unavailableReason: 'not available',
    });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      options: { deliveryTarget: 'copilot-chat' },
      stencil: { get: vi.fn(), resolve: vi.fn() } as never,
      workspace: workspace as never,
    });

    expect(outcome).toEqual({
      deliveryTarget: 'copilot-chat',
      kind: 'unsupported-target',
      mode: 'default',
    });
    expect(resolveRunTemplateTarget).not.toHaveBeenCalled();
  });

  it('returns a mode-unavailable outcome for invalid editor mode combinations', async () => {
    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      options: { mode: 'send' },
      stencil: { get: vi.fn(), resolve: vi.fn() } as never,
      workspace: workspace as never,
    });

    expect(outcome).toEqual({
      deliveryTarget: 'editor',
      kind: 'mode-unavailable',
      mode: 'send',
      supportedModes: ['default'],
    });
    expect(resolveRunTemplateTarget).not.toHaveBeenCalled();
  });

  it('returns a target-unavailable outcome when a supported target cannot run here', async () => {
    getDeliveryTargetCapability.mockReturnValue({
      available: false,
      implemented: true,
      supportedModes: ['default'],
      target: 'editor',
      unavailableReason: 'editor unavailable',
    });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      stencil: { get: vi.fn(), resolve: vi.fn() } as never,
      workspace: workspace as never,
    });

    expect(outcome).toEqual({
      deliveryTarget: 'editor',
      kind: 'target-unavailable',
      mode: 'default',
      reason: 'editor unavailable',
    });
    expect(resolveRunTemplateTarget).not.toHaveBeenCalled();
  });

  it('maps recoverable outcomes to informational messages', async () => {
    const { showRunTemplateOutcomeMessage } =
      await import('../../../src/services/runTemplateService.js');

    await showRunTemplateOutcomeMessage({
      kind: 'unresolved-after-prompt',
      templateName: 'alpha',
      unresolvedNames: ['project_name'],
    });
    await showRunTemplateOutcomeMessage({
      kind: 'no-target-selected',
      reason: 'picker-cancelled',
    });
    await showRunTemplateOutcomeMessage({
      kind: 'no-target-selected',
      reason: 'no-templates-available',
    });

    expect(showInformationMessage).toHaveBeenCalledTimes(2);
    expect(showInformationMessage).toHaveBeenNthCalledWith(
      1,
      'Template "alpha" is still missing placeholder values: project_name.',
    );
    expect(showInformationMessage).toHaveBeenNthCalledWith(
      2,
      'No Stencil templates were found in this workspace.',
    );
  });
});
