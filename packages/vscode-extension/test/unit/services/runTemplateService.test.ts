import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('runTemplateService', () => {
  class MockLmApiDeliveryCancelledError extends Error {
    constructor() {
      super('Language model execution was cancelled.');
    }
  }

  class MockLmApiDeliveryError extends Error {
    constructor(readonly userMessage: string) {
      super(userMessage);
    }
  }

  const buildPlaceholderPromptPlan = vi.fn();
  const collectPlaceholderInputs = vi.fn();
  const resolveRunTemplateTarget = vi.fn();
  const getDeliveryTargetCapability = vi.fn();
  const copilotDeliver = vi.fn();
  const clipboardDeliver = vi.fn();
  const deliver = vi.fn();
  const lmApiDeliver = vi.fn();
  const getDiagnostics = vi.fn();
  const showErrorMessage = vi.fn();
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
    showErrorMessage,
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
    copilotDeliver.mockReset();
    clipboardDeliver.mockReset();
    deliver.mockReset();
    lmApiDeliver.mockReset();
    getDiagnostics.mockReset();
    showErrorMessage.mockReset();
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
      deliveryActionLabel: 'opened',
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

    vi.doMock('../../../src/services/delivery/clipboardDelivery.js', () => ({
      clipboardDeliveryAdapter: {
        deliver: clipboardDeliver,
        target: 'clipboard',
      },
      ClipboardDeliveryError: class MockClipboardDeliveryError extends Error {
        constructor(readonly userMessage: string) {
          super(userMessage);
        }
      },
    }));

    vi.doMock('../../../src/services/delivery/copilotChatDelivery.js', () => ({
      copilotChatDeliveryAdapter: {
        deliver: copilotDeliver,
        target: 'copilot-chat',
      },
    }));

    vi.doMock('../../../src/services/delivery/lmApiDelivery.js', () => ({
      lmApiDeliveryAdapter: {
        deliver: lmApiDeliver,
        target: 'lm-api',
      },
      LmApiDeliveryCancelledError: MockLmApiDeliveryCancelledError,
      LmApiDeliveryError: MockLmApiDeliveryError,
    }));
  });

  it('delivers a no-placeholder template directly to the editor', async () => {
    const resolve = vi.fn().mockResolvedValue({
      inputs: [],
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
      chatMode: 'ask',
      mode: 'default',
      resolvedBody: '# Prompt',
      templateName: 'alpha',
    });
    expect(outcome).toEqual({
      delivery: {
        deliveryActionLabel: 'opened',
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
        inputs: [
          {
            description: 'Project name',
            name: 'project_name',
            required: true,
            source: 'unresolved',
            sources: ['frontmatter'],
            value: '',
          },
        ],
        placeholders: [{ name: 'project_name', source: 'unresolved', value: '' }],
        resolvedBody: '# Needs input',
        unresolvedCount: 1,
      })
      .mockResolvedValueOnce({
        inputs: [
          {
            description: 'Project name',
            name: 'project_name',
            required: true,
            source: 'explicit',
            sources: ['frontmatter'],
            value: 'Stencil',
          },
        ],
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
      initialResolution: {
        inputs: [],
        placeholders: [],
        resolvedBody: '# Needs input',
        unresolvedCount: 1,
      },
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
      inputs: [
        {
          description: 'Project name',
          name: 'project_name',
          required: true,
          source: 'unresolved',
          sources: ['frontmatter'],
          value: '',
        },
      ],
      placeholders: [{ name: 'project_name', source: 'unresolved', value: '' }],
      resolvedBody: '# Needs input',
      unresolvedCount: 1,
    });
    expect(collectPlaceholderInputs).toHaveBeenCalledWith([
      { description: 'Project name', name: 'project_name', required: true },
    ]);
    expect(resolve).toHaveBeenNthCalledWith(2, 'needs-input', { project_name: 'Stencil' });
    expect(deliver).toHaveBeenCalledWith({
      chatMode: 'ask',
      mode: 'default',
      resolvedBody: '# Stencil',
      templateName: 'needs-input',
    });
    expect(outcome).toMatchObject({
      kind: 'completed',
      templateName: 'needs-input',
    });
  });

  it('runs inline-only templates by prompting from normalized core inputs', async () => {
    const template = {
      body: '# Needs input\nProject: {{input:project_name}}',
      filePath: '/workspace/.stencil/templates/inline-only.md',
      frontmatter: {
        description: 'Inline-only input',
        name: 'inline-only',
        version: 1,
      },
      source: 'project',
    };
    const resolve = vi
      .fn()
      .mockResolvedValueOnce({
        inputs: [
          {
            description: undefined,
            name: 'project_name',
            required: true,
            source: 'unresolved',
            sources: ['inline'],
            value: '',
          },
        ],
        placeholders: [{ name: 'project_name', source: 'unresolved', value: '' }],
        resolvedBody: '# Needs input\nProject: {{input:project_name}}',
        unresolvedCount: 1,
      })
      .mockResolvedValueOnce({
        inputs: [
          {
            description: undefined,
            name: 'project_name',
            required: true,
            source: 'explicit',
            sources: ['inline'],
            value: 'Stencil',
          },
        ],
        placeholders: [{ name: 'project_name', source: 'explicit', value: 'Stencil' }],
        resolvedBody: '# Needs input\nProject: Stencil',
        unresolvedCount: 0,
      });
    const stencil = {
      get: vi.fn().mockResolvedValue(template),
      resolve,
    };

    resolveRunTemplateTarget.mockResolvedValue({
      kind: 'selected',
      templateName: 'inline-only',
    });
    buildPlaceholderPromptPlan.mockReturnValue({
      initialResolution: {
        inputs: [],
        placeholders: [],
        resolvedBody: '# Needs input\nProject: {{input:project_name}}',
        unresolvedCount: 1,
      },
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

    expect(collectPlaceholderInputs).toHaveBeenCalledWith([
      { description: 'Project name', name: 'project_name', required: true },
    ]);
    expect(deliver).toHaveBeenCalledWith({
      chatMode: 'ask',
      mode: 'default',
      resolvedBody: '# Needs input\nProject: Stencil',
      templateName: 'inline-only',
    });
    expect(outcome).toMatchObject({
      kind: 'completed',
      templateName: 'inline-only',
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
      chatMode: 'ask',
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
      chatMode: 'ask',
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
        inputs: [
          {
            description: 'Project name',
            name: 'project_name',
            required: true,
            source: 'unresolved',
            sources: ['frontmatter'],
            value: '',
          },
        ],
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
      initialResolution: {
        inputs: [],
        placeholders: [],
        resolvedBody: '# Needs input',
        unresolvedCount: 1,
      },
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

  it('normalizes the default lm-api mode to execute before falling back from an unavailable runtime', async () => {
    const stencil = {
      get: vi.fn().mockResolvedValue({
        body: '# Prompt',
        filePath: '/workspace/.stencil/templates/alpha.md',
        frontmatter: { description: 'Alpha', name: 'alpha', version: 1 },
        source: 'project',
      }),
      resolve: vi.fn().mockResolvedValue({
        inputs: [],
        placeholders: [],
        resolvedBody: '# Prompt',
        unresolvedCount: 0,
      }),
    };
    getDeliveryTargetCapability.mockImplementation(async (target: string) => {
      if (target === 'lm-api') {
        return {
          available: false,
          implemented: true,
          supportedChatModes: [],
          supportedModes: ['execute'],
          target: 'lm-api',
          unavailableReason:
            'Stencil Language Model execution is unavailable because no compatible Copilot-backed chat model is available.',
        };
      }

      return {
        available: true,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'clipboard',
      };
    });
    clipboardDeliver.mockResolvedValue({
      deliveryActionLabel: 'copied',
      deliveryTarget: 'clipboard',
      deliveryTargetLabel: 'clipboard',
    });
    resolveRunTemplateTarget.mockResolvedValue({ kind: 'selected', templateName: 'alpha' });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      options: { deliveryTarget: 'lm-api' },
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(outcome).toEqual({
      delivery: {
        deliveryActionLabel: 'copied',
        deliveryTarget: 'clipboard',
        deliveryTargetLabel: 'clipboard',
      },
      fallbackDeliveryTarget: 'clipboard',
      fallbackReason:
        'Stencil Language Model execution is unavailable because no compatible Copilot-backed chat model is available. Copied the resolved prompt to clipboard instead.',
      kind: 'completed-with-fallback',
      requestedDeliveryTarget: 'lm-api',
      templateName: 'alpha',
    });
  });

  it('returns mode-unavailable when lm-api is available but invoked with an unsupported mode', async () => {
    const stencil = {
      get: vi.fn(),
      resolve: vi.fn(),
    };
    getDeliveryTargetCapability.mockResolvedValue({
      available: true,
      implemented: true,
      supportedChatModes: [],
      supportedModes: ['execute'],
      target: 'lm-api',
    });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      options: { deliveryTarget: 'lm-api', mode: 'send' },
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(resolveRunTemplateTarget).not.toHaveBeenCalled();
    expect(stencil.get).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      deliveryTarget: 'lm-api',
      kind: 'mode-unavailable',
      mode: 'send',
      supportedModes: ['execute'],
    });
  });

  it('falls back to the clipboard when lm-api is implemented but no runtime support exists', async () => {
    const stencil = {
      get: vi.fn().mockResolvedValue({
        body: '# Prompt',
        filePath: '/workspace/.stencil/templates/alpha.md',
        frontmatter: { description: 'Alpha', name: 'alpha', version: 1 },
        source: 'project',
      }),
      resolve: vi.fn().mockResolvedValue({
        inputs: [],
        placeholders: [],
        resolvedBody: '# Prompt',
        unresolvedCount: 0,
      }),
    };
    getDeliveryTargetCapability.mockImplementation(async (target: string) => {
      if (target === 'lm-api') {
        return {
          available: false,
          implemented: true,
          supportedChatModes: [],
          supportedModes: ['execute'],
          target: 'lm-api',
          unavailableReason:
            'Stencil Language Model execution is unavailable because no compatible Copilot-backed chat model is available.',
        };
      }

      return {
        available: true,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'clipboard',
      };
    });
    clipboardDeliver.mockResolvedValue({
      deliveryActionLabel: 'copied',
      deliveryTarget: 'clipboard',
      deliveryTargetLabel: 'clipboard',
    });
    resolveRunTemplateTarget.mockResolvedValue({ kind: 'selected', templateName: 'alpha' });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      options: { deliveryTarget: 'lm-api', mode: 'execute' },
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(outcome).toEqual({
      delivery: {
        deliveryActionLabel: 'copied',
        deliveryTarget: 'clipboard',
        deliveryTargetLabel: 'clipboard',
      },
      fallbackDeliveryTarget: 'clipboard',
      fallbackReason:
        'Stencil Language Model execution is unavailable because no compatible Copilot-backed chat model is available. Copied the resolved prompt to clipboard instead.',
      kind: 'completed-with-fallback',
      requestedDeliveryTarget: 'lm-api',
      templateName: 'alpha',
    });
  });

  it('delivers the resolved prompt through lm-api when runtime support exists', async () => {
    const resolve = vi.fn().mockResolvedValue({
      inputs: [],
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
    getDeliveryTargetCapability.mockResolvedValue({
      available: true,
      implemented: true,
      supportedChatModes: [],
      supportedModes: ['execute'],
      target: 'lm-api',
    });
    resolveRunTemplateTarget.mockResolvedValue({ kind: 'selected', templateName: 'alpha' });
    lmApiDeliver.mockResolvedValue({
      deliveryActionLabel: 'streamed',
      deliveryTarget: 'lm-api',
      deliveryTargetLabel: 'Stencil LM response panel',
      panelTitle: 'Stencil Language Model Response',
      surfaceLabel: 'Stencil LM response panel',
    });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      options: { deliveryTarget: 'lm-api' },
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(resolveRunTemplateTarget).toHaveBeenCalledWith({
      requestedTarget: undefined,
      stencil,
      workspace,
    });
    expect(resolve).toHaveBeenCalledWith('alpha', {});
    expect(lmApiDeliver).toHaveBeenCalledWith({
      chatMode: 'ask',
      mode: 'execute',
      resolvedBody: '# Prompt',
      templateName: 'alpha',
    });
    expect(outcome).toEqual({
      delivery: {
        deliveryActionLabel: 'streamed',
        deliveryTarget: 'lm-api',
        deliveryTargetLabel: 'Stencil LM response panel',
        panelTitle: 'Stencil Language Model Response',
        surfaceLabel: 'Stencil LM response panel',
      },
      kind: 'completed',
      templateName: 'alpha',
    });
  });

  it('passes a selected language model id through to lm-api delivery', async () => {
    const resolve = vi.fn().mockResolvedValue({
      inputs: [],
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
    getDeliveryTargetCapability.mockResolvedValue({
      available: true,
      implemented: true,
      supportedChatModes: [],
      supportedModes: ['execute'],
      target: 'lm-api',
    });
    resolveRunTemplateTarget.mockResolvedValue({ kind: 'selected', templateName: 'alpha' });
    lmApiDeliver.mockResolvedValue({
      deliveryActionLabel: 'streamed',
      deliveryTarget: 'lm-api',
      deliveryTargetLabel: 'Stencil LM response panel',
      panelTitle: 'Stencil Language Model Response',
      surfaceLabel: 'Stencil LM response panel',
    });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    await runTemplate({
      invocationSource: 'command-palette',
      options: { deliveryTarget: 'lm-api' },
      selectedLanguageModelId: 'copilot-2',
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(lmApiDeliver).toHaveBeenCalledWith({
      chatMode: 'ask',
      mode: 'execute',
      resolvedBody: '# Prompt',
      selectedModelId: 'copilot-2',
      templateName: 'alpha',
    });
  });

  it('returns a dedicated cancellation outcome when lm-api execution is cancelled', async () => {
    const resolve = vi.fn().mockResolvedValue({
      inputs: [],
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
    getDeliveryTargetCapability.mockResolvedValue({
      available: true,
      implemented: true,
      supportedChatModes: [],
      supportedModes: ['execute'],
      target: 'lm-api',
    });
    resolveRunTemplateTarget.mockResolvedValue({ kind: 'selected', templateName: 'alpha' });
    lmApiDeliver.mockRejectedValue(new MockLmApiDeliveryCancelledError());

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      options: { deliveryTarget: 'lm-api' },
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(outcome).toEqual({
      kind: 'cancelled',
      stage: 'lm-api-execution',
      templateName: 'alpha',
    });
    expect(clipboardDeliver).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });

  it('falls back to the clipboard after a typed lm-api delivery failure', async () => {
    const resolve = vi.fn().mockResolvedValue({
      inputs: [],
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
    getDeliveryTargetCapability.mockImplementation(async (target: string) => {
      if (target === 'lm-api') {
        return {
          available: true,
          implemented: true,
          supportedChatModes: [],
          supportedModes: ['execute'],
          target: 'lm-api',
        };
      }

      return {
        available: true,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'clipboard',
      };
    });
    resolveRunTemplateTarget.mockResolvedValue({ kind: 'selected', templateName: 'alpha' });
    lmApiDeliver.mockRejectedValue(
      new MockLmApiDeliveryError(
        'Stencil Language Model execution is blocked for the selected model. Check provider access or quota and try again.',
      ),
    );
    clipboardDeliver.mockResolvedValue({
      deliveryActionLabel: 'copied',
      deliveryTarget: 'clipboard',
      deliveryTargetLabel: 'clipboard',
    });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      options: { deliveryTarget: 'lm-api' },
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(deliver).not.toHaveBeenCalled();
    expect(copilotDeliver).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      delivery: {
        deliveryActionLabel: 'copied',
        deliveryTarget: 'clipboard',
        deliveryTargetLabel: 'clipboard',
      },
      fallbackDeliveryTarget: 'clipboard',
      fallbackReason:
        'Stencil Language Model execution is blocked for the selected model. Check provider access or quota and try again. Copied the resolved prompt to clipboard instead.',
      kind: 'completed-with-fallback',
      requestedDeliveryTarget: 'lm-api',
      templateName: 'alpha',
    });
  });

  it('delivers the resolved prompt through the clipboard target when available', async () => {
    const resolve = vi.fn().mockResolvedValue({
      inputs: [],
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
    getDeliveryTargetCapability.mockResolvedValue({
      available: true,
      implemented: true,
      supportedChatModes: [],
      supportedModes: ['default'],
      target: 'clipboard',
    });
    resolveRunTemplateTarget.mockResolvedValue({ kind: 'selected', templateName: 'alpha' });
    clipboardDeliver.mockResolvedValue({
      deliveryActionLabel: 'copied',
      deliveryTarget: 'clipboard',
      deliveryTargetLabel: 'clipboard',
    });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      options: { deliveryTarget: 'clipboard' },
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(clipboardDeliver).toHaveBeenCalledWith({
      chatMode: 'ask',
      mode: 'default',
      resolvedBody: '# Prompt',
      templateName: 'alpha',
    });
    expect(outcome).toEqual({
      delivery: {
        deliveryActionLabel: 'copied',
        deliveryTarget: 'clipboard',
        deliveryTargetLabel: 'clipboard',
      },
      kind: 'completed',
      templateName: 'alpha',
    });
  });

  it('falls back to the editor when clipboard delivery is requested without runtime support', async () => {
    const stencil = {
      get: vi.fn().mockResolvedValue({
        body: '# Prompt',
        filePath: '/workspace/.stencil/templates/alpha.md',
        frontmatter: { description: 'Alpha', name: 'alpha', version: 1 },
        source: 'project',
      }),
      resolve: vi.fn().mockResolvedValue({
        inputs: [],
        placeholders: [],
        resolvedBody: '# Prompt',
        unresolvedCount: 0,
      }),
    };
    getDeliveryTargetCapability.mockImplementation(async (target: string) => {
      if (target === 'clipboard') {
        return {
          available: false,
          implemented: true,
          supportedChatModes: [],
          supportedModes: ['default'],
          target: 'clipboard',
          unavailableReason: 'VS Code clipboard services are not available in the current runtime.',
        };
      }

      return {
        available: true,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'editor',
      };
    });
    resolveRunTemplateTarget.mockResolvedValue({ kind: 'selected', templateName: 'alpha' });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      options: { deliveryTarget: 'clipboard' },
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(outcome).toEqual({
      delivery: {
        deliveryActionLabel: 'opened',
        deliveryTarget: 'editor',
        deliveryTargetLabel: 'new editor',
        documentUri: { scheme: 'untitled' },
      },
      fallbackDeliveryTarget: 'editor',
      fallbackReason:
        'VS Code clipboard services are not available in the current runtime. Opened the resolved prompt in a new editor instead.',
      kind: 'completed-with-fallback',
      requestedDeliveryTarget: 'clipboard',
      templateName: 'alpha',
    });
  });

  it('returns mode-unavailable when clipboard delivery is invoked with an unsupported mode', async () => {
    getDeliveryTargetCapability.mockResolvedValue({
      available: true,
      implemented: true,
      supportedChatModes: [],
      supportedModes: ['default'],
      target: 'clipboard',
    });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      options: { deliveryTarget: 'clipboard', mode: 'insert' },
      stencil: { get: vi.fn(), resolve: vi.fn() } as never,
      workspace: workspace as never,
    });

    expect(outcome).toEqual({
      deliveryTarget: 'clipboard',
      kind: 'mode-unavailable',
      mode: 'insert',
      supportedModes: ['default'],
    });
  });

  it('falls back from clipboard to the editor when clipboard delivery throws', async () => {
    const stencil = {
      get: vi.fn().mockResolvedValue({
        body: '# Prompt',
        filePath: '/workspace/.stencil/templates/alpha.md',
        frontmatter: { description: 'Alpha', name: 'alpha', version: 1 },
        source: 'project',
      }),
      resolve: vi.fn().mockResolvedValue({
        inputs: [],
        placeholders: [],
        resolvedBody: '# Prompt',
        unresolvedCount: 0,
      }),
    };
    getDeliveryTargetCapability.mockImplementation(async (target: string) => ({
      available: true,
      implemented: true,
      supportedChatModes: [],
      supportedModes: ['default'],
      target,
    }));
    resolveRunTemplateTarget.mockResolvedValue({ kind: 'selected', templateName: 'alpha' });
    clipboardDeliver.mockRejectedValue(new Error('clipboard blocked'));

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      options: { deliveryTarget: 'clipboard' },
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(outcome).toEqual({
      delivery: {
        deliveryActionLabel: 'opened',
        deliveryTarget: 'editor',
        deliveryTargetLabel: 'new editor',
        documentUri: { scheme: 'untitled' },
      },
      fallbackDeliveryTarget: 'editor',
      fallbackReason:
        'Stencil could not deliver template "alpha" to clipboard: clipboard blocked Opened the resolved prompt in a new editor instead.',
      kind: 'completed-with-fallback',
      requestedDeliveryTarget: 'clipboard',
      templateName: 'alpha',
    });
  });

  it('returns delivery-failed when Copilot delivery and all fallback targets fail', async () => {
    const stencil = {
      get: vi.fn().mockResolvedValue({
        body: '# Prompt',
        filePath: '/workspace/.stencil/templates/alpha.md',
        frontmatter: { description: 'Alpha', name: 'alpha', version: 1 },
        source: 'project',
      }),
      resolve: vi.fn().mockResolvedValue({
        inputs: [],
        placeholders: [],
        resolvedBody: '# Prompt',
        unresolvedCount: 0,
      }),
    };
    getDeliveryTargetCapability.mockImplementation(async (target: string) => {
      if (target === 'copilot-chat') {
        return {
          available: true,
          implemented: true,
          supportedChatModes: ['ask', 'edit', 'agent'],
          supportedModes: ['default', 'insert', 'send'],
          target: 'copilot-chat',
        };
      }

      if (target === 'clipboard') {
        return {
          available: false,
          implemented: true,
          supportedChatModes: [],
          supportedModes: ['default'],
          target: 'clipboard',
          unavailableReason: 'VS Code clipboard services are not available in the current runtime.',
        };
      }

      return {
        available: true,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'editor',
      };
    });
    resolveRunTemplateTarget.mockResolvedValue({ kind: 'selected', templateName: 'alpha' });
    copilotDeliver.mockRejectedValue(new Error('chat open failed'));
    deliver.mockRejectedValue(new Error('editor unavailable'));

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      options: { deliveryTarget: 'copilot-chat', mode: 'insert' },
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(clipboardDeliver).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      deliveryTarget: 'copilot-chat',
      kind: 'delivery-failed',
      reason:
        'Copilot Chat failed: chat open failed. VS Code clipboard services are not available in the current runtime. Editor fallback failed: Stencil could not deliver template "alpha" to editor: editor unavailable',
      templateName: 'alpha',
    });
  });

  it('returns delivery-failed when lm-api fallback targets are unavailable or unsupported', async () => {
    const stencil = {
      get: vi.fn().mockResolvedValue({
        body: '# Prompt',
        filePath: '/workspace/.stencil/templates/alpha.md',
        frontmatter: { description: 'Alpha', name: 'alpha', version: 1 },
        source: 'project',
      }),
      resolve: vi.fn().mockResolvedValue({
        inputs: [],
        placeholders: [],
        resolvedBody: '# Prompt',
        unresolvedCount: 0,
      }),
    };
    getDeliveryTargetCapability.mockImplementation(async (target: string) => {
      if (target === 'lm-api') {
        return {
          available: false,
          implemented: true,
          supportedChatModes: [],
          supportedModes: ['execute'],
          target: 'lm-api',
          unavailableReason:
            'Stencil Language Model execution is unavailable because this VS Code runtime does not expose vscode.lm.selectChatModels.',
        };
      }

      if (target === 'clipboard') {
        return {
          available: false,
          implemented: false,
          supportedChatModes: [],
          supportedModes: ['default'],
          target: 'clipboard',
        };
      }

      return {
        available: false,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'editor',
        unavailableReason: 'VS Code editor services are not available in the current runtime.',
      };
    });
    resolveRunTemplateTarget.mockResolvedValue({ kind: 'selected', templateName: 'alpha' });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      options: { deliveryTarget: 'lm-api', mode: 'execute' },
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(lmApiDeliver).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      deliveryTarget: 'lm-api',
      kind: 'delivery-failed',
      reason:
        'Stencil Language Model execution is unavailable because this VS Code runtime does not expose vscode.lm.selectChatModels. Clipboard fallback is not supported in this extension build. VS Code editor services are not available in the current runtime.',
      templateName: 'alpha',
    });
  });

  it('does not attempt Copilot delivery or editor fallback after placeholder cancellation', async () => {
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
        inputs: [
          {
            description: 'Project name',
            name: 'project_name',
            required: true,
            source: 'unresolved',
            sources: ['frontmatter'],
            value: '',
          },
        ],
        placeholders: [{ name: 'project_name', source: 'unresolved', value: '' }],
        resolvedBody: '# Needs input',
        unresolvedCount: 1,
      }),
    };
    getDeliveryTargetCapability.mockResolvedValue({
      available: false,
      implemented: true,
      supportedChatModes: ['ask', 'edit', 'agent'],
      supportedModes: ['default', 'insert', 'send'],
      target: 'copilot-chat',
      unavailableReason:
        'Copilot Chat is unavailable because VS Code did not expose workbench.action.chat.open.',
    });
    resolveRunTemplateTarget.mockResolvedValue({
      kind: 'selected',
      templateName: 'needs-input',
    });
    buildPlaceholderPromptPlan.mockReturnValue({
      initialResolution: {
        inputs: [],
        placeholders: [],
        resolvedBody: '# Needs input',
        unresolvedCount: 1,
      },
      queue: [{ description: 'Project name', name: 'project_name', required: true }],
    });
    collectPlaceholderInputs.mockResolvedValue({ kind: 'cancelled' });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      options: { deliveryTarget: 'copilot-chat', mode: 'insert' },
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(copilotDeliver).not.toHaveBeenCalled();
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
          inputs: [
            {
              description: 'Project name',
              name: 'project_name',
              required: true,
              source: 'unresolved',
              sources: ['frontmatter'],
              value: '',
            },
          ],
          placeholders: [{ name: 'project_name', source: 'unresolved', value: '' }],
          resolvedBody: '# Needs input',
          unresolvedCount: 1,
        })
        .mockResolvedValueOnce({
          inputs: [
            {
              description: 'Project name',
              name: 'project_name',
              required: true,
              source: 'unresolved',
              sources: ['frontmatter'],
              value: '',
            },
          ],
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
      initialResolution: {
        inputs: [],
        placeholders: [],
        resolvedBody: '# Needs input',
        unresolvedCount: 1,
      },
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

  it('surfaces template contract failures from core without replacing the message', async () => {
    resolveRunTemplateTarget.mockResolvedValue({
      kind: 'selected',
      templateName: 'conflicting-inline-defaults',
    });
    const stencil = {
      get: vi.fn().mockResolvedValue({
        body: 'One {{input:review_type:general}} Two {{input:review_type:security}}',
        filePath: '/workspace/.stencil/templates/conflicting-inline-defaults.md',
        frontmatter: {
          description: 'Conflicting inline defaults',
          name: 'conflicting-inline-defaults',
          version: 1,
        },
        source: 'project',
      }),
      resolve: vi
        .fn()
        .mockRejectedValue(
          new Error(
            'Template "conflicting-inline-defaults" has validation errors: Input "review_type" has conflicting inline defaults: "general" and "security"',
          ),
        ),
    };

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');

    await expect(
      runTemplate({
        invocationSource: 'command-palette',
        stencil: stencil as never,
        workspace: workspace as never,
      }),
    ).rejects.toThrow(
      'Template "conflicting-inline-defaults" has validation errors: Input "review_type" has conflicting inline defaults: "general" and "security"',
    );
    expect(buildPlaceholderPromptPlan).not.toHaveBeenCalled();
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

  it('keeps the editor path unaffected by Copilot capability stubs', async () => {
    const resolve = vi.fn().mockResolvedValue({
      inputs: [],
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
    getDeliveryTargetCapability.mockImplementation((target: string) =>
      target === 'editor'
        ? {
            available: true,
            implemented: true,
            supportedModes: ['default'],
            target: 'editor',
          }
        : {
            available: false,
            implemented: false,
            supportedModes: ['default', 'send'],
            target: 'copilot-chat',
            unavailableReason: 'not available',
          },
    );
    resolveRunTemplateTarget.mockResolvedValue({ kind: 'selected', templateName: 'alpha' });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(deliver).toHaveBeenCalledWith({
      chatMode: 'ask',
      mode: 'default',
      resolvedBody: '# Prompt',
      templateName: 'alpha',
    });
    expect(outcome).toMatchObject({
      kind: 'completed',
      templateName: 'alpha',
    });
  });

  it('delivers directly to Copilot Chat for the insert flow', async () => {
    const resolve = vi.fn().mockResolvedValue({
      inputs: [],
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
    getDeliveryTargetCapability.mockResolvedValue({
      available: true,
      implemented: true,
      supportedChatModes: ['ask', 'edit', 'agent'],
      supportedModes: ['default', 'insert'],
      target: 'copilot-chat',
    });
    copilotDeliver.mockResolvedValue({
      deliveryActionLabel: 'inserted',
      deliveryTarget: 'copilot-chat',
      deliveryTargetLabel: 'Copilot Chat',
    });
    resolveRunTemplateTarget.mockResolvedValue({ kind: 'selected', templateName: 'alpha' });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      options: { deliveryTarget: 'copilot-chat', mode: 'insert' },
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(copilotDeliver).toHaveBeenCalledWith({
      chatMode: 'ask',
      mode: 'insert',
      resolvedBody: '# Prompt',
      templateName: 'alpha',
    });
    expect(deliver).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      delivery: {
        deliveryActionLabel: 'inserted',
        deliveryTarget: 'copilot-chat',
        deliveryTargetLabel: 'Copilot Chat',
      },
      kind: 'completed',
      templateName: 'alpha',
    });
  });

  it('passes through an explicitly supported Copilot chat mode', async () => {
    const resolve = vi.fn().mockResolvedValue({
      inputs: [],
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
    getDeliveryTargetCapability.mockResolvedValue({
      available: true,
      implemented: true,
      supportedChatModes: ['ask', 'edit', 'agent'],
      supportedModes: ['default', 'insert', 'send'],
      target: 'copilot-chat',
    });
    copilotDeliver.mockResolvedValue({
      deliveryActionLabel: 'inserted',
      deliveryTarget: 'copilot-chat',
      deliveryTargetLabel: 'Copilot Chat',
    });
    resolveRunTemplateTarget.mockResolvedValue({ kind: 'selected', templateName: 'alpha' });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    await runTemplate({
      invocationSource: 'command-palette',
      options: { chatMode: 'agent', deliveryTarget: 'copilot-chat', mode: 'insert' },
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(copilotDeliver).toHaveBeenCalledWith({
      chatMode: 'agent',
      mode: 'insert',
      resolvedBody: '# Prompt',
      templateName: 'alpha',
    });
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

  it('falls back to the clipboard when the requested Copilot chat mode is unsupported', async () => {
    const resolve = vi.fn().mockResolvedValue({
      inputs: [],
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
    getDeliveryTargetCapability.mockImplementation(async (target: string) => {
      if (target === 'copilot-chat') {
        return {
          available: true,
          implemented: true,
          supportedChatModes: ['ask'],
          supportedModes: ['default', 'insert', 'send'],
          target: 'copilot-chat',
        };
      }

      return {
        available: true,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'clipboard',
      };
    });
    resolveRunTemplateTarget.mockResolvedValue({ kind: 'selected', templateName: 'alpha' });
    clipboardDeliver.mockResolvedValue({
      deliveryActionLabel: 'copied',
      deliveryTarget: 'clipboard',
      deliveryTargetLabel: 'clipboard',
    });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      options: { chatMode: 'agent', deliveryTarget: 'copilot-chat', mode: 'insert' },
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(outcome).toEqual({
      delivery: {
        deliveryActionLabel: 'copied',
        deliveryTarget: 'clipboard',
        deliveryTargetLabel: 'clipboard',
      },
      fallbackDeliveryTarget: 'clipboard',
      fallbackReason:
        'Copilot Chat mode "agent" is unavailable in the current runtime. Copied the resolved prompt to clipboard instead.',
      kind: 'completed-with-fallback',
      requestedDeliveryTarget: 'copilot-chat',
      templateName: 'alpha',
    });
    expect(clipboardDeliver).toHaveBeenCalledWith({
      chatMode: 'ask',
      mode: 'default',
      resolvedBody: '# Prompt',
      templateName: 'alpha',
    });
    expect(copilotDeliver).not.toHaveBeenCalled();
  });

  it('delivers directly to Copilot Chat for the send flow', async () => {
    const resolve = vi.fn().mockResolvedValue({
      inputs: [],
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
    getDeliveryTargetCapability.mockResolvedValue({
      available: true,
      implemented: true,
      supportedChatModes: ['ask', 'edit', 'agent'],
      supportedModes: ['default', 'insert', 'send'],
      target: 'copilot-chat',
    });
    copilotDeliver.mockResolvedValue({
      deliveryActionLabel: 'sent',
      deliveryTarget: 'copilot-chat',
      deliveryTargetLabel: 'Copilot Chat',
    });
    resolveRunTemplateTarget.mockResolvedValue({ kind: 'selected', templateName: 'alpha' });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      options: { deliveryTarget: 'copilot-chat', mode: 'send' },
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(copilotDeliver).toHaveBeenCalledWith({
      chatMode: 'ask',
      mode: 'send',
      resolvedBody: '# Prompt',
      templateName: 'alpha',
    });
    expect(outcome).toEqual({
      delivery: {
        deliveryActionLabel: 'sent',
        deliveryTarget: 'copilot-chat',
        deliveryTargetLabel: 'Copilot Chat',
      },
      kind: 'completed',
      templateName: 'alpha',
    });
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

  it('falls back to the clipboard when Copilot Chat is unavailable', async () => {
    const resolve = vi.fn().mockResolvedValue({
      inputs: [],
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
    getDeliveryTargetCapability.mockImplementation(async (target: string) => {
      if (target === 'copilot-chat') {
        return {
          available: false,
          implemented: true,
          supportedChatModes: ['ask', 'edit', 'agent'],
          supportedModes: ['default', 'insert', 'send'],
          target: 'copilot-chat',
          unavailableReason:
            'Copilot Chat is unavailable because VS Code did not expose workbench.action.chat.open.',
        };
      }

      return {
        available: true,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'clipboard',
      };
    });
    resolveRunTemplateTarget.mockResolvedValue({ kind: 'selected', templateName: 'alpha' });
    clipboardDeliver.mockResolvedValue({
      deliveryActionLabel: 'copied',
      deliveryTarget: 'clipboard',
      deliveryTargetLabel: 'clipboard',
    });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      options: { deliveryTarget: 'copilot-chat', mode: 'insert' },
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(outcome).toEqual({
      delivery: {
        deliveryActionLabel: 'copied',
        deliveryTarget: 'clipboard',
        deliveryTargetLabel: 'clipboard',
      },
      fallbackDeliveryTarget: 'clipboard',
      fallbackReason:
        'Copilot Chat is unavailable because VS Code did not expose workbench.action.chat.open. Copied the resolved prompt to clipboard instead.',
      kind: 'completed-with-fallback',
      requestedDeliveryTarget: 'copilot-chat',
      templateName: 'alpha',
    });
    expect(clipboardDeliver).toHaveBeenCalledWith({
      chatMode: 'ask',
      mode: 'default',
      resolvedBody: '# Prompt',
      templateName: 'alpha',
    });
    expect(copilotDeliver).not.toHaveBeenCalled();
  });

  it('falls back to the clipboard when Copilot command execution throws', async () => {
    const resolve = vi.fn().mockResolvedValue({
      inputs: [],
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
    getDeliveryTargetCapability.mockImplementation(async (target: string) => {
      if (target === 'copilot-chat') {
        return {
          available: true,
          implemented: true,
          supportedChatModes: ['ask', 'edit', 'agent'],
          supportedModes: ['default', 'insert', 'send'],
          target: 'copilot-chat',
        };
      }

      return {
        available: true,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'clipboard',
      };
    });
    copilotDeliver.mockRejectedValue(new Error('chat open failed'));
    resolveRunTemplateTarget.mockResolvedValue({ kind: 'selected', templateName: 'alpha' });
    clipboardDeliver.mockResolvedValue({
      deliveryActionLabel: 'copied',
      deliveryTarget: 'clipboard',
      deliveryTargetLabel: 'clipboard',
    });

    const { runTemplate } = await import('../../../src/services/runTemplateService.js');
    const outcome = await runTemplate({
      invocationSource: 'command-palette',
      options: { deliveryTarget: 'copilot-chat', mode: 'insert' },
      stencil: stencil as never,
      workspace: workspace as never,
    });

    expect(outcome).toEqual({
      delivery: {
        deliveryActionLabel: 'copied',
        deliveryTarget: 'clipboard',
        deliveryTargetLabel: 'clipboard',
      },
      fallbackDeliveryTarget: 'clipboard',
      fallbackReason:
        'Copilot Chat failed: chat open failed. Copied the resolved prompt to clipboard instead.',
      kind: 'completed-with-fallback',
      requestedDeliveryTarget: 'copilot-chat',
      templateName: 'alpha',
    });
    expect(clipboardDeliver).toHaveBeenCalledWith({
      chatMode: 'ask',
      mode: 'default',
      resolvedBody: '# Prompt',
      templateName: 'alpha',
    });
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

  it('maps cancellation outcomes to informational messages', async () => {
    const { showRunTemplateOutcomeMessage } =
      await import('../../../src/services/runTemplateService.js');

    await showRunTemplateOutcomeMessage({
      kind: 'cancelled',
      stage: 'placeholder-input',
      templateName: 'alpha',
    });
    await showRunTemplateOutcomeMessage({
      kind: 'cancelled',
      stage: 'lm-api-execution',
      templateName: 'beta',
    });

    expect(showInformationMessage).toHaveBeenNthCalledWith(
      1,
      'Cancelled running template "alpha".',
    );
    expect(showInformationMessage).toHaveBeenNthCalledWith(
      2,
      'Cancelled language model execution for template "beta".',
    );
  });

  it('maps unsupported and unavailable delivery outcomes to informational messages', async () => {
    const { showRunTemplateOutcomeMessage } =
      await import('../../../src/services/runTemplateService.js');

    await showRunTemplateOutcomeMessage({
      deliveryTarget: 'copilot-chat',
      kind: 'unsupported-target',
      mode: 'default',
    });
    await showRunTemplateOutcomeMessage({
      deliveryTarget: 'copilot-chat',
      kind: 'mode-unavailable',
      mode: 'send',
      supportedModes: ['default'],
    });
    await showRunTemplateOutcomeMessage({
      deliveryTarget: 'copilot-chat',
      kind: 'target-unavailable',
      mode: 'default',
      reason: 'Copilot Chat delivery is not available in this extension build.',
    });

    expect(showInformationMessage).toHaveBeenNthCalledWith(
      1,
      'Stencil run target "Copilot Chat" is not supported yet.',
    );
    expect(showInformationMessage).toHaveBeenNthCalledWith(
      2,
      'Stencil run mode "send" is unavailable for target "Copilot Chat". Supported modes: default.',
    );
    expect(showInformationMessage).toHaveBeenNthCalledWith(
      3,
      'Copilot Chat delivery is not available in this extension build.',
    );
  });

  it('maps unsupported chat-mode outcomes to informational messages', async () => {
    const { showRunTemplateOutcomeMessage } =
      await import('../../../src/services/runTemplateService.js');

    await showRunTemplateOutcomeMessage({
      chatMode: 'agent',
      deliveryTarget: 'copilot-chat',
      kind: 'chat-mode-unavailable',
      supportedChatModes: ['ask'],
    });

    expect(showInformationMessage).toHaveBeenCalledWith(
      'Stencil chat mode "agent" is unavailable for target "Copilot Chat". Supported chat modes: ask.',
    );
  });

  it('maps fallback outcomes to informational messages', async () => {
    const { showRunTemplateOutcomeMessage } =
      await import('../../../src/services/runTemplateService.js');

    await showRunTemplateOutcomeMessage({
      delivery: {
        deliveryActionLabel: 'copied',
        deliveryTarget: 'clipboard',
        deliveryTargetLabel: 'clipboard',
      },
      fallbackDeliveryTarget: 'clipboard',
      fallbackReason:
        'Copilot Chat failed: chat open failed. Copied the resolved prompt to clipboard instead.',
      kind: 'completed-with-fallback',
      requestedDeliveryTarget: 'copilot-chat',
      templateName: 'alpha',
    });

    expect(showInformationMessage).toHaveBeenCalledWith(
      'Copilot Chat failed: chat open failed. Copied the resolved prompt to clipboard instead.',
    );
  });

  it('reports inserted and sent Copilot deliveries distinctly in outcome messages', async () => {
    const { showRunTemplateOutcomeMessage } =
      await import('../../../src/services/runTemplateService.js');

    await showRunTemplateOutcomeMessage({
      delivery: {
        deliveryActionLabel: 'inserted',
        deliveryTarget: 'copilot-chat',
        deliveryTargetLabel: 'Copilot Chat',
      },
      kind: 'completed',
      templateName: 'alpha',
    });
    await showRunTemplateOutcomeMessage({
      delivery: {
        deliveryActionLabel: 'sent',
        deliveryTarget: 'copilot-chat',
        deliveryTargetLabel: 'Copilot Chat',
      },
      kind: 'completed',
      templateName: 'beta',
    });

    expect(showInformationMessage).toHaveBeenNthCalledWith(
      1,
      'Ran "alpha". Inserted resolved prompt in Copilot Chat.',
    );
    expect(showInformationMessage).toHaveBeenNthCalledWith(
      2,
      'Ran "beta". Sent resolved prompt in Copilot Chat.',
    );
  });

  it('reports editor completion outcomes through the shared message formatter', async () => {
    const { showRunTemplateOutcomeMessage } =
      await import('../../../src/services/runTemplateService.js');

    await showRunTemplateOutcomeMessage({
      delivery: {
        deliveryActionLabel: 'opened',
        deliveryTarget: 'editor',
        deliveryTargetLabel: 'new editor',
      },
      kind: 'completed',
      templateName: 'alpha',
    });

    expect(showInformationMessage).toHaveBeenCalledWith(
      'Ran "alpha". Opened resolved prompt in new editor.',
    );
  });

  it('routes delivery-failed outcomes to error notifications', async () => {
    const { showRunTemplateOutcomeMessage } =
      await import('../../../src/services/runTemplateService.js');

    await showRunTemplateOutcomeMessage({
      deliveryTarget: 'copilot-chat',
      kind: 'delivery-failed',
      reason: 'Editor fallback also failed.',
      templateName: 'alpha',
    });

    expect(showErrorMessage).toHaveBeenCalledWith('Editor fallback also failed.');
    expect(showInformationMessage).not.toHaveBeenCalled();
  });
});
