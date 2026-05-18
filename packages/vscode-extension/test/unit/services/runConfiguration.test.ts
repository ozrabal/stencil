import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('runConfiguration', () => {
  const getConfiguration = vi.fn();
  const getDeliveryTargetCapability = vi.fn();

  beforeEach(() => {
    vi.resetModules();

    getConfiguration.mockReset();
    getDeliveryTargetCapability.mockReset();

    getConfiguration.mockReturnValue({
      get: vi.fn((key: string) => {
        const values: Record<string, unknown> = {};
        return values[key];
      }),
    });
    getDeliveryTargetCapability.mockResolvedValue({
      available: true,
      implemented: true,
      supportedChatModes: ['ask', 'edit', 'agent'],
      supportedModes: ['default', 'insert', 'send'],
      target: 'copilot-chat',
    });

    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration,
      },
    }));

    vi.doMock('../../../src/services/delivery/capabilities.js', () => ({
      getDeliveryTargetCapability,
    }));
  });

  it('resolves editor defaults without chat mode dependencies', async () => {
    mockStencilRunSettings({
      'run.defaultMode': 'default',
      'run.defaultTarget': 'editor',
    });

    const { getResolvedRunConfiguration } =
      await import('../../../src/services/runConfiguration.js');
    const result = await getResolvedRunConfiguration();

    expect(result).toEqual({
      defaultProfile: {
        chatMode: 'ask',
        deliveryTarget: 'editor',
        mode: 'default',
      },
      lastUsedScope: 'session',
      selectionBehavior: 'defaults',
      warnings: [],
    });
    expect(getDeliveryTargetCapability).not.toHaveBeenCalled();
  });

  it('normalizes Copilot default mode to insert and preserves a supported chat mode', async () => {
    mockStencilRunSettings({
      'run.defaultChatMode': 'edit',
      'run.defaultMode': 'default',
      'run.defaultTarget': 'copilot-chat',
    });

    const { getResolvedRunConfiguration } =
      await import('../../../src/services/runConfiguration.js');
    const result = await getResolvedRunConfiguration();

    expect(result.defaultProfile).toEqual({
      chatMode: 'edit',
      deliveryTarget: 'copilot-chat',
      mode: 'insert',
    });
    expect(result.warnings).toEqual([
      'Stencil run settings requested mode "default" for target "copilot-chat"; using "insert".',
    ]);
  });

  it('normalizes lm-api default mode to execute', async () => {
    mockStencilRunSettings({
      'run.defaultMode': 'default',
      'run.defaultTarget': 'lm-api',
    });

    const { getResolvedRunConfiguration } =
      await import('../../../src/services/runConfiguration.js');
    const result = await getResolvedRunConfiguration();

    expect(result.defaultProfile).toEqual({
      chatMode: 'ask',
      deliveryTarget: 'lm-api',
      mode: 'execute',
    });
    expect(result.warnings).toEqual([
      'Stencil run settings requested mode "default" for target "lm-api"; using "execute".',
    ]);
  });

  it('normalizes clipboard defaults to default mode without capability lookups', async () => {
    mockStencilRunSettings({
      'run.defaultMode': 'default',
      'run.defaultTarget': 'clipboard',
    });

    const { getResolvedRunConfiguration } =
      await import('../../../src/services/runConfiguration.js');
    const result = await getResolvedRunConfiguration();

    expect(result.defaultProfile).toEqual({
      chatMode: 'ask',
      deliveryTarget: 'clipboard',
      mode: 'default',
    });
    expect(result.warnings).toEqual([]);
    expect(getDeliveryTargetCapability).not.toHaveBeenCalled();
  });

  it('normalizes invalid target-mode combinations to safe defaults', async () => {
    mockStencilRunSettings({
      'run.defaultMode': 'send',
      'run.defaultTarget': 'editor',
    });

    const { getResolvedRunConfiguration } =
      await import('../../../src/services/runConfiguration.js');
    const result = await getResolvedRunConfiguration();

    expect(result.defaultProfile).toEqual({
      chatMode: 'ask',
      deliveryTarget: 'editor',
      mode: 'default',
    });
    expect(result.warnings).toEqual([
      'Stencil run settings requested mode "send" is invalid for target "editor"; using "default".',
    ]);
  });

  it('falls back to a supported Copilot chat mode when settings request an unavailable one', async () => {
    mockStencilRunSettings({
      'run.defaultChatMode': 'agent',
      'run.defaultTarget': 'copilot-chat',
    });
    getDeliveryTargetCapability.mockResolvedValue({
      available: true,
      implemented: true,
      supportedChatModes: ['ask'],
      supportedModes: ['default', 'insert', 'send'],
      target: 'copilot-chat',
    });

    const { getResolvedRunConfiguration } =
      await import('../../../src/services/runConfiguration.js');
    const result = await getResolvedRunConfiguration();

    expect(result.defaultProfile).toEqual({
      chatMode: 'ask',
      deliveryTarget: 'copilot-chat',
      mode: 'insert',
    });
    expect(result.warnings).toEqual([
      'Stencil run settings requested mode "default" for target "copilot-chat"; using "insert".',
      'Stencil run settings requested chat mode "agent" is unavailable for target "copilot-chat"; using "ask".',
    ]);
  });

  it('falls back to documented defaults for invalid enum settings', async () => {
    mockStencilRunSettings({
      'run.defaultChatMode': 'invalid',
      'run.defaultMode': 'invalid',
      'run.defaultTarget': 'invalid',
      'run.lastUsedScope': 'invalid',
      'run.selectionBehavior': 'invalid',
    });

    const { getResolvedRunConfiguration } =
      await import('../../../src/services/runConfiguration.js');
    const result = await getResolvedRunConfiguration();

    expect(result.defaultProfile).toEqual({
      chatMode: 'ask',
      deliveryTarget: 'copilot-chat',
      mode: 'insert',
    });
    expect(result.lastUsedScope).toBe('session');
    expect(result.selectionBehavior).toBe('defaults');
    expect(result.warnings).toEqual([
      'Stencil stencil.run.defaultTarget must be one of: editor, copilot-chat, lm-api, clipboard. Using "copilot-chat".',
      'Stencil stencil.run.defaultMode must be one of: default, execute, insert, send. Using "default".',
      'Stencil stencil.run.defaultChatMode must be one of: agent, ask, edit. Using "ask".',
      'Stencil stencil.run.lastUsedScope must be one of: global, session, workspace. Using "session".',
      'Stencil stencil.run.selectionBehavior must be one of: defaults, last-used, picker. Using "defaults".',
      'Stencil run settings requested mode "default" for target "copilot-chat"; using "insert".',
    ]);
  });

  it('normalizes last-used profiles with source-specific warnings', async () => {
    getDeliveryTargetCapability.mockResolvedValue({
      available: true,
      implemented: true,
      supportedChatModes: ['ask'],
      supportedModes: ['default', 'insert', 'send'],
      target: 'copilot-chat',
    });

    const { normalizeRunProfile } = await import('../../../src/services/runConfiguration.js');
    const warnings: string[] = [];
    const result = await normalizeRunProfile(
      {
        chatMode: 'agent',
        deliveryTarget: 'copilot-chat',
        mode: 'default',
      },
      warnings,
      'last-used profile',
    );

    expect(result).toEqual({
      chatMode: 'ask',
      deliveryTarget: 'copilot-chat',
      mode: 'insert',
    });
    expect(warnings).toEqual([
      'Stencil last-used profile requested mode "default" for target "copilot-chat"; using "insert".',
      'Stencil last-used profile requested chat mode "agent" is unavailable for target "copilot-chat"; using "ask".',
    ]);
  });

  it('reads preference-only settings with the same enum validation rules', async () => {
    mockStencilRunSettings({
      'run.lastUsedScope': 'invalid',
      'run.selectionBehavior': 'invalid',
    });

    const { getRunPreferenceConfiguration } =
      await import('../../../src/services/runConfiguration.js');
    const result = getRunPreferenceConfiguration();

    expect(result).toEqual({
      lastUsedScope: 'session',
      selectionBehavior: 'defaults',
      warnings: [
        'Stencil stencil.run.lastUsedScope must be one of: global, session, workspace. Using "session".',
        'Stencil stencil.run.selectionBehavior must be one of: defaults, last-used, picker. Using "defaults".',
      ],
    });
  });

  function mockStencilRunSettings(values: Record<string, unknown>): void {
    getConfiguration.mockReturnValue({
      get: vi.fn((key: string) => values[key]),
    });
  }
});
