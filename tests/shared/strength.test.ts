// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { evaluateMaster, evaluatePassword, evaluatePhrase, evaluatePin } from '@zero/shared';

const GOOD_MASTER = 'Xk9#mQ2$vLp8!Rt4&Wy6^Zn1';
const GOOD_PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';

describe('evaluatePin', () => {
  it('bloqueia só o PIN degenerado', () => {
    expect(evaluatePin('12345678')).toMatchObject({ blocked: true, level: 'veryWeak' });
    expect(evaluatePin('87654321')).toMatchObject({ blocked: true });
    expect(evaluatePin('00000000')).toMatchObject({ blocked: true, reasons: ['allSame'] });
    expect(evaluatePin('12121212')).toMatchObject({ blocked: true, reasons: ['repeatedBlock'] });
  });

  it('avisa sobre data e variedade baixa sem bloquear', () => {
    const birthdate = evaluatePin('01011990');
    expect(birthdate).toMatchObject({ blocked: false, level: 'veryWeak' });
    expect(birthdate.reasons).toContain('dateLike');
    expect(birthdate.reasons).toContain('lowVariety');

    const lowVariety = evaluatePin('11223344');
    expect(lowVariety).toMatchObject({ blocked: false });
    expect(lowVariety.reasons).toContain('lowVariety');
  });

  it('PIN comum passa sem motivo e nunca passa de "razoável"', () => {
    const pin = evaluatePin('49201733');
    expect(pin).toMatchObject({ blocked: false, reasons: [] });
    expect(pin.score).toBeLessThanOrEqual(2);
    expect(evaluatePin('70391842').score).toBeLessThanOrEqual(2);
  });

  it('entrada incompleta ou com letra não bloqueia (formato é validado à parte)', () => {
    expect(evaluatePin('').blocked).toBe(false);
    expect(evaluatePin('1234').blocked).toBe(false);
    expect(evaluatePin('492017ab').blocked).toBe(false);
    expect(evaluatePin('492017ab').level).toBe('veryWeak');
  });
});

