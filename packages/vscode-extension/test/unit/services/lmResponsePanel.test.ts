import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('lmResponsePanel', () => {
  const createWebviewPanel = vi.fn();
  const onDidDisposeCallbacks: Array<() => void> = [];
  const onDidReceiveMessageCallbacks: Array<(message: unknown) => void> = [];
  const postMessage = vi.fn();
  const reveal = vi.fn();
  const dispose = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    createWebviewPanel.mockReset();
    postMessage.mockReset();
    reveal.mockReset();
    dispose.mockReset();
    onDidDisposeCallbacks.length = 0;
    onDidReceiveMessageCallbacks.length = 0;

    createWebviewPanel.mockImplementation((_viewType, _title, _column, _options) => ({
      dispose,
      onDidDispose(callback: () => void) {
        onDidDisposeCallbacks.push(callback);
        return { dispose: vi.fn() };
      },
      reveal,
      webview: {
        html: '',
        onDidReceiveMessage(callback: (message: unknown) => void) {
          onDidReceiveMessageCallbacks.push(callback);
          return { dispose: vi.fn() };
        },
        postMessage,
      },
    }));

    vi.doMock('vscode', () => ({
      ViewColumn: {
        Beside: 2,
      },
      window: {
        createWebviewPanel,
      },
    }));
  });

  it('creates the panel on first use and publishes the initial idle state', async () => {
    const { beginLmResponsePanelSession } =
      await import('../../../src/services/lmResponsePanel.js');

    beginLmResponsePanelSession({
      modelId: 'copilot-1',
      modelLabel: 'Copilot Model',
      promptText: '# Prompt',
      templateName: 'alpha',
    });

    expect(createWebviewPanel).toHaveBeenCalledWith(
      'stencil.languageModelResponse',
      'Stencil Language Model Response',
      2,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );
    expect(reveal).toHaveBeenCalledWith(2);
    expect(postMessage).toHaveBeenCalledWith({
      state: {
        canCancel: false,
        modelId: 'copilot-1',
        modelLabel: 'Copilot Model',
        promptText: '# Prompt',
        responseText: '',
        status: 'idle',
        templateName: 'alpha',
      },
      type: 'stencil.lmResponsePanel.state',
    });
  });

  it('reuses the same panel for later runs and resets the response state', async () => {
    const { beginLmResponsePanelSession } =
      await import('../../../src/services/lmResponsePanel.js');

    const firstSession = beginLmResponsePanelSession({
      modelId: 'copilot-1',
      modelLabel: 'Copilot Model',
      promptText: '# Prompt',
      templateName: 'alpha',
    });
    firstSession.appendResponseChunk('Hello');

    beginLmResponsePanelSession({
      modelId: 'copilot-2',
      modelLabel: 'Copilot Model 2',
      promptText: '# New Prompt',
      templateName: 'beta',
    });

    expect(createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenLastCalledWith({
      state: {
        canCancel: false,
        modelId: 'copilot-2',
        modelLabel: 'Copilot Model 2',
        promptText: '# New Prompt',
        responseText: '',
        status: 'idle',
        templateName: 'beta',
      },
      type: 'stencil.lmResponsePanel.state',
    });
  });

  it('publishes streaming and completed states as chunks arrive', async () => {
    const { beginLmResponsePanelSession } =
      await import('../../../src/services/lmResponsePanel.js');

    const session = beginLmResponsePanelSession({
      modelId: 'copilot-1',
      modelLabel: 'Copilot Model',
      promptText: '# Prompt',
      templateName: 'alpha',
    });

    session.appendResponseChunk('Hello');
    session.appendResponseChunk(' world');
    session.complete();

    expect(postMessage).toHaveBeenNthCalledWith(2, {
      state: {
        canCancel: false,
        modelId: 'copilot-1',
        modelLabel: 'Copilot Model',
        promptText: '# Prompt',
        responseText: 'Hello',
        status: 'streaming',
        templateName: 'alpha',
      },
      type: 'stencil.lmResponsePanel.state',
    });
    expect(postMessage).toHaveBeenNthCalledWith(4, {
      state: {
        canCancel: false,
        modelId: 'copilot-1',
        modelLabel: 'Copilot Model',
        promptText: '# Prompt',
        responseText: 'Hello world',
        status: 'completed',
        templateName: 'alpha',
      },
      type: 'stencil.lmResponsePanel.state',
    });
  });

  it('cancels the active run from the panel message channel and ignores later chunks', async () => {
    const cancelHandler = vi.fn();
    const { beginLmResponsePanelSession } =
      await import('../../../src/services/lmResponsePanel.js');

    const session = beginLmResponsePanelSession({
      modelId: 'copilot-1',
      modelLabel: 'Copilot Model',
      promptText: '# Prompt',
      templateName: 'alpha',
    });
    session.setCancellationHandler(cancelHandler);

    onDidReceiveMessageCallbacks[0]?.({ type: 'stencil.lmResponsePanel.cancel' });
    session.appendResponseChunk('ignored');

    expect(cancelHandler).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenNthCalledWith(2, {
      state: {
        canCancel: true,
        modelId: 'copilot-1',
        modelLabel: 'Copilot Model',
        promptText: '# Prompt',
        responseText: '',
        status: 'idle',
        templateName: 'alpha',
      },
      type: 'stencil.lmResponsePanel.state',
    });
    expect(postMessage).toHaveBeenNthCalledWith(3, {
      state: {
        canCancel: false,
        modelId: 'copilot-1',
        modelLabel: 'Copilot Model',
        promptText: '# Prompt',
        responseText: '',
        status: 'cancelled',
        templateName: 'alpha',
      },
      type: 'stencil.lmResponsePanel.state',
    });
    expect(postMessage).toHaveBeenCalledTimes(3);
  });

  it('cancels the active run when the panel is disposed', async () => {
    const cancelHandler = vi.fn();
    const { beginLmResponsePanelSession } =
      await import('../../../src/services/lmResponsePanel.js');

    const session = beginLmResponsePanelSession({
      modelId: 'copilot-1',
      modelLabel: 'Copilot Model',
      promptText: '# Prompt',
      templateName: 'alpha',
    });
    session.setCancellationHandler(cancelHandler);

    onDidDisposeCallbacks[0]?.();

    expect(cancelHandler).toHaveBeenCalledTimes(1);
  });

  it('publishes an error state and ignores later chunks after failure', async () => {
    const { beginLmResponsePanelSession } =
      await import('../../../src/services/lmResponsePanel.js');

    const session = beginLmResponsePanelSession({
      modelId: 'copilot-1',
      modelLabel: 'Copilot Model',
      promptText: '# Prompt',
      templateName: 'alpha',
    });

    session.fail('provider blocked');
    session.appendResponseChunk('ignored');

    expect(postMessage).toHaveBeenNthCalledWith(2, {
      state: {
        canCancel: false,
        errorDetails: 'provider blocked',
        modelId: 'copilot-1',
        modelLabel: 'Copilot Model',
        promptText: '# Prompt',
        responseText: '',
        status: 'error',
        templateName: 'alpha',
      },
      type: 'stencil.lmResponsePanel.state',
    });
    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  it('creates a fresh panel after the previous one is disposed', async () => {
    const { beginLmResponsePanelSession } =
      await import('../../../src/services/lmResponsePanel.js');

    beginLmResponsePanelSession({
      modelId: 'copilot-1',
      modelLabel: 'Copilot Model',
      promptText: '# Prompt',
      templateName: 'alpha',
    });
    onDidDisposeCallbacks[0]?.();

    beginLmResponsePanelSession({
      modelId: 'copilot-2',
      modelLabel: 'Copilot Model 2',
      promptText: '# Prompt 2',
      templateName: 'beta',
    });

    expect(createWebviewPanel).toHaveBeenCalledTimes(2);
  });
});
