import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('RunPreferenceStore', () => {
  const globalState = {
    get: vi.fn(),
    update: vi.fn(),
  };
  const workspaceState = {
    get: vi.fn(),
    update: vi.fn(),
  };

  beforeEach(() => {
    globalState.get.mockReset();
    globalState.update.mockReset();
    workspaceState.get.mockReset();
    workspaceState.update.mockReset();

    globalState.update.mockResolvedValue(undefined);
    workspaceState.update.mockResolvedValue(undefined);
  });

  it('stores and retrieves a session profile in memory only', async () => {
    const { RunPreferenceStore } = await import('../../../src/services/runPreferenceStore.js');
    const store = new RunPreferenceStore({ globalState, workspaceState });
    const profile = {
      chatMode: 'ask' as const,
      deliveryTarget: 'copilot-chat' as const,
      mode: 'insert' as const,
    };

    await store.setLastUsedProfile('session', profile);

    expect(store.getLastUsedProfile('session')).toEqual(profile);
    expect(globalState.update).not.toHaveBeenCalled();
    expect(workspaceState.update).not.toHaveBeenCalled();
  });

  it('persists a workspace profile through workspaceState', async () => {
    const profile = {
      chatMode: 'ask' as const,
      deliveryTarget: 'editor' as const,
      mode: 'default' as const,
    };
    workspaceState.get.mockReturnValue(profile);

    const { RunPreferenceStore } = await import('../../../src/services/runPreferenceStore.js');
    const store = new RunPreferenceStore({ globalState, workspaceState });

    expect(store.getLastUsedProfile('workspace')).toEqual(profile);
    await store.setLastUsedProfile('workspace', profile);

    expect(workspaceState.update).toHaveBeenCalledWith('stencil.run.lastUsedProfile', profile);
  });

  it('persists a global profile through globalState', async () => {
    const profile = {
      chatMode: 'ask' as const,
      deliveryTarget: 'lm-api' as const,
      mode: 'execute' as const,
    };
    globalState.get.mockReturnValue(profile);

    const { RunPreferenceStore } = await import('../../../src/services/runPreferenceStore.js');
    const store = new RunPreferenceStore({ globalState, workspaceState });

    expect(store.getLastUsedProfile('global')).toEqual(profile);
    await store.setLastUsedProfile('global', profile);

    expect(globalState.update).toHaveBeenCalledWith('stencil.run.lastUsedProfile', profile);
  });

  it('ignores invalid stored state', async () => {
    globalState.get.mockReturnValue({
      deliveryTarget: 'copilot-chat',
      mode: 'insert',
    });

    const { RunPreferenceStore } = await import('../../../src/services/runPreferenceStore.js');
    const store = new RunPreferenceStore({ globalState, workspaceState });

    expect(store.getLastUsedProfile('global')).toBeUndefined();
  });
});