describe('evaluateMaster / evaluatePassword', () => {
  it('bloqueia repetição, bloco repetido e sequência longa', () => {
    const allSame = evaluateMaster('aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(allSame).toMatchObject({ blocked: true, level: 'veryWeak' });
    expect(allSame.reasons).toContain('allSame');
    expect(evaluateMaster('abcdefghijklabcdefghijkl')).toMatchObject({ blocked: true });
    expect(evaluateMaster('123456789012345678901234')).toMatchObject({ blocked: true });
    expect(evaluateMaster('abcdefghijklmnopqrstuvwx')).toMatchObject({ blocked: true });
  });

  it('avisa sem bloquear a senha previsível mas não degenerada', () => {
    const weak = evaluateMaster('senha-mestra-guardinha24');
    expect(weak.blocked).toBe(false);
    expect(weak.reasons).toContain('commonWord');
    expect(weak.level).toBe('weak');
  });

  it('senha aleatória de 24 caracteres sai como muito forte', () => {
    const strong = evaluateMaster(GOOD_MASTER);
    expect(strong).toMatchObject({ blocked: false, level: 'veryStrong', score: 4 });
    expect(strong.reasons).toEqual([]);
  });

  it('credencial curta ou vazia não bloqueia (só informa)', () => {
    expect(evaluatePassword('')).toMatchObject({ blocked: false, level: 'veryWeak', score: 0 });
    expect(evaluatePassword('1234').blocked).toBe(false);
    expect(evaluatePassword('password').blocked).toBe(false);
    expect(evaluatePassword('password').reasons).toContain('commonWord');
  });

  it('sinaliza uma data de oito dígitos dentro de uma senha', () => {
    expect(evaluatePassword('Xk9#mQ2$vLp8!Rt4&Wy6^19900101').reasons).toContain('dateLike');
  });
});

describe('evaluatePhrase', () => {
  it('bloqueia a frase cuas palavras se repetem demais', () => {
    const sameWord = evaluatePhrase('casa '.repeat(12));
    expect(sameWord).toMatchObject({ blocked: true, level: 'veryWeak' });
    expect(sameWord.reasons).toContain('fewUniqueWords');
    expect(sameWord.reasons).toContain('repeatedWords');

    const twoWords = evaluatePhrase('casa bola '.repeat(6));
    expect(twoWords.blocked).toBe(true);
    expect(twoWords.reasons).toContain('fewUniqueWords');
    expect(twoWords.reasons).toContain('repeatedWords');
  });

  it('frase com poucas palavras distintas avisa, mas passa', () => {
    const fiveUnique = evaluatePhrase(
      'casa bolo gato peixe livro casa bolo gato peixe livro casa bolo',
    );
    expect(fiveUnique.blocked).toBe(false);
    expect(fiveUnique.reasons).toContain('fewUniqueWords');
    expect(fiveUnique.reasons).toContain('repeatedWords');
  });

  it('frase bem escrita passa limpa', () => {
    const phrase = evaluatePhrase(GOOD_PHRASE);
    expect(phrase).toMatchObject({ blocked: false, level: 'veryStrong' });
    expect(phrase.reasons).toEqual([]);
  });

  it('frase incompleta não é bloqueada nem criticada', () => {
    const partial = evaluatePhrase('apenas tres palavras');
    expect(partial).toMatchObject({ blocked: false });
    expect(partial.reasons).not.toContain('fewUniqueWords');
  });

  it('frase só de espaço é o mesmo que frase vazia: nada a medir', () => {
    // colar só espaço é o mesmo que vazio: não é "muito fraca" nem repetição
    for (const frase of ['', '   ', '\n\t ']) {
      const resultado = evaluatePhrase(frase);
      expect(resultado, JSON.stringify(frase)).toMatchObject({
        blocked: false,
        level: 'veryWeak',
        score: 0,
        reasons: [],
      });
    }
  });
});

/** Tabelas que pinam nota e motivos em cima de cada degrau: trocar um número muda a resposta. */

describe('as faixas de bits da senha', () => {
  it('cada degrau da régua cai no lado certo', () => {
    // 6 minúsculas dão 28,2 bits e 13 com maiúscula 74,1: cada valor fica colado num degrau
    expect(evaluatePassword('xqzmvj').score).toBe(1);
    expect(evaluatePassword('qwe7xzm').score).toBe(2);
    expect(evaluatePassword('xqzmvjkw').score).toBe(2);
    expect(evaluatePassword('XqZmVjKwErtYuZ').score).toBe(3);
    expect(evaluatePassword(GOOD_MASTER).score).toBe(4);
  });

  it('cada corte da régua deixa o valor exato do lado de cima', () => {
    // 40 distintas põem 162, 160 e 149 exatamente em 28, 36 e 80 bits, no lado de cima
    const frase = (total: number): string =>
      Array.from({ length: total }, (_, i) => `xyz${String((i % 40) + 1).padStart(3, '0')}`).join(
        ' ',
      );

    expect(evaluatePhrase(frase(162)).score).toBe(1);
    expect(evaluatePhrase(frase(160)).score).toBe(2);
    expect(evaluatePhrase(frase(149)).score).toBe(4);
  });

  it('a nota 3 vira 4 só no último degrau', () => {
    // 13 caracteres com duas categorias dão 74 bits: forte, e não "muito forte"
    const forte = evaluatePassword('XqZmVjKwErtYuZ');
    expect(forte).toMatchObject({ level: 'strong', score: 3 });
  });

  it('só maiúsculas também conta como uma categoria só', () => {
    // O contador soma um por classe; sem as maiúsculas, uma senha só de maiúsculas passaria.
    expect(evaluatePassword('XKQMZVBW').reasons).toContain('fewKinds');
  });

  it('contar categorias erradas muda a nota de uma senha forte', () => {
    // 12 caracteres em duas categorias dão 68,4 bits; um a mais no contador derrubaria a nota.
    expect(evaluatePassword('XqZmVjKwErtYu')).toMatchObject({ score: 3, reasons: [] });
    expect(evaluatePassword('xqzmvjkw').reasons).toContain('fewKinds');
  });
});

describe('bloco repetido: o que a suíte chama de degenerado', () => {
  it('acha o bloco de 2, de 3 e de 4 caracteres', () => {
    // Os três casos caem em laços diferentes: `size` em 2, o teto `len / 2` e o bloco inteiro.
    for (const senha of ['abababab', 'abcabcab', 'abcdabcd']) {
      const r = evaluatePassword(senha);
      expect(r.blocked).toBe(true);
      expect(r.reasons).toContain('repeatedBlock');
    }
  });

  it('o nome de cada motivo é o que a tela mostra', () => {
    // `sequence` e `lowVariety` são chaves de mensagem: vazias, a tela fica sem explicação.
    expect(evaluatePassword('abcd').reasons).toContain('sequence');
    expect(evaluatePassword('abcdefgh').reasons).toContain('sequence');
    expect(evaluatePassword('xqzmvjxq').reasons).toContain('lowVariety');
  });
});

describe('o PIN e os degraus da régua curta', () => {
  it('quatro dígitos distintos dão exatamente 16 bits', () => {
    // 8 × log2(4) = 16 é o degrau entre "muito fraco" e "razoável", o único ponto que fixa os dois.
    expect(evaluatePin('13571357')).toMatchObject({ score: 1, level: 'weak' });
  });

  it('oito dígitos distintos dão exatamente 24 bits, o topo do PIN', () => {
    expect(evaluatePin('90753146')).toMatchObject({ score: 2, level: 'fair' });
    expect(evaluatePin('90753146').score).toBeLessThanOrEqual(2);
  });

  it('a sequência de 8 dígitos vale 8 bits, não os 24 dos seus dígitos distintos', () => {
    // O corte da sequência vale antes do cálculo: oito dígitos em ordem é o PIN mais previsível.
    expect(evaluatePin('12345678')).toMatchObject({
      score: 0,
      blocked: true,
      reasons: ['sequence'],
    });
  });

  it('três dígitos distintos não são bloco repetido', () => {
    // O degrau é `distinct <= 2`: com três distintos o motivo é variedade baixa.
    expect(evaluatePin('12312312').reasons).toEqual(['lowVariety']);
  });

  it('cinco dígitos distintos já não são variedade baixa', () => {
    expect(evaluatePin('11223340').reasons).toEqual([]);
  });

  it('PIN com letra avisa poucas categorias e zera a nota', () => {
    expect(evaluatePin('492017ab').reasons).toEqual(['fewKinds']);
    expect(evaluatePin('492017ab').score).toBe(0);
  });

  it('o corte de data vale para o PIN que é data', () => {
    // 4 dígitos distintos dão 16 bits e a data derruba para 15, o degrau entre as duas notas.
    expect(evaluatePin('12011999').score).toBe(0);
    expect(evaluatePin('12011999').reasons).toContain('dateLike');
  });
});

describe('a data dentro de um PIN', () => {
  it('as bordas de ano, mês e dia continuam sendo data', () => {
    // 1900, 2099, mês 12 e dia 31 são as bordas exatas: estreitar qualquer uma corta o PIN.
    expect(evaluatePin('01011900').reasons).toContain('dateLike');
    expect(evaluatePin('01012099').reasons).toContain('dateLike');
    expect(evaluatePin('12121999').reasons).toContain('dateLike');
    expect(evaluatePin('31121999').reasons).toContain('dateLike');
  });

  it('dia 32 não é dia, e mês 13 não é mês', () => {
    // A faixa é `day <= 31` e `month <= 12`: alargar transformaria qualquer número em data.
    expect(evaluatePin('32121999').reasons).not.toContain('dateLike');
    expect(evaluatePin('01131999').reasons).not.toContain('dateLike');
  });

  it('o recorte é DDMMAAAA, e também AAAA MMDD', () => {
    // Duas formas aceitas: '12011999' usa as duas primeiras duplas; '19900112' só a segunda.
    expect(evaluatePin('12011999').reasons).toContain('dateLike');
    expect(evaluatePin('19900112').reasons).toContain('dateLike');
  });

  it('número com mais de oito dígitos não vira data', () => {
    // A forma tem exatamente oito dígitos: um ID de 10 com ano plausível viraria data.
    expect(evaluatePin('1990010112').reasons).not.toContain('dateLike');
  });
});

describe('a régua da frase de recuperação', () => {
  const palavras = (...w: string[]): string => w.join(' ');

  it('oito palavras distintas em doze não avisam nada', () => {
    // O degrau é `unique < 8`: com oito distintas a frase já tem variedade de sobra.
    expect(
      evaluatePhrase(
        palavras(
          'zebra',
          'quartz',
          'xiboia',
          'manguim',
          'nociva',
          'uva',
          'pera',
          'manga',
          'zebra',
          'quartz',
          'xiboia',
          'manguim',
        ),
      ),
    ).toMatchObject({ score: 4, reasons: [] });
  });

  it('sete palavras distintas ainda avisam', () => {
    expect(
      evaluatePhrase(
        palavras(
          'zebra',
          'quartz',
          'xiboia',
          'manguim',
          'nociva',
          'uva',
          'pera',
          'zebra',
          'quartz',
          'xiboia',
          'manguim',
          'nociva',
        ),
      ).reasons,
    ).toContain('fewUniqueWords');
  });

  it('quatro palavras distintas em doze bloqueiam a frase', () => {
    // O piso `unique <= 4` é fechado: quatro distintas com repetição separam fraca de recusada.
    expect(
      evaluatePhrase(
        palavras(
          'zebra',
          'quartz',
          'xiboia',
          'manguim',
          'zebra',
          'quartz',
          'xiboia',
          'manguim',
          'zebra',
          'quartz',
          'xiboia',
          'manguim',
        ),
      ),
    ).toMatchObject({ blocked: true, score: 0 });
  });

  it('palavra repetida duas vezes ainda não é repetição', () => {
    // O degrau é três repetições: duas são طبيعي em português.
    expect(
      evaluatePhrase(
        palavras(
          'zebra',
          'quartz',
          'xiboia',
          'manguim',
          'nociva',
          'uva',
          'pera',
          'manga',
          'kiwi',
          'lima',
          'abacaxi',
          'zebra',
        ),
      ).reasons,
    ).not.toContain('repeatedWords');
  });

  it('metade das palavras comuns derruba a nota para o degrau de cima', () => {
    // Seis de doze palavras da lista comum: a frase vale, mas metade é adivinhável por dicionário.
    expect(
      evaluatePhrase(
        palavras(
          'casa',
          'bola',
          'gato',
          'livro',
          'sol',
          'rio',
          'zebra',
          'quartz',
          'xiboia',
          'manguim',
          'nociva',
          'uva',
        ),
      ),
    ).toMatchObject({ score: 3, reasons: ['commonWord'] });
  });

  it('cinco de doze palavras comuns ainda não contam como metade', () => {
    // O degrau é `commonCount * 2 >= total`: cinco de doze dá 10 contra 12, a borda do aviso.
    expect(
      evaluatePhrase(
        palavras(
          'casa',
          'bola',
          'gato',
          'livro',
          'sol',
          'zebra',
          'quartz',
          'xiboia',
          'manguim',
          'nociva',
          'uva',
          'pera',
        ),
      ).reasons,
    ).not.toContain('commonWord');
  });

  it('quatro palavras, todas comuns, avisam mesmo com a frase curta', () => {
    // `total >= 4`: frase de duas palavras não gasta o nome do aviso.
    expect(evaluatePhrase(palavras('casa', 'bola', 'gato', 'livro')).reasons).toContain(
      'commonWord',
    );
  });

  it('palavra média de três letras exatos é o degrau das palavras curtas', () => {
    // A média fecha em 3,0 e o corte é `<= 3`: a única forma de estar na borda sem degenerar.
    expect(
      evaluatePhrase(
        palavras(
          'xyz',
          'abc',
          'qwe',
          'asd',
          'zxc',
          'ewq',
          'plm',
          'okm',
          'jkl',
          'bnm',
          'vfg',
          'cxz',
        ),
      ),
    ).toMatchObject({ score: 2, reasons: ['shortWords'] });
  });

  it('palavra média de quatro letras exatos passa limpa', () => {
    expect(
      evaluatePhrase(
        palavras(
          'xyza',
          'abca',
          'qwea',
          'asda',
          'zxca',
          'ewqa',
          'plma',
          'okma',
          'jkla',
          'bnma',
          'vfga',
          'cxza',
        ),
      ),
    ).toMatchObject({ score: 4, reasons: [] });
  });

  it('quatro palavras curtas avisam mesmo com a frase curta', () => {
    expect(evaluatePhrase(palavras('a', 'b', 'c', 'd')).reasons).toContain('shortWords');
  });

  it('os bits crescem com a variedade, não com o total de palavras', () => {
    // 12 palavras distintas dão 12 × 12,9 bits; cinco distintas e sete repetidas pagam o desconto.
    const distintas = evaluatePhrase(
      palavras(
        'zebra',
        'quartz',
        'xiboia',
        'manguim',
        'nociva',
        'uva',
        'pera',
        'manga',
        'kiwi',
        'lima',
        'abacaxi',
        'jujuba',
      ),
    );
    const repetidas = evaluatePhrase(
      palavras(
        'zebra',
        'quartz',
        'xiboia',
        'manguim',
        'nociva',
        'zebra',
        'quartz',
        'xiboia',
        'manguim',
        'nociva',
        'zebra',
        'quartz',
      ),
    );
    expect(distintas.score).toBe(4);
    expect(repetidas.score).toBe(2);
  });
});
