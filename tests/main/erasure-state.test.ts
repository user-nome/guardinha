// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { clearDestroyedFlag, isVaultDestroyed, markVaultDestroyed } from '@zero/main/erasure-state';

/** O estado de destruição do erase, sem `fs` para não criar ciclo com `storage.ts`. */

afterEach(() => {
  clearDestroyedFlag();
});

describe('estado de destruição do cofre', () => {
  it('começa não destruído e marca ao ser chamado', () => {
    expect(isVaultDestroyed()).toBe(false);
    markVaultDestroyed();
    expect(isVaultDestroyed()).toBe(true);
  });

  it('volta a não destruído quando o usuário cria um cofre novo', () => {
    markVaultDestroyed();
    clearDestroyedFlag();
    expect(isVaultDestroyed()).toBe(false);
  });

  it('marcar de novo não desmarca', () => {
    markVaultDestroyed();
    markVaultDestroyed();
    expect(isVaultDestroyed()).toBe(true);
  });
});
