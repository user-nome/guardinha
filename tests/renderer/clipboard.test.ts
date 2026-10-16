import { describe, expect, it, vi } from 'vitest';
import { copyAndAutoClear } from '@zero/renderer/clipboard';
import { installApi } from '../mocks/api.ts';
import type { ElectronApi } from '@zero/types';

describe('copyAndAutoClear', () => {
  it('delega a cópia para o proxy do processo main', async () => {
    const copy = vi.fn<(value: string) => Promise<void>>().mockResolvedValue(undefined);
    const api = installApi();
    api.clipboard.copy = copy;

    await copyAndAutoClear('senha-copiada');

    expect(copy).toHaveBeenCalledWith('senha-copiada');
  });

  it('propaga o erro do main sem copiar nada pela tela', async () => {
    const api: ElectronApi = installApi();
    api.clipboard.copy = vi
      .fn<(value: string) => Promise<void>>()
      .mockRejectedValue(new Error('bloqueado'));

    await expect(copyAndAutoClear('senha')).rejects.toThrow('bloqueado');
  });
});
