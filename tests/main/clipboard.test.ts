// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { SecureClipboardProxy } from '@zero/main/clipboard';
import { clipboard } from '../mocks/electron.ts';

describe('SecureClipboardProxy', () => {
  let proxy: SecureClipboardProxy;

  beforeEach(() => {
    vi.useFakeTimers();
    clipboard.writeText.mockClear().mockResolvedValue(undefined);
    clipboard.readText.mockReset().mockResolvedValue('');
    proxy = new SecureClipboardProxy();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('limpa o clipboard 30 s depois quando o valor não mudou', async () => {
    clipboard.readText.mockResolvedValue('senha-copiada');
    await proxy.copy('senha-copiada');
    expect(clipboard.writeText).toHaveBeenLastCalledWith('senha-copiada');

    await vi.advanceTimersByTimeAsync(29_999);
    expect(clipboard.writeText).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(clipboard.writeText).toHaveBeenLastCalledWith('');
  });

  it('preserva o clipboard se o usuário copiou outra coisa antes da limpeza', async () => {
    clipboard.readText.mockResolvedValue('outra-coisa');
    await proxy.copy('senha');

    await vi.advanceTimersByTimeAsync(30_000);
    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(clipboard.writeText).not.toHaveBeenCalledWith('');
  });

  it('limpa mesmo sem conseguir ler o clipboard', async () => {
    clipboard.readText.mockRejectedValue(new Error('leitura negada'));
    await proxy.copy('senha');

    await vi.advanceTimersByTimeAsync(30_000);
    expect(clipboard.writeText).toHaveBeenLastCalledWith('');
  });

  it('uma cópia nova reprograma a limpeza', async () => {
    clipboard.readText.mockResolvedValue('senha-b');
    await proxy.copy('senha-a');
    await vi.advanceTimersByTimeAsync(20_000);
    await proxy.copy('senha-b');

    await vi.advanceTimersByTimeAsync(15_000);
    expect(clipboard.writeText).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(clipboard.writeText).toHaveBeenLastCalledWith('');
  });

  it('dispose limpa na hora e cancela a limpeza pendente', async () => {
    clipboard.readText.mockResolvedValue('senha');
    await proxy.copy('senha');

    await proxy.dispose();
    expect(clipboard.writeText).toHaveBeenLastCalledWith('');

    // e o temporizador cancelado não repete a limpeza
    await vi.advanceTimersByTimeAsync(30_000);
    expect(clipboard.writeText).toHaveBeenCalledTimes(2);
  });

  it('dispose preserva o clipboard quando o usuário já copiou outra coisa', async () => {
    await proxy.copy('senha');
    clipboard.readText.mockResolvedValue('outra-coisa');

    await proxy.dispose();

    expect(clipboard.writeText).not.toHaveBeenCalledWith('');
    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
  });

  it('dispose sem nada copiado não escreve no clipboard', async () => {
    await proxy.dispose();
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });
});

describe('o temporizador do clipboard', () => {
  let proxy: SecureClipboardProxy;

  beforeEach(() => {
    vi.useFakeTimers();
    clipboard.writeText.mockClear().mockResolvedValue(undefined);
    clipboard.readText.mockReset().mockResolvedValue('');
    proxy = new SecureClipboardProxy();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // `clearTimeout(null)` é no-op: cancelar sem temporizador pendente só aparece na chamada.
  function spyClear(): MockInstance<typeof globalThis.clearTimeout> {
    return vi.spyOn(globalThis, 'clearTimeout');
  }

  it('copiar duas vezes cancela o temporizador da primeira', async () => {
    const clear = spyClear();
    await proxy.copy('senha-a');

    await proxy.copy('senha-b');

    // uma vez só, e com o temporizador da primeira cópia (não `null`)
    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear.mock.calls[0]?.[0]).not.toBeNull();
  });

  it('dispose sem temporizador pendente não chama clearTimeout', async () => {
    const clear = spyClear();

    await proxy.dispose();

    expect(clear).not.toHaveBeenCalled();
  });

  it('depois que a limpeza disparou não sobra temporizador para cancelar', async () => {
    clipboard.readText.mockResolvedValue('senha');
    await proxy.copy('senha');
    await vi.advanceTimersByTimeAsync(30_000);
    const clear = spyClear();

    await proxy.dispose();

    expect(clear).not.toHaveBeenCalled();
  });
});
