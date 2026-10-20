// @vitest-environment node
import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertGeneratorOptions,
  generateHighEntropyPassword,
  passwordCharSet,
} from '@zero/main/generator';
import type { GeneratorOptions } from '@zero/types';

describe('generateHighEntropyPassword', () => {
  /** Atalho: só as categorias que interessam ao teste, o resto desligado. */
  function options(over: Partial<GeneratorOptions> = {}): GeneratorOptions {
    return {
      length: 24,
      useLower: false,
      countLower: 0,
      useUpper: false,
      countUpper: 0,
      useNumbers: false,
      countNumbers: 0,
      useSymbols: false,
      countSymbols: 0,
      customEntropyWords: [],
      includeCustomEntropyWords: false,
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

  it('reserva as quantidades solicitadas de cada categoria', () => {
    const password = generateHighEntropyPassword(
      options({
        length: 40,
        useLower: true,
        useUpper: true,
        useNumbers: true,
        useSymbols: true,
        countLower: 3,
        countUpper: 4,
        countNumbers: 5,
        countSymbols: 2,
      }),
    );

    expect(password).toHaveLength(40);
    expect(password.match(/[a-z]/g)?.length).toBeGreaterThanOrEqual(3);
    expect(password.match(/[A-Z]/g)?.length).toBeGreaterThanOrEqual(4);
    expect(password.match(/[0-9]/g)?.length).toBeGreaterThanOrEqual(5);
    expect(password.match(/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('inclui as palavras pessoais literalmente apenas quando solicitado', () => {
    const optionsWithWords = options({
      length: 20,
      useLower: true,
      useUpper: true,
      useNumbers: true,
      useSymbols: true,
      countLower: 1,
      countUpper: 1,
      countNumbers: 1,
      countSymbols: 1,
      customEntropyWords: ['aB', '7!'],
      includeCustomEntropyWords: true,
    });
    const password = generateHighEntropyPassword(optionsWithWords);

    expect(password).toHaveLength(20);
    expect(password.endsWith('aB7!')).toBe(true);
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
      countLower: 0,
      useUpper: false,
      countUpper: 0,
      useNumbers: false,
      countNumbers: 0,
      useSymbols: false,
      countSymbols: 0,
      customEntropyWords: [],
      includeCustomEntropyWords: false,
    };
    expect(passwordCharSet(base)).toBe('');
    expect(passwordCharSet({ ...base, useNumbers: true })).toBe('0123456789');
    expect(passwordCharSet({ ...base, useUpper: true, useNumbers: true })).toBe(
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    );
  });
});

describe('assertGeneratorOptions', () => {
  function valid(overrides: Partial<GeneratorOptions> = {}): GeneratorOptions {
    return {
      length: 40,
      useLower: true,
      countLower: 0,
      useUpper: true,
      countUpper: 0,
      useNumbers: true,
      countNumbers: 0,
      useSymbols: true,
      countSymbols: 0,
      customEntropyWords: [],
      includeCustomEntropyWords: false,
      ...overrides,
    };
  }

  it('aceita opções válidas e rejeita comprimento fora da faixa', () => {
    expect(() => assertGeneratorOptions(valid())).not.toThrow();
    for (const length of [Number.NaN, -1, 73]) {
      expect(() => assertGeneratorOptions(valid({ length }))).toThrow();
    }
  });

  it('exige booleanos em todas as opções de categoria e inclusão literal', () => {
    for (const key of [
      'useLower',
      'useUpper',
      'useNumbers',
      'useSymbols',
      'includeCustomEntropyWords',
    ] as const) {
      const options = valid();
      Object.assign(options, { [key]: 'true' });
      expect(() => assertGeneratorOptions(options)).toThrow();
    }
  });

  it('rejeita quantidades não inteiras e fora da faixa', () => {
    for (const count of [Number.NaN, -1, 73]) {
      expect(() => assertGeneratorOptions(valid({ countLower: count }))).toThrow();
    }
  });

  it('não permite reservar caracteres de uma categoria desmarcada', () => {
    const categories = [
      ['useLower', 'countLower'],
      ['useUpper', 'countUpper'],
      ['useNumbers', 'countNumbers'],
      ['useSymbols', 'countSymbols'],
    ] as const;
    for (const [enabled, count] of categories) {
      expect(() => assertGeneratorOptions(valid({ [enabled]: false, [count]: 1 }))).toThrow();
    }
  });

  it('valida a lista e o conteúdo das palavras pessoais', () => {
    const notAnArray = valid();
    Object.assign(notAnArray, { customEntropyWords: 'word' });
    expect(() => assertGeneratorOptions(notAnArray)).toThrow();
    expect(() =>
      assertGeneratorOptions(valid({ customEntropyWords: ['a', 'b', 'c', 'd', 'e', 'f'] })),
    ).toThrow();
    // cinco é o teto, e o teto é inclusivo: recusar aqui tiraria uma palavra
    // que a tela oferece
    expect(() =>
      assertGeneratorOptions(valid({ customEntropyWords: ['a', 'b', 'c', 'd', 'e'] })),
    ).not.toThrow();
    const nonStringWord = valid();
    Object.assign(nonStringWord, { customEntropyWords: ['word', 1] });
    expect(() => assertGeneratorOptions(nonStringWord)).toThrow();
  });

  it('exige palavras preenchidas quando a inclusão literal está ligada', () => {
    expect(() => assertGeneratorOptions(valid({ includeCustomEntropyWords: true }))).toThrow();
    expect(() =>
      assertGeneratorOptions(
        valid({ includeCustomEntropyWords: true, customEntropyWords: ['   '] }),
      ),
    ).toThrow();
    expect(() =>
      assertGeneratorOptions(
        valid({ includeCustomEntropyWords: true, customEntropyWords: ['word'] }),
      ),
    ).not.toThrow();
  });

  it('exige ao menos uma categoria e limita as reservas manuais a 40%', () => {
    expect(() =>
      assertGeneratorOptions(
        valid({
          useLower: false,
          useUpper: false,
          useNumbers: false,
          useSymbols: false,
        }),
      ),
    ).toThrow();
    expect(() =>
      assertGeneratorOptions(
        valid({
          countLower: 17,
          useUpper: false,
          countUpper: 0,
          useNumbers: false,
          useSymbols: false,
        }),
      ),
    ).toThrow();
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
      countLower: 0,
      useUpper: false,
      countUpper: 0,
      useNumbers: false,
      countNumbers: 0,
      useSymbols: false,
      countSymbols: 0,
      customEntropyWords: [],
      includeCustomEntropyWords: false,
    });
    expect(sorteio).toHaveBeenCalledWith(32);
  });

  it('a saída é determinística com a mesma entropia e o mesmo embaralhamento', () => {
    // Fixar o material aleatório transforma o gerador numa função: qualquer
    // deslocamento no índice do digest (começar em 1, andar de 2 em 2) ou no
    // laço de embaralhamento muda os caracteres, e o valor esperado é o que
    // separa as versões.
    vi.spyOn(crypto, 'randomBytes').mockReturnValue(Buffer.alloc(32, 0));
    vi.spyOn(crypto, 'randomInt').mockImplementation((max: number) =>
      max === 26 ? 0 : Math.floor(max / 2),
    );

    const senha = generateHighEntropyPassword({
      length: 4,
      useLower: true,
      countLower: 0,
      useUpper: false,
      countUpper: 0,
      useNumbers: false,
      countNumbers: 0,
      useSymbols: false,
      countSymbols: 0,
      customEntropyWords: [],
      includeCustomEntropyWords: false,
    });

    expect(senha).toBe('nidb');
  });

  it('sorteia a quantidade reservada dentro do conjunto daquela categoria', () => {
    // Um número reservado sai do alfabeto dos números, não do conjunto geral:
    // se o laço da categoria não rodar, o `randomInt(10)` some e a reserva vira
    // só mais um caractere sorteado entre letras e números.
    vi.spyOn(crypto, 'randomBytes').mockReturnValue(Buffer.alloc(32, 0));
    const limites: number[] = [];
    vi.spyOn(crypto, 'randomInt').mockImplementation((max: number) => {
      limites.push(max);
      return 0;
    });

    generateHighEntropyPassword({
      length: 4,
      useLower: true,
      countLower: 0,
      useUpper: false,
      countUpper: 0,
      useNumbers: true,
      countNumbers: 1,
      useSymbols: false,
      countSymbols: 0,
      customEntropyWords: [],
      includeCustomEntropyWords: false,
    });

    expect(limites).toContain(10);
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
      countLower: 0,
      useUpper: true,
      countUpper: 0,
      useNumbers: false,
      countNumbers: 0,
      useSymbols: false,
      countSymbols: 0,
      customEntropyWords: [],
      includeCustomEntropyWords: false,
    });

    expect(senha).toBe('');
    expect(bytes).not.toHaveBeenCalled();
  });
});
