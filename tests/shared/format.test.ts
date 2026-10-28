import { describe, expect, it } from 'vitest';
import { errorMessage, formatCountdown } from '@zero/shared/format';

/** Contagem regressiva da trava: valores fixos provam a divisão, não só o formato. */
describe('formatCountdown', () => {
  it('abaixo de um minuto mostra só os segundos', () => {
    expect(formatCountdown(0)).toBe('0s');
    expect(formatCountdown(1_000)).toBe('1s');
    expect(formatCountdown(30_000)).toBe('30s');
    expect(formatCountdown(59_000)).toBe('59s');
  });

  it('arredonda para cima: quem espera 1,001 s ainda não viu o segundo virar', () => {
    // É o valor que separa `/1000` de `/1001` na conta do teto.
    expect(formatCountdown(1_001)).toBe('2s');
    // 59,001 s arredonda para 60 s, que já é um minuto cheio
    expect(formatCountdown(59_001)).toBe('1:00');
  });

  it('a partir de um minuto mostra minutos e segundos com dois dígitos', () => {
    expect(formatCountdown(60_000)).toBe('1:00');
    expect(formatCountdown(65_000)).toBe('1:05');
    expect(formatCountdown(61_000)).toBe('1:01');
  });

  it('conta minutos de verdade, e não a cada 61 segundos', () => {
    // Dois minutos exatos é o que separa `/60` de `/61`.
    expect(formatCountdown(120_000)).toBe('2:00');
    expect(formatCountdown(3_600_000)).toBe('60:00');
    expect(formatCountdown(86_400_000)).toBe('1440:00');
  });
});

describe('errorMessage', () => {
  it('usa a mensagem do erro quando ela existe', () => {
    expect(errorMessage(new Error('Cofre bloqueado.'), 'padrão')).toBe('Cofre bloqueado.');
  });

  it('cai no padrão quando a mensagem do erro está vazia', () => {
    expect(errorMessage(new Error(''), 'padrão')).toBe('padrão');
  });

  it('cai no padrão quando não é Error, como a rejeição de IPC crua', () => {
    expect(errorMessage('texto solto', 'padrão')).toBe('padrão');
    expect(errorMessage(undefined, 'padrão')).toBe('padrão');
    expect(errorMessage(null, 'padrão')).toBe('padrão');
    expect(errorMessage({ message: 'objeto' }, 'padrão')).toBe('padrão');
  });
});
