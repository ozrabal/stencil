import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('pickRunProfile', () => {
  const getDeliveryTargetCapability = vi.fn();
  const showQuickPick = vi.fn();

  beforeEach(() => {
    vi.resetModules();

    getDeliveryTargetCapability.mockReset();
    showQuickPick.mockReset();

    vi.doMock('vscode', () => ({
      window: {
        showQuickPick,
      },
    }));

    vi.doMock('../../../src/services/delivery/capabilities.js', () => ({
      getDeliveryTargetCapability,
    }));
  });

  it('omits unavailable Copilot and LM entries', async () => {
    mockCapabilities({
      clipboard: {
        available: false,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'clipboard',
      },
      'copilot-chat': {
        available: false,
        implemented: true,
        supportedChatModes: ['ask'],
        supportedModes: ['default', 'insert', 'send'],
        target: 'copilot-chat',
      },
      editor: {
        available: true,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'editor',
      },
      'lm-api': {
        available: false,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['execute'],
        target: 'lm-api',
      },
    });
    showQuickPick.mockResolvedValue(undefined);

    const { pickRunProfile } = await import('../../../src/services/runProfilePicker.js');
    await pickRunProfile();

    expect(showQuickPick).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          label: 'Editor',
        }),
      ],
      {
        placeHolder: 'Select a run target or mode',
        title: 'Stencil: Run Template With Mode...',
      },
    );
  });

  it('lists insert and send entries when Copilot only supports ask', async () => {
    mockCapabilities({
      clipboard: {
        available: true,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'clipboard',
      },
      'copilot-chat': {
        available: true,
        implemented: true,
        supportedChatModes: ['ask'],
        supportedModes: ['default', 'insert', 'send'],
        target: 'copilot-chat',
      },
      editor: {
        available: true,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'editor',
      },
      'lm-api': {
        available: false,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['execute'],
        target: 'lm-api',
      },
    });
    showQuickPick.mockResolvedValue(undefined);

    const { pickRunProfile } = await import('../../../src/services/runProfilePicker.js');
    await pickRunProfile();

    expect(showQuickPick.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ label: 'Editor' }),
      expect.objectContaining({ label: 'Clipboard' }),
      expect.objectContaining({ label: 'Copilot Chat' }),
      expect.objectContaining({ label: 'Copilot Chat (Send)' }),
    ]);
  });

  it('adds chat-mode entries when Copilot supports ask, edit, and agent', async () => {
    mockCapabilities({
      clipboard: {
        available: true,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'clipboard',
      },
      'copilot-chat': {
        available: true,
        implemented: true,
        supportedChatModes: ['ask', 'edit', 'agent'],
        supportedModes: ['default', 'insert', 'send'],
        target: 'copilot-chat',
      },
      editor: {
        available: true,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'editor',
      },
      'lm-api': {
        available: false,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['execute'],
        target: 'lm-api',
      },
    });
    showQuickPick.mockResolvedValue(undefined);

    const { pickRunProfile } = await import('../../../src/services/runProfilePicker.js');
    await pickRunProfile();

    expect(showQuickPick.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ label: 'Editor' }),
      expect.objectContaining({ label: 'Clipboard' }),
      expect.objectContaining({ label: 'Copilot Chat' }),
      expect.objectContaining({ label: 'Copilot Chat (Send)' }),
      expect.objectContaining({ label: 'Copilot Chat: Ask' }),
      expect.objectContaining({ label: 'Copilot Chat: Edit' }),
      expect.objectContaining({ label: 'Copilot Chat: Agent' }),
    ]);
  });

  it('includes the language model entry only when the target is available', async () => {
    mockCapabilities({
      clipboard: {
        available: false,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'clipboard',
      },
      'copilot-chat': {
        available: false,
        implemented: true,
        supportedChatModes: ['ask'],
        supportedModes: ['default', 'insert', 'send'],
        target: 'copilot-chat',
      },
      editor: {
        available: true,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'editor',
      },
      'lm-api': {
        available: true,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['execute'],
        target: 'lm-api',
      },
    });
    showQuickPick.mockResolvedValue({
      label: 'Language Model',
      profile: {
        chatMode: 'ask',
        deliveryTarget: 'lm-api',
        mode: 'execute',
      },
    });

    const { pickRunProfile } = await import('../../../src/services/runProfilePicker.js');
    await expect(pickRunProfile()).resolves.toEqual({
      chatMode: 'ask',
      deliveryTarget: 'lm-api',
      mode: 'execute',
    });
  });

  it('returns undefined when the picker is cancelled', async () => {
    mockCapabilities({
      clipboard: {
        available: false,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'clipboard',
      },
      'copilot-chat': {
        available: false,
        implemented: true,
        supportedChatModes: ['ask'],
        supportedModes: ['default', 'insert', 'send'],
        target: 'copilot-chat',
      },
      editor: {
        available: true,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'editor',
      },
      'lm-api': {
        available: false,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['execute'],
        target: 'lm-api',
      },
    });
    showQuickPick.mockResolvedValue(undefined);

    const { pickRunProfile } = await import('../../../src/services/runProfilePicker.js');
    await expect(pickRunProfile()).resolves.toBeUndefined();
  });

  it('returns undefined without opening the picker when no targets are available', async () => {
    mockCapabilities({
      clipboard: {
        available: false,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'clipboard',
      },
      'copilot-chat': {
        available: false,
        implemented: true,
        supportedChatModes: ['ask'],
        supportedModes: ['default', 'insert', 'send'],
        target: 'copilot-chat',
      },
      editor: {
        available: false,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'editor',
      },
      'lm-api': {
        available: false,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['execute'],
        target: 'lm-api',
      },
    });

    const { pickRunProfile } = await import('../../../src/services/runProfilePicker.js');
    await expect(pickRunProfile()).resolves.toBeUndefined();

    expect(showQuickPick).not.toHaveBeenCalled();
  });

  it('returns a clipboard profile when the clipboard entry is selected', async () => {
    mockCapabilities({
      clipboard: {
        available: true,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'clipboard',
      },
      'copilot-chat': {
        available: false,
        implemented: true,
        supportedChatModes: ['ask'],
        supportedModes: ['default', 'insert', 'send'],
        target: 'copilot-chat',
      },
      editor: {
        available: true,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['default'],
        target: 'editor',
      },
      'lm-api': {
        available: false,
        implemented: true,
        supportedChatModes: [],
        supportedModes: ['execute'],
        target: 'lm-api',
      },
    });
    showQuickPick.mockResolvedValue({
      label: 'Clipboard',
      profile: {
        chatMode: 'ask',
        deliveryTarget: 'clipboard',
        mode: 'default',
      },
    });

    const { pickRunProfile } = await import('../../../src/services/runProfilePicker.js');
    await expect(pickRunProfile()).resolves.toEqual({
      chatMode: 'ask',
      deliveryTarget: 'clipboard',
      mode: 'default',
    });
  });

  function mockCapabilities(capabilities: Record<string, Record<string, unknown>>): void {
    getDeliveryTargetCapability.mockImplementation(async (target: string) => capabilities[target]);
  }
});
