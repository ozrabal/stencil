import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('registerOpenTemplateCommand', () => {
  const registerCommand = vi.fn();
  const openTextDocument = vi.fn();
  const showTextDocument = vi.fn();

  beforeEach(() => {
    vi.resetModules();

    registerCommand.mockReset();
    openTextDocument.mockReset();
    showTextDocument.mockReset();

    registerCommand.mockImplementation(
      (commandId: string, callback: (target?: unknown) => Promise<void>) => ({
        callback,
        commandId,
        dispose: vi.fn(),
      }),
    );

    vi.doMock('vscode', () => ({
      commands: {
        registerCommand,
      },
      window: {
        showTextDocument,
      },
      workspace: {
        openTextDocument,
      },
    }));
  });

  it('opens a template from a raw file path target', async () => {
    const document = { uri: { fsPath: '/workspace/.stencil/templates/alpha.md' } };
    openTextDocument.mockResolvedValue(document);

    const { registerOpenTemplateCommand } = await import('../../../src/commands/openTemplate.js');
    registerOpenTemplateCommand();

    await getRegisteredCommandCallback()('/workspace/.stencil/templates/alpha.md');

    expect(openTextDocument).toHaveBeenCalledWith('/workspace/.stencil/templates/alpha.md');
    expect(showTextDocument).toHaveBeenCalledWith(document);
  });

  it('opens a template from tree item metadata', async () => {
    const document = { uri: { fsPath: '/workspace/.stencil/templates/alpha.md' } };
    openTextDocument.mockResolvedValue(document);

    const { registerOpenTemplateCommand } = await import('../../../src/commands/openTemplate.js');
    registerOpenTemplateCommand();

    await getRegisteredCommandCallback()({
      description: 'Alpha description',
      kind: 'template',
      source: 'project',
      templateFilePath: '/workspace/.stencil/templates/alpha.md',
      templateName: 'alpha',
    });

    expect(openTextDocument).toHaveBeenCalledWith('/workspace/.stencil/templates/alpha.md');
    expect(showTextDocument).toHaveBeenCalledWith(document);
  });

  it('ignores unsupported targets', async () => {
    const { registerOpenTemplateCommand } = await import('../../../src/commands/openTemplate.js');
    registerOpenTemplateCommand();

    await getRegisteredCommandCallback()({ kind: 'group' });

    expect(openTextDocument).not.toHaveBeenCalled();
    expect(showTextDocument).not.toHaveBeenCalled();
  });

  function getRegisteredCommandCallback(): (target?: unknown) => Promise<void> {
    return registerCommand.mock.calls[0][1];
  }
});
