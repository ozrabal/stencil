import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('copilotChatDeliveryAdapter', () => {
  const executeCommand = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    executeCommand.mockReset();

    vi.doMock('vscode', () => ({
      commands: {
        executeCommand,
      },
    }));
  });

  it('opens Copilot Chat with an inserted partial query for default mode', async () => {
    const { copilotChatDeliveryAdapter } =
      await import('../../../src/services/delivery/copilotChatDelivery.js');

    const result = await copilotChatDeliveryAdapter.deliver({
      chatMode: 'ask',
      mode: 'default',
      resolvedBody: '# Prompt',
      templateName: 'alpha',
    });

    expect(executeCommand).toHaveBeenCalledWith('workbench.action.chat.open', {
      isPartialQuery: true,
      query: '# Prompt',
    });
    expect(result).toEqual({
      deliveryActionLabel: 'inserted',
      deliveryTarget: 'copilot-chat',
      deliveryTargetLabel: 'Copilot Chat',
    });
  });

  it('opens Copilot Chat without a partial-query flag for send mode', async () => {
    const { copilotChatDeliveryAdapter } =
      await import('../../../src/services/delivery/copilotChatDelivery.js');

    const result = await copilotChatDeliveryAdapter.deliver({
      chatMode: 'ask',
      mode: 'send',
      resolvedBody: '# Prompt',
      templateName: 'alpha',
    });

    expect(executeCommand).toHaveBeenCalledWith('workbench.action.chat.open', {
      query: '# Prompt',
    });
    expect(result).toEqual({
      deliveryActionLabel: 'sent',
      deliveryTarget: 'copilot-chat',
      deliveryTargetLabel: 'Copilot Chat',
    });
  });

  it('passes the explicit Copilot chat mode for supported non-ask runs', async () => {
    const { copilotChatDeliveryAdapter } =
      await import('../../../src/services/delivery/copilotChatDelivery.js');

    await copilotChatDeliveryAdapter.deliver({
      chatMode: 'agent',
      mode: 'insert',
      resolvedBody: '# Prompt',
      templateName: 'alpha',
    });

    expect(executeCommand).toHaveBeenCalledWith('workbench.action.chat.open', {
      isPartialQuery: true,
      mode: 'agent',
      query: '# Prompt',
    });
  });
});
