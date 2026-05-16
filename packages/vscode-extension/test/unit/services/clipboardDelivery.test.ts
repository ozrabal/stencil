import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('clipboardDeliveryAdapter', () => {
  const writeText = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    writeText.mockReset();

    vi.doMock('vscode', () => ({
      env: {
        clipboard: {
          writeText,
        },
      },
    }));
  });

  it('copies the resolved prompt to the clipboard', async () => {
    const { clipboardDeliveryAdapter } =
      await import('../../../src/services/delivery/clipboardDelivery.js');

    const result = await clipboardDeliveryAdapter.deliver({
      chatMode: 'ask',
      mode: 'default',
      resolvedBody: '# Prompt',
      templateName: 'alpha',
    });

    expect(writeText).toHaveBeenCalledWith('# Prompt');
    expect(result).toEqual({
      deliveryActionLabel: 'copied',
      deliveryTarget: 'clipboard',
      deliveryTargetLabel: 'clipboard',
    });
  });

  it('surfaces clipboard write failures as typed delivery errors', async () => {
    writeText.mockRejectedValue(new Error('clipboard blocked'));

    const { clipboardDeliveryAdapter, ClipboardDeliveryError } =
      await import('../../../src/services/delivery/clipboardDelivery.js');

    await expect(
      clipboardDeliveryAdapter.deliver({
        chatMode: 'ask',
        mode: 'default',
        resolvedBody: '# Prompt',
        templateName: 'alpha',
      }),
    ).rejects.toEqual(
      new ClipboardDeliveryError(
        'Stencil could not copy template "alpha" to the clipboard: clipboard blocked',
      ),
    );
  });
});
