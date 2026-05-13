import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('showCommandError', () => {
  const showErrorMessage = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    showErrorMessage.mockReset();

    vi.doMock('vscode', () => ({
      window: {
        showErrorMessage,
      },
    }));
  });

  it('translates StencilError instances into user-facing messages', async () => {
    const { StencilError, StencilErrorCode } = await import('../../../src/core/index.js');
    const { showCommandError } = await import('../../../src/services/errors.js');

    await showCommandError(
      new StencilError('raw storage message', StencilErrorCode.STORAGE_READ_ERROR),
    );

    expect(showErrorMessage).toHaveBeenCalledWith(
      'Stencil could not read workspace templates from .stencil/.',
    );
  });

  it('falls back to an unexpected-error message for unknown errors', async () => {
    const { showCommandError } = await import('../../../src/services/errors.js');

    await showCommandError(new Error('boom'));

    expect(showErrorMessage).toHaveBeenCalledWith('Stencil failed unexpectedly: boom');
  });

  it('exposes helper utilities for extracting user-facing error messages', async () => {
    const { getUnknownErrorMessage, getUserFacingErrorMessage } =
      await import('../../../src/services/errors.js');

    expect(getUnknownErrorMessage(new Error('boom'))).toBe('boom');
    expect(getUnknownErrorMessage('boom')).toBe('Unknown error');
    expect(getUserFacingErrorMessage(new Error('boom'))).toBe('Stencil failed unexpectedly: boom');
  });
});
