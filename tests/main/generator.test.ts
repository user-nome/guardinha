// @vitest-environment node
import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateHighEntropyPassword, passwordCharSet } from '@zero/main/generator';
import type { GeneratorOptions } from '@zero/types';

describe('generateHighEntropyPassword', () => {
  /** Atalho: só as categorias que interessam ao teste, o resto desligado. */
  function options(over: Partial<GeneratorOptions> = {}): GeneratorOptions {
    return {
      length: 24,
      useLower: false,
      useUpper: false,
      useNumbers: false,
      useSymbols: false,
      customEntropyWords: [],
      ...over,
    };
  }

  it('respeita o tamanho e o conjunto de caracteres', () => {
    const password = generateHighEntropyPassword(
      options({
        length: 32,
        useLower: true,
        useUpper: true,
        useNumbers: true,
        useSymbols: true,
        customEntropyWords: ['fusca', '77'],
      }),
    );
    expect(password).toHaveLength(32);
    expect(password).toMatch(/^[a-zA-Z0-9!@#$%^&*()_+\-=[\]{}|;:,.<>?]+$/);
  });

  it('só maiúsculas sai só com maiúsculas', () => {
    const password = generateHighEntropyPassword(options({ length: 40, useUpper: true }));
    expect(password).toHaveLength(40);
    expect(password).toMatch(/^[A-Z]+$/);
  });

  it('só minúsculas sai só com minúsculas', () => {
    const password = generateHighEntropyPassword(options({ length: 40, useLower: true }));
    expect(password).toHaveLength(40);
    expect(password).toMatch(/^[a-z]+$/);
  });

  it('só números sai só com números', () => {
    const password = generateHighEntropyPassword(options({ length: 40, useNumbers: true }));
    expect(password).toHaveLength(40);
    expect(password).toMatch(/^[0-9]+$/);
  });

  it('só símbolos sai só com símbolos', () => {
    const password = generateHighEntropyPassword(options({ length: 40, useSymbols: true }));
    expect(password).toHaveLength(40);
    expect(password).toMatch(/^[!@#$%^&*()_+\-=[\]{}|;:,.<>?]+$/);
  });

  it('nenhuma categoria marcada não gera senha', () => {
    expect(generateHighEntropyPassword(options({ length: 16 }))).toBe('');
  });

  it('comprimento 0 devolve vazio', () => {
    expect(generateHighEntropyPassword(options({ length: 0, useUpper: true }))).toBe('');
  });

  it('comprimento 1 devolve um caractere, e não vazio', () => {
    // A guarda é `length <= 0`: em 1 o gerador tem de sortear, senão o medidor
    // de força da tela mostra uma senha que não existe.
    const senha = generateHighEntropyPassword(options({ length: 1, useLower: true }));
    expect(senha).toHaveLength(1);
    expect(senha).toMatch(/^[a-z]$/);
  });

  it('palavras pessoais mudam a distribuição sem quebrar o formato', () => {
    const withWords = generateHighEntropyPassword(
      options({
        length: 40,
        useLower: true,
        useUpper: true,
        useNumbers: true,
        useSymbols: true,
        customEntropyWords: ['violao', 'sofa'],
      }),
    );
    const withoutWords = generateHighEntropyPassword(
      options({ length: 40, useLower: true, useUpper: true, useNumbers: true, useSymbols: true }),
    );
    expect(withWords).toHaveLength(40);
    expect(withoutWords).toHaveLength(40);
    expect(withWords).toMatch(/^[a-zA-Z0-9!@#$%^&*()_+\-=[\]{}|;:,.<>?]+$/);
    expect(withoutWords).toMatch(/^[a-zA-Z0-9!@#$%^&*()_+\-=[\]{}|;:,.<>?]+$/);
  });
});

describe('passwordCharSet', () => {
  it('junta só as categorias marcadas', () => {
    const base: GeneratorOptions = {
      length: 8,
      useLower: false,
      useUpper: false,
      useNumbers: false,
      useSymbols: false,
      customEntropyWords: [],
    };
    expect(passwordCharSet(base)).toBe('');
    expect(passwordCharSet({ ...base, useNumbers: true })).toBe('0123456789');
    expect(passwordCharSet({ ...base, useUpper: true, useNumbers: true })).toBe(
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    );
  });
});

/**
 * O que o gerador consome da fonte de entropia. O formato da saída já é
 * conferido acima; aqui a suíte fixa o material aleatório que entra e que um
 * pedido vazio não chega a acionar o gerador.
 */
describe('entropia do gerador', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mistura exatamente 32 bytes (256 bits) de aleatoriedade do sistema', () => {
    // Os 32 bytes entram no resumo pessoal e não aparecem no resultado, então
    // um byte a mais ou a menos muda o material derivado sem mudar o formato; o
    // que separa as duas versões é o argumento da chamada.
    const sorteio = vi.spyOn(crypto, 'randomBytes');
    generateHighEntropyPassword({
      length: 12,
      useLower: true,
      useUpper: false,
      useNumbers: false,
      useSymbols: false,
      customEntropyWords: [],
    });
    expect(sorteio).toHaveBeenCalledWith(32);
  });

  it('comprimento 0 corta antes de acionar o gerador aleatório', () => {
    // A guarda é `length <= 0`: em zero o laço não roda e a saída já seria ''
    // de qualquer jeito, então o que separa a guarda da falta dela é o trabalho
    // que ela evita. Relaxada para `< 0`, zero cairia no sorteio e a chamada
    // abaixo aconteceria, em vez de a função sair de imediato.
    const bytes = vi.spyOn(crypto, 'randomBytes').mockImplementation(() => {
      throw new Error('o gerador não deveria sortear para comprimento 0');
    });

    const senha = generateHighEntropyPassword({
      length: 0,
      useLower: false,
      useUpper: true,
      useNumbers: false,
      useSymbols: false,
      customEntropyWords: [],
    });

    expect(senha).toBe('');
    expect(bytes).not.toHaveBeenCalled();
  });
});
