import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('delivery capabilities', () => {
  let clipboardWriteText: ((value: string) => Promise<void>) | undefined;
  let getCommands: ((filterInternal?: boolean) => Thenable<string[]>) | undefined;
  let selectChatModels:
    | ((selector: { vendor?: string }) => Thenable<Array<Record<string, unknown>>>)
    | undefined;
  let openTextDocument: ((options: unknown) => Promise<unknown>) | undefined;
  let showTextDocument: ((document: unknown) => Promise<unknown>) | undefined;
  let version: string;

  beforeEach(() => {
    vi.resetModules();

    clipboardWriteText = undefined;
    getCommands = undefined;
    selectChatModels = undefined;
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
      lm: {
        get selectChatModels() {
          return selectChatModels;
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

  it('reports clipboard delivery as available only when clipboard APIs exist', async () => {
    const { getDeliveryTargetCapability } =
      await import('../../../src/services/delivery/capabilities.js');

    await expect(getDeliveryTargetCapability('clipboard')).resolves.toMatchObject({
      available: false,
      implemented: true,
      supportedChatModes: [],
      supportedModes: ['default'],
      target: 'clipboard',
    });

    clipboardWriteText = vi.fn();

    await expect(getDeliveryTargetCapability('clipboard')).resolves.toMatchObject({
      available: true,
      implemented: true,
      supportedChatModes: [],
      supportedModes: ['default'],
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

  it('reports lm-api as unavailable when the VS Code runtime does not expose model selection', async () => {
    const { getDeliveryTargetCapability } =
      await import('../../../src/services/delivery/capabilities.js');

    await expect(getDeliveryTargetCapability('lm-api')).resolves.toMatchObject({
      available: false,
      implemented: true,
      supportedChatModes: [],
      supportedModes: ['execute'],
      target: 'lm-api',
      unavailableReason:
        'Stencil Language Model execution is unavailable because this VS Code runtime does not expose vscode.lm.selectChatModels.',
    });
  });

  it('reports lm-api as unavailable when no compatible Copilot-backed models are returned', async () => {
    const { getDeliveryTargetCapability } =
      await import('../../../src/services/delivery/capabilities.js');

    selectChatModels = vi.fn().mockResolvedValue([]);

    await expect(getDeliveryTargetCapability('lm-api')).resolves.toMatchObject({
      available: false,
      implemented: true,
      supportedChatModes: [],
      supportedModes: ['execute'],
      target: 'lm-api',
      unavailableReason:
        'Stencil Language Model execution is unavailable because no compatible Copilot-backed chat model is available.',
    });
    expect(selectChatModels).toHaveBeenCalledWith({ vendor: 'copilot' });
  });

  it('reports lm-api as available when a compatible Copilot-backed model exists', async () => {
    const { getDeliveryTargetCapability } =
      await import('../../../src/services/delivery/capabilities.js');

    selectChatModels = vi.fn().mockResolvedValue([{ id: 'copilot-chat-1' }]);

    await expect(getDeliveryTargetCapability('lm-api')).resolves.toMatchObject({
      available: true,
      implemented: true,
      supportedChatModes: [],
      supportedModes: ['execute'],
      target: 'lm-api',
    });
    expect(selectChatModels).toHaveBeenCalledWith({ vendor: 'copilot' });
  });
});
