// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { evaluatePassword, evaluatePin } from '@zero/shared';

/**
 * As bordas da régua de força. A régua é uma sequência de decisões com cortes
 * exatos (oito em ponto, seis caracteres, seis caracteres distintos), e cada
 * corte tem dois lados: o que está do lado de dentro e o que está do lado de
 * fora precisam dar notas diferentes. Um corte afrouxado ou apertado por um
 * transforma "muito fraco" em "razoável" sem que ninguém perceba, porque a
 * nota final é uma escala de 0 a 4 e esconde o valor bruto.
 *
 * Os testes fixam o motivo (`reasons`) e a trava (`blocked`), que são as saídas
 * que a tela mostra, e não a nota bruta, que ninguém vê.
 */

describe('a régua da senha: os cortes', () => {
  it('oito em ponto já é sequência, e trava', () => {
    // O corte é `run >= 8`: com oito a senha trava e cai no degrau mais baixo
    // (a sequência derruba a nota para 10 bits), com sete ainda é só um
    // trecho, que derruba para 30 bits. São dois degraus de diferença.
    const oito = evaluatePassword('bcdefghi');
    expect(oito.reasons).toContain('sequence');
    expect(oito.blocked).toBe(true);
    expect(oito.score).toBe(0);
    expect(evaluatePassword('bcdefgh').score).toBe(1);
  });

  it('uma categoria só avisa poucas categorias', () => {
    // O corte é `kinds <= 1`: uma senha só de dígitos ou só de símbolos avisa,
    // e uma que junta duas categorias não. Cada categoria conta uma vez, e é
    // essa contagem que decide o aviso.
    expect(evaluatePassword('90736152').reasons).toContain('fewKinds');
    expect(evaluatePassword('!@#$%^&*').reasons).toContain('fewKinds');
    expect(evaluatePassword('a1b2c3').reasons).not.toContain('fewKinds');
  });

  it('seis caracteres já bastam para a senha de uma categoria só', () => {
    // O corte tem duas partes: `length >= 6` e `kinds <= 1`. Com cinco
    // caracteres a senha está incompleta e não avisa nada; com seis, avisa.
    expect(evaluatePassword('aabbcc').reasons).toContain('fewKinds');
    expect(evaluatePassword('aabb').reasons).not.toContain('fewKinds');
  });

  it('sete caracteres distintos ainda não são variedade baixa', () => {
    // O corte é `distinct <= 6`: com sete distintos a senha já varia o
    // bastante, e o aviso aqui faria o usuário trocar caracteres à toa.
    expect(evaluatePassword('a1b2c3a1').reasons).toContain('lowVariety');
    expect(evaluatePassword('a1b2c3d1').reasons).not.toContain('lowVariety');
  });

  it('o bloco repetido só conta até doze caracteres', () => {
    // O bloco degenerado tem no máximo doze caracteres: um bloco maior é
    // padrão, não repetição. E um bloco de doze ainda conta, senão o corte
    // viraria "onze" sem ninguém perceber.
    expect(evaluatePassword('abcdefghijklabcdefghijkl').reasons).toContain('repeatedBlock');
    expect(evaluatePassword('abcdefghijklmabcdefghijklm').reasons).not.toContain('repeatedBlock');
  });

  it('três em ponto não é sequência', () => {
    // A sequência começa em quatro: três letras em ponto é só coincidência.
    // O contador de cada direção começa em um, e um a mais faz a sequência
    // aparecer onde não tem.
    expect(evaluatePassword('abc').reasons).not.toContain('sequence');
    expect(evaluatePassword('cba').reasons).not.toContain('sequence');
    expect(evaluatePassword('xabc').reasons).not.toContain('sequence');
    expect(evaluatePassword('xcba').reasons).not.toContain('sequence');
  });
});

describe('a data dentro do PIN: o recorte', () => {
  it('o dia e o mês saem das duplas certas, não de qualquer posição', () => {
    // '19900130' só é data no formato AAAA MMDD: o dia é '30' e o mês é '01'.
    // Se o dia saísse de outra posição ou o mês pegasse a casa a mais, o
    // deixaria de ser dia ou viraria mês 13, e o PIN deixaria de ser data.
    expect(evaluatePin('19900130').reasons).toContain('dateLike');
  });

  it('o mês 13 no formato AAAA MMDD não é mês', () => {
    // '19901301' tem ano e dia plausíveis no formato AAAA MMDD, e o mês é 13:
    // não é data. Um recorte que pegasse o mês pela metade errado aceitaria
    // esse PIN como data de nascimento.
    expect(evaluatePin('19901301').reasons).not.toContain('dateLike');
  });
});
