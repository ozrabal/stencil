import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('delivery capabilities', () => {
  let clipboardWriteText: ((value: string) => Promise<void>) | undefined;
  let openTextDocument: ((options: unknown) => Promise<unknown>) | undefined;
  let showTextDocument: ((document: unknown) => Promise<unknown>) | undefined;

  beforeEach(() => {
    vi.resetModules();

    clipboardWriteText = undefined;
    openTextDocument = undefined;
    showTextDocument = undefined;

    vi.doMock('vscode', () => ({
      env: {
        clipboard: {
          get writeText() {
            return clipboardWriteText;
          },
        },
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

    expect(getDeliveryTargetCapability('editor')).toMatchObject({
      available: false,
      implemented: true,
      supportedModes: ['default'],
      target: 'editor',
    });

    openTextDocument = vi.fn();
    showTextDocument = vi.fn();

    expect(getDeliveryTargetCapability('editor')).toMatchObject({
      available: true,
      implemented: true,
      supportedModes: ['default'],
      target: 'editor',
    });
  });

  it('keeps clipboard delivery unimplemented while still probing runtime support', async () => {
    const { getDeliveryTargetCapability } =
      await import('../../../src/services/delivery/capabilities.js');

    expect(getDeliveryTargetCapability('clipboard')).toMatchObject({
      available: false,
      implemented: false,
      supportedModes: ['default', 'insert'],
      target: 'clipboard',
    });

    clipboardWriteText = vi.fn();

    expect(getDeliveryTargetCapability('clipboard')).toMatchObject({
      available: true,
      implemented: false,
      supportedModes: ['default', 'insert'],
      target: 'clipboard',
    });
  });
});
