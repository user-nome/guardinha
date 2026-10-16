import { describe, expect, it } from 'vitest';
import { strengthFor } from '@zero/shared';
import { evaluateMaster, evaluatePassword, evaluatePhrase, evaluatePin } from '@zero/shared';

describe('strengthFor (Strategy)', () => {
  it('expõe a régua certa para cada tipo de credencial', () => {
    expect(strengthFor('password').kind).toBe('password');
    expect(strengthFor('master').kind).toBe('master');
    expect(strengthFor('pin').kind).toBe('pin');
    expect(strengthFor('phrase').kind).toBe('phrase');
  });

  it('a estratégia delega para a função pura correspondente', () => {
    expect(strengthFor('pin').evaluate('12345678')).toEqual(evaluatePin('12345678'));
    expect(strengthFor('master').evaluate('aaaaaaaaaaaaaaaaaaaaaaaa')).toEqual(
      evaluateMaster('aaaaaaaaaaaaaaaaaaaaaaaa'),
    );
    expect(strengthFor('password').evaluate('password')).toEqual(evaluatePassword('password'));
    expect(strengthFor('phrase').evaluate('casa '.repeat(12))).toEqual(
      evaluatePhrase('casa '.repeat(12)),
    );
  });

  it('bloqueia o degenerado pelo mesmo critério da régua pura', () => {
    expect(strengthFor('pin').evaluate('87654321').blocked).toBe(true);
    expect(strengthFor('master').evaluate('abcdefghijklabcdefghijkl').blocked).toBe(true);
    expect(strengthFor('phrase').evaluate('casa bola '.repeat(6)).blocked).toBe(true);
  });

  it('uma instância por tipo (estado compartilhado é seguro: são puras)', () => {
    expect(strengthFor('pin')).toBe(strengthFor('pin'));
    expect(strengthFor('password')).not.toBe(strengthFor('master'));
  });
});
