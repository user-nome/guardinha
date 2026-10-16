// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentMessages } from '@zero/main/i18n';
import { IDLE_LOCK_MS } from '@zero/main/activity';
import { VaultSessionManager, vaultSession } from '@zero/main/session';

describe('VaultSessionManager (Singleton)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vaultSession().wipe();
  });

  afterEach(() => {
    vaultSession().wipe();
    vi.useRealTimers();
  });

  it('há uma única instância para todo o processo', () => {
    expect(vaultSession()).toBe(VaultSessionManager.getInstance());
    expect(vaultSession()).toBe(vaultSession());
  });

  it('a chave só existe depois do adopt; sem ela o requireKey responde cofre bloqueado', () => {
    expect(vaultSession().isUnlocked()).toBe(false);
    expect(() => vaultSession().requireKey()).toThrow(currentMessages().errors.vaultLocked);

    const key = Buffer.alloc(32, 7);
    vaultSession().adopt(key);
    expect(vaultSession().requireKey()).toBe(key);
    expect(vaultSession().keyOrNull()).toBe(key);
  });

  it('wipe zera a chave na memória e cancela o auto-lock', () => {
    const key = Buffer.alloc(32, 7);
    vaultSession().adopt(key);

    vaultSession().wipe();

    expect(vaultSession().isUnlocked()).toBe(false);
    expect(key.every((byte) => byte === 0)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('adopt substitui a chave anterior e zera a que saiu', () => {
    const oldKey = Buffer.alloc(32, 1);
    vaultSession().adopt(oldKey);
    const newKey = Buffer.alloc(32, 2);
    vaultSession().adopt(newKey);

    expect(vaultSession().requireKey()).toBe(newKey);
    expect(oldKey.every((byte) => byte === 0)).toBe(true);
  });

  it('auto-lock zera a chave 5 minutos depois da última operação', () => {
    const key = Buffer.alloc(32, 7);
    vaultSession().adopt(key);

    vi.advanceTimersByTime(IDLE_LOCK_MS - 1);
    expect(vaultSession().isUnlocked()).toBe(true);

    vi.advanceTimersByTime(1);
    expect(vaultSession().isUnlocked()).toBe(false);
    expect(key.every((byte) => byte === 0)).toBe(true);
  });

  it('touch rearma a trava automática', () => {
    vaultSession().adopt(Buffer.alloc(32, 7));

    vi.advanceTimersByTime(IDLE_LOCK_MS - 1000);
    vaultSession().touch();
    vi.advanceTimersByTime(IDLE_LOCK_MS - 1000);
    expect(vaultSession().isUnlocked()).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(vaultSession().isUnlocked()).toBe(false);
  });

  it('touch não rearma nada com o cofre bloqueado', () => {
    vaultSession().touch();
    expect(vaultSession().isUnlocked()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
