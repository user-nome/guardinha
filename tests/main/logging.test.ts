import { describe, expect, it } from 'vitest';
import { app } from '../mocks/electron.ts';
import { quietChromiumLog } from '@zero/main/logging';

/**
 * O `log-level=3` cala o log nativo do Chromium (o `atom_cache.cc` que reclama
 * dos MIME types do portal quando o clipboard do X11 é lido), e só ele: as
 * mensagens do app passam por `console`, e o driver de vídeo escreve direto no
 * stderr. Quem depura GPU/Vulkan sobe com `--log-level=0` na linha de comando e
 * o log volta inteiro, então o switch dado por fora tem de ganhar.
 */

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
    // A resposta do mock depende do nome pedido: com `true` para qualquer switch,
    // um `hasSwitch('')` passaria igual e o mutante do nome sobreviveria.
    resetMocks();
    soComLogLevel();

    quietChromiumLog();

    // quem chamou com `--log-level=0` está depurando de propósito
    expect(app.commandLine.appendSwitch).not.toHaveBeenCalled();
  });

  it('pergunta pelo switch pelo nome, e não por qualquer switch', () => {
    // Um app com outro switch na linha de comando não pode calar o log por
    // acidente: o `hasSwitch` é chamado com o nome certo.
    resetMocks();

    quietChromiumLog();

    expect(app.commandLine.hasSwitch).toHaveBeenCalledWith('log-level');
  });
});
