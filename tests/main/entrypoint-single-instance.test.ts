// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { app } from '../mocks/electron.ts';

describe('lock de instância única', () => {
  it('encerra quando outra instância já detém o lock', async () => {
    app.requestSingleInstanceLock.mockReturnValue(false);

    await import('@zero/main/index');

    expect(app.quit).toHaveBeenCalledOnce();
    expect(app.whenReady).not.toHaveBeenCalled();
  });
});
