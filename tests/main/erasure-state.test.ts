// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { clearDestroyedFlag, isVaultDestroyed, markVaultDestroyed } from '@zero/main/erasure-state';

/**
 * O estado de destruição do Cryptographic Erase. É um módulo de três funções
 * sem `fs` justamente para que `storage.ts` (que se recusa a escrever depois do
 * erase) e `erase.ts` (que marca) leiam a mesma verdade sem ciclo de importação.
 * O que ele segura é a promessa de que nenhum caminho de read-modify-write
 * recrie o `vault.zkv` pela metade depois da destruição.
 */

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
