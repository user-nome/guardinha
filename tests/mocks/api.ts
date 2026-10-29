import { vi } from 'vitest';
import type { AuthToken, ElectronApi, PanicStatus, VaultStatus } from '@zero/types';

export const UNLOCKED: VaultStatus = {
  exists: true,
  locked: false,
  attempts: 0,
  lockUntil: null,
  lockRemainingMs: 0,
};

export const LOCKED: VaultStatus = { ...UNLOCKED, locked: true };

export const NO_PANIC: PanicStatus = { hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 };

/** Ouvintes de `vault.onAutoLocked`, para o teste disparar o push do main. */
export const autoLockedListeners: ((status: VaultStatus) => void)[] = [];

/** Espia a chamada de cancelamento feita pelo renderer no cleanup do efeito. */
export const unsubscribeAutoLock = vi.fn<() => void>();

/** Contrato completo de `window.api` nos testes; canal não exercitado rejeita em vez de passar. */
export function installApi(
  overrides: {
    status?: VaultStatus;
    entries?: ElectronApi['entries']['list'] extends () => Promise<infer T> ? T : never;
    tokens?: AuthToken[];
    language?: 'pt-BR' | 'en';
    panic?: PanicStatus;
    backup?: ElectronApi['backup'];
  } = {},
): ElectronApi {
  const unused = (): Promise<never> => Promise.reject(new Error('não usado neste teste'));
  const status = overrides.status ?? UNLOCKED;
  const entries = overrides.entries ?? [];
  autoLockedListeners.length = 0;
  unsubscribeAutoLock.mockClear();
  const backup: ElectronApi['backup'] = overrides.backup ?? {
    export: unused,
    restore: unused,
  };
  const api: ElectronApi = {
    vault: {
      status: () => Promise.resolve(status),
      create: unused,
      unlock: unused,
      resetPin: unused,
      lock: () => Promise.resolve(status),
      destroy: () => Promise.resolve({ ...status, exists: false }),
      setPanicPin: () => Promise.resolve({ ok: false, error: 'não usado', status }),
      clearPanicPin: () => Promise.resolve(status),
      setNukeLimit: () => Promise.resolve({ ok: false, error: 'não usado', status }),
      panicStatus: () => Promise.resolve(overrides.panic ?? NO_PANIC),
      onAutoLocked: vi.fn((listener: (status: VaultStatus) => void) => {
        autoLockedListeners.push(listener);
        return unsubscribeAutoLock;
      }),
    },
    openDomain: unused,
    clipboard: { copy: () => Promise.resolve() },
    entries: {
      list: () => Promise.resolve(entries),
      save: () => Promise.resolve(entries),
      remove: () => Promise.resolve([]),
    },
    authenticator: {
      list: () => Promise.resolve(overrides.tokens ?? []),
      saveUri: unused,
      save: unused,
      remove: () => Promise.resolve(overrides.tokens ?? []),
      codes: () => Promise.resolve([]),
    },
    generator: { generate: () => Promise.resolve('senha-gerada-123') },
    backup,
    settings: {
      get: () => Promise.resolve({ language: overrides.language ?? 'pt-BR' }),
      set: (next) => Promise.resolve(next),
    },
  };
  window.api = api;
  return api;
}
