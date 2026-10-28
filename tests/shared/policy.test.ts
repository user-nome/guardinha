import { describe, expect, it } from 'vitest';
import {
  isMasterPasswordFormat,
  isPinFormat,
  isUuid,
  MASTER_PASSWORD_LENGTH,
  PIN_LENGTH,
  RECOVERY_MIN_WORDS,
} from '@zero/shared/policy';

/** Política de credencial, a mesma nos dois lados; os números ficam fixados à mão de propósito. */
describe('constantes de produção', () => {
  it('mantém o formato da senha mestra e do PIN conforme a especificação', () => {
    expect(MASTER_PASSWORD_LENGTH).toBe(24);
    expect(PIN_LENGTH).toBe(8);
  });

  it('mantém o mínimo da frase de recuperação em 12 palavras', () => {
    expect(RECOVERY_MIN_WORDS).toBe(12);
  });
});

describe('isMasterPasswordFormat', () => {
  it('exatamente 24 caracteres', () => {
    expect(isMasterPasswordFormat('senha-mestra-guardinha24')).toBe(true);
    expect(isMasterPasswordFormat('curta')).toBe(false);
    expect(isMasterPasswordFormat('senha-mestra-guardinha24x')).toBe(false);
  });
});

describe('isPinFormat', () => {
  it('exatamente 8 dígitos', () => {
    expect(isPinFormat('49201733')).toBe(true);
    expect(isPinFormat('4920173')).toBe(false);
    expect(isPinFormat('4920173a')).toBe(false);
    expect(isPinFormat('4920 733')).toBe(false);
  });

  it('não aceita sinal, acento ou espaço nas pontas', () => {
    expect(isPinFormat('+4920173')).toBe(false);
    expect(isPinFormat(' 49201733')).toBe(false);
    expect(isPinFormat('49201733 ')).toBe(false);
  });

  it('não casa prefixo nem sufixo de um dígito a mais', () => {
    // `\\d{8}` com âncora: é o que separa de `\\d+` aceitando qualquer tamanho.
    expect(isPinFormat('492017331')).toBe(false);
    expect(isPinFormat('149201733')).toBe(false);
  });
});

describe('isUuid', () => {
  it('aceita o formato canônico em qualquer caixa', () => {
    expect(isUuid('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true);
    expect(isUuid('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe(true);
  });

  it('recusa o que não é identificador, porque vira nome de arquivo', () => {
    expect(isUuid('')).toBe(false);
    expect(isUuid('../../etc/passwd')).toBe(false);
    expect(isUuid('3f2504e0-4f89-41d3-9a0c-0305e82c330')).toBe(false);
    expect(isUuid('3f2504e04f8941d39a0c0305e82c3301')).toBe(false);
    expect(isUuid('3f2504e0-4f89-41d3-9a0c-0305e82c3301.tmp')).toBe(false);
  });
});
