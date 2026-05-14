import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('lmApiDeliveryAdapter', () => {
  class MockLanguageModelError extends Error {
    static Blocked(message = 'Blocked') {
      return new MockLanguageModelError('Blocked', message);
    }

    static NoPermissions(message = 'NoPermissions') {
      return new MockLanguageModelError('NoPermissions', message);
    }

    static NotFound(message = 'NotFound') {
      return new MockLanguageModelError('NotFound', message);
    }

    constructor(
      readonly code: string,
      message: string,
      readonly cause?: unknown,
    ) {
      super(message);
    }
  }

  class MockCancellationTokenSource {
    readonly token = {
      isCancellationRequested: false,
    };

    cancel() {
      this.token.isCancellationRequested = true;
    }

    dispose() {}
  }

  const selectChatModels = vi.fn();
  const userMessage = vi.fn();
  const beginLmResponsePanelSession = vi.fn();
  const appendResponseChunk = vi.fn();
  const cancel = vi.fn();
  const complete = vi.fn();
  const fail = vi.fn();
  const sendRequest = vi.fn();
  const setCancellationHandler = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    selectChatModels.mockReset();
    userMessage.mockReset();
    beginLmResponsePanelSession.mockReset();
    appendResponseChunk.mockReset();
    cancel.mockReset();
    complete.mockReset();
    fail.mockReset();
    sendRequest.mockReset();
    setCancellationHandler.mockReset();

    beginLmResponsePanelSession.mockReturnValue({
      appendResponseChunk,
      cancel,
      complete,
      fail,
      setCancellationHandler,
    });

    vi.doMock('vscode', () => ({
      CancellationTokenSource: MockCancellationTokenSource,
      LanguageModelChatMessage: {
        User: userMessage,
      },
      LanguageModelError: MockLanguageModelError,
      lm: {
        selectChatModels,
      },
    }));

    vi.doMock('../../../src/services/lmResponsePanel.js', () => ({
      beginLmResponsePanelSession,
    }));
  });

  it('streams the first compatible model response into the panel', async () => {
    selectChatModels.mockResolvedValue([
      {
        id: 'copilot-1',
        name: 'Copilot Model',
        sendRequest,
      },
    ]);
    userMessage.mockReturnValue({ content: '# Prompt', role: 'user' });
    sendRequest.mockResolvedValue({
      text: toAsyncIterable(['Hello', ' world']),
    });

    const { lmApiDeliveryAdapter } =
      await import('../../../src/services/delivery/lmApiDelivery.js');
    const result = await lmApiDeliveryAdapter.deliver({
      chatMode: 'ask',
      mode: 'execute',
      resolvedBody: '# Prompt',
      templateName: 'alpha',
    });

    expect(selectChatModels).toHaveBeenCalledWith({ vendor: 'copilot' });
    expect(userMessage).toHaveBeenCalledWith('# Prompt');
    expect(beginLmResponsePanelSession).toHaveBeenCalledWith({
      modelId: 'copilot-1',
      modelLabel: 'Copilot Model',
      promptText: '# Prompt',
      templateName: 'alpha',
    });
    expect(setCancellationHandler).toHaveBeenCalledTimes(2);
    expect(setCancellationHandler).toHaveBeenNthCalledWith(1, expect.any(Function));
    expect(sendRequest).toHaveBeenCalledWith(
      [{ content: '# Prompt', role: 'user' }],
      {
        justification: 'Run the resolved Stencil template through the selected language model.',
      },
      expect.objectContaining({ isCancellationRequested: false }),
    );
    expect(appendResponseChunk).toHaveBeenNthCalledWith(1, 'Hello');
    expect(appendResponseChunk).toHaveBeenNthCalledWith(2, ' world');
    expect(complete).toHaveBeenCalled();
    expect(setCancellationHandler).toHaveBeenLastCalledWith(undefined);
    expect(result).toEqual({
      deliveryActionLabel: 'streamed',
      deliveryTarget: 'lm-api',
      deliveryTargetLabel: 'Stencil LM response panel',
      panelTitle: 'Stencil Language Model Response',
      surfaceLabel: 'Stencil LM response panel',
    });
  });

  it('marks the panel as failed when the request rejects', async () => {
    const error = MockLanguageModelError.NoPermissions();
    selectChatModels.mockResolvedValue([
      {
        id: 'copilot-1',
        name: 'Copilot Model',
        sendRequest,
      },
    ]);
    userMessage.mockReturnValue({ content: '# Prompt', role: 'user' });
    sendRequest.mockRejectedValue(error);

    const { lmApiDeliveryAdapter } =
      await import('../../../src/services/delivery/lmApiDelivery.js');

    await expect(
      lmApiDeliveryAdapter.deliver({
        chatMode: 'ask',
        mode: 'execute',
        resolvedBody: '# Prompt',
        templateName: 'alpha',
      }),
    ).rejects.toThrow(
      'Stencil Language Model execution requires permission before it can send this request. Grant access and try again.',
    );

    expect(fail).toHaveBeenCalledWith(
      'Stencil Language Model execution requires permission before it can send this request. Grant access and try again.',
    );
    expect(complete).not.toHaveBeenCalled();
  });

  it('cancels the active request when the panel asks to cancel', async () => {
    let cancelHandler: (() => void) | undefined;

    setCancellationHandler.mockImplementation((handler: (() => void) | undefined) => {
      cancelHandler = handler;
    });
    selectChatModels.mockResolvedValue([
      {
        id: 'copilot-1',
        name: 'Copilot Model',
        sendRequest,
      },
    ]);
    userMessage.mockReturnValue({ content: '# Prompt', role: 'user' });
    sendRequest.mockImplementation(async () => {
      cancelHandler?.();
      throw new Error('cancelled');
    });

    const { lmApiDeliveryAdapter, LmApiDeliveryCancelledError } =
      await import('../../../src/services/delivery/lmApiDelivery.js');

    await expect(
      lmApiDeliveryAdapter.deliver({
        chatMode: 'ask',
        mode: 'execute',
        resolvedBody: '# Prompt',
        templateName: 'alpha',
      }),
    ).rejects.toBeInstanceOf(LmApiDeliveryCancelledError);

    expect(cancel).toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('fails clearly when the selected model no longer exists at send time', async () => {
    selectChatModels.mockResolvedValue([{ id: 'copilot-1', name: 'Copilot Model', sendRequest }]);

    const { lmApiDeliveryAdapter } =
      await import('../../../src/services/delivery/lmApiDelivery.js');

    await expect(
      lmApiDeliveryAdapter.deliver({
        chatMode: 'ask',
        mode: 'execute',
        resolvedBody: '# Prompt',
        selectedModelId: 'copilot-2',
        templateName: 'alpha',
      }),
    ).rejects.toThrow(
      'Stencil could not find the selected language model "copilot-2". Retry the command and choose a different model.',
    );
  });
});

async function* toAsyncIterable(chunks: string[]): AsyncIterable<string> {
  for (const chunk of chunks) {
    yield chunk;
  }
}
