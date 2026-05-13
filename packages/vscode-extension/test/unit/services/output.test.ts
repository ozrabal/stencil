import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('openResolvedTemplateOutput', () => {
  const openTextDocument = vi.fn();
  const showTextDocument = vi.fn();

  beforeEach(() => {
    vi.resetModules();

    openTextDocument.mockReset();
    showTextDocument.mockReset();

    vi.doMock('vscode', () => ({
      window: {
        showTextDocument,
      },
      workspace: {
        openTextDocument,
      },
    }));
  });

  it('opens the resolved body in a new untitled markdown document', async () => {
    const document = { uri: { scheme: 'untitled', toString: () => 'untitled:Stencil' } };
    openTextDocument.mockResolvedValue(document);

    const { openResolvedTemplateOutput } = await import('../../../src/services/output.js');
    const result = await openResolvedTemplateOutput('# Resolved prompt');

    expect(openTextDocument).toHaveBeenCalledWith({
      content: '# Resolved prompt',
      language: 'markdown',
    });
    expect(showTextDocument).toHaveBeenCalledWith(document);
    expect(result).toEqual({
      deliveryActionLabel: 'opened',
      deliveryTarget: 'editor',
      deliveryTargetLabel: 'new editor',
      documentUri: document.uri,
    });
  });
});
