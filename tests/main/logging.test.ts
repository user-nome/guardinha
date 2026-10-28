import { describe, expect, it } from 'vitest';
import { app } from '../mocks/electron.ts';
import { quietChromiumLog } from '@zero/main/logging';

/** `log-level=3` cala só o log nativo do Chromium; um `--log-level` dado por fora ganha. */

function resetMocks(): void {
  app.commandLine.appendSwitch.mockClear();
  app.commandLine.hasSwitch.mockReset().mockReturnValue(false);
}

/** Só o switch que o app usa responde `true`, e o resto responde `false`. */
function soComLogLevel(): void {
  app.commandLine.hasSwitch.mockImplementation((name: string) => name === 'log-level');
}

describe('log do Chromium', () => {
  it('rebaixa o log nativo para só FATAL', () => {
    resetMocks();

    quietChromiumLog();

    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('log-level', '3');
  });

  it('respeita o --log-level que veio na linha de comando', () => {
    // com `true` para qualquer switch, um `hasSwitch('')` passaria e o mutante do nome sobreviveria
    resetMocks();
    soComLogLevel();

    quietChromiumLog();

    // quem chamou com `--log-level=0` está depurando de propósito
    expect(app.commandLine.appendSwitch).not.toHaveBeenCalled();
  });

  it('pergunta pelo switch pelo nome, e não por qualquer switch', () => {
    // outro switch na linha de comando não pode calar o log por acidente: o nome importa
    resetMocks();

    quietChromiumLog();

    expect(app.commandLine.hasSwitch).toHaveBeenCalledWith('log-level');
  });
});
