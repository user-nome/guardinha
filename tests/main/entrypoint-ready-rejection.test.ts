// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { app } from '../mocks/electron.ts';

describe('inicialização assíncrona do processo principal', () => {
  it('registra falha da inicialização sem escondê-la', async () => {
    app.whenReady.mockRejectedValueOnce(new Error('falha ao iniciar'));
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await import('@zero/main/index');
    await vi.waitFor(() => {
      expect(report).toHaveBeenCalledWith(
        'Falha ao iniciar o aplicativo:',
        expect.objectContaining({ message: 'falha ao iniciar' }),
      );
    });
  });
});
