import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('delivery capabilities', () => {
  let clipboardWriteText: ((value: string) => Promise<void>) | undefined;
  let getCommands: ((filterInternal?: boolean) => Thenable<string[]>) | undefined;
  let openTextDocument: ((options: unknown) => Promise<unknown>) | undefined;
  let showTextDocument: ((document: unknown) => Promise<unknown>) | undefined;
  let version: string;

  beforeEach(() => {
    vi.resetModules();

    clipboardWriteText = undefined;
    getCommands = undefined;
    openTextDocument = undefined;
    showTextDocument = undefined;
    version = '1.100.0';

    vi.doMock('vscode', () => ({
      commands: {
        get getCommands() {
          return getCommands;
        },
      },
      env: {
        clipboard: {
          get writeText() {
            return clipboardWriteText;
          },
        },
      },
      get version() {
        return version;
      },
      window: {
        get showTextDocument() {
          return showTextDocument;
        },
      },
      workspace: {
        get openTextDocument() {
          return openTextDocument;
        },
      },
    }));
  });

  it('reports editor delivery as available only when the editor APIs exist', async () => {
    const { getDeliveryTargetCapability } =
      await import('../../../src/services/delivery/capabilities.js');

    await expect(getDeliveryTargetCapability('editor')).resolves.toMatchObject({
      available: false,
      implemented: true,
      supportedChatModes: [],
      supportedModes: ['default'],
      target: 'editor',
    });

    openTextDocument = vi.fn();
    showTextDocument = vi.fn();

    await expect(getDeliveryTargetCapability('editor')).resolves.toMatchObject({
      available: true,
      implemented: true,
      supportedChatModes: [],
      supportedModes: ['default'],
      target: 'editor',
    });
  });

  it('keeps clipboard delivery unimplemented while still probing runtime support', async () => {
    const { getDeliveryTargetCapability } =
      await import('../../../src/services/delivery/capabilities.js');

    await expect(getDeliveryTargetCapability('clipboard')).resolves.toMatchObject({
      available: false,
      implemented: false,
      supportedChatModes: [],
      supportedModes: ['default', 'insert'],
      target: 'clipboard',
    });

    clipboardWriteText = vi.fn();

    await expect(getDeliveryTargetCapability('clipboard')).resolves.toMatchObject({
      available: true,
      implemented: false,
      supportedChatModes: [],
      supportedModes: ['default', 'insert'],
      target: 'clipboard',
    });
  });

  it('reports Copilot Chat as available with full chat-mode support on supported runtimes', async () => {
    const { getDeliveryTargetCapability } =
      await import('../../../src/services/delivery/capabilities.js');

    getCommands = vi.fn().mockResolvedValue(['workbench.action.chat.open']);

    await expect(getDeliveryTargetCapability('copilot-chat')).resolves.toMatchObject({
      available: true,
      implemented: true,
      supportedChatModes: ['ask', 'edit', 'agent'],
      supportedModes: ['default', 'insert', 'send'],
      target: 'copilot-chat',
    });
  });

  it('reports Copilot Chat ask-only support on older runtimes', async () => {
    const { getDeliveryTargetCapability } =
      await import('../../../src/services/delivery/capabilities.js');

    version = '1.99.0';
    getCommands = vi.fn().mockResolvedValue(['workbench.action.chat.open']);

    await expect(getDeliveryTargetCapability('copilot-chat')).resolves.toMatchObject({
      available: true,
      implemented: true,
      supportedChatModes: ['ask'],
      supportedModes: ['default', 'insert', 'send'],
      target: 'copilot-chat',
    });
  });

  it('reports Copilot Chat as unavailable when the chat-open command is missing', async () => {
    const { getDeliveryTargetCapability } =
      await import('../../../src/services/delivery/capabilities.js');

    getCommands = vi.fn().mockResolvedValue([]);

    await expect(getDeliveryTargetCapability('copilot-chat')).resolves.toMatchObject({
      available: false,
      implemented: true,
      supportedChatModes: ['ask', 'edit', 'agent'],
      supportedModes: ['default', 'insert', 'send'],
      target: 'copilot-chat',
      unavailableReason:
        'Copilot Chat is unavailable because VS Code did not expose workbench.action.chat.open.',
    });
  });
});
