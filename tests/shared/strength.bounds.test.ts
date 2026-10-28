// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { evaluatePassword, evaluatePin } from '@zero/shared';

/** Bordas da régua: cada corte tem dois lados, e a nota 0..4 esconde o valor bruto. */

describe('a régua da senha: os cortes', () => {
  it('oito em ponto já é sequência, e trava', () => {
    // O corte é `run >= 8`: oito trava e cai a 10 bits; sete só avisa e cai a 30 bits.
    const oito = evaluatePassword('bcdefghi');
    expect(oito.reasons).toContain('sequence');
    expect(oito.blocked).toBe(true);
    expect(oito.score).toBe(0);
    expect(evaluatePassword('bcdefgh').score).toBe(1);
  });

  it('uma categoria só avisa poucas categorias', () => {
    // O corte é `kinds <= 1`: uma categoria só avisa, duas categorias juntas não.
    expect(evaluatePassword('90736152').reasons).toContain('fewKinds');
    expect(evaluatePassword('!@#$%^&*').reasons).toContain('fewKinds');
    expect(evaluatePassword('a1b2c3').reasons).not.toContain('fewKinds');
  });

  it('seis caracteres já bastam para a senha de uma categoria só', () => {
    // O corte tem duas partes (`length >= 6` e `kinds <= 1`): com cinco ainda não avisa.
    expect(evaluatePassword('aabbcc').reasons).toContain('fewKinds');
    expect(evaluatePassword('aabb').reasons).not.toContain('fewKinds');
  });

  it('sete caracteres distintos ainda não são variedade baixa', () => {
    // O corte é `distinct <= 6`: com sete distintos o aviso só faria trocar caracteres à toa.
    expect(evaluatePassword('a1b2c3a1').reasons).toContain('lowVariety');
    expect(evaluatePassword('a1b2c3d1').reasons).not.toContain('lowVariety');
  });

  it('o bloco repetido só conta até doze caracteres', () => {
    // O bloco conta até doze caracteres: maior que isso é padrão, e doze ainda conta.
    expect(evaluatePassword('abcdefghijklabcdefghijkl').reasons).toContain('repeatedBlock');
    expect(evaluatePassword('abcdefghijklmabcdefghijklm').reasons).not.toContain('repeatedBlock');
  });

  it('três em ponto não é sequência', () => {
    // A sequência começa em quatro: três letras em ponto é só coincidência.
    expect(evaluatePassword('abc').reasons).not.toContain('sequence');
    expect(evaluatePassword('cba').reasons).not.toContain('sequence');
    expect(evaluatePassword('xabc').reasons).not.toContain('sequence');
    expect(evaluatePassword('xcba').reasons).not.toContain('sequence');
  });
});

describe('a data dentro do PIN: o recorte', () => {
  it('o dia e o mês saem das duplas certas, não de qualquer posição', () => {
    // '19900130' só é data em AAAAMMDD: dia '30' e mês '01' nas duplas certas.
    expect(evaluatePin('19900130').reasons).toContain('dateLike');
  });

  it('o mês 13 no formato AAAA MMDD não é mês', () => {
    // '19901301' tem ano e dia plausíveis em AAAAMMDD, mas mês 13 não é mês.
    expect(evaluatePin('19901301').reasons).not.toContain('dateLike');
  });
});
