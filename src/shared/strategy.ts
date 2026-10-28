import {
  evaluateMaster,
  evaluatePassword,
  evaluatePhrase,
  evaluatePin,
} from '@zero/shared/strength';
import type { StrengthResult } from '@zero/shared/strength';

/** Tipo de credencial que o medidor de força sabe avaliar. */
export type StrengthKind = 'password' | 'master' | 'pin' | 'phrase';

/** Régua de força por tipo; quem chama escolhe a estratégia pelo tipo, nunca pela função. */
export interface StrengthStrategy {
  readonly kind: StrengthKind;
  evaluate(value: string): StrengthResult;
}

/** Senha qualquer: credencial salva, saída do gerador e senha mestra. */
class PasswordStrengthStrategy implements StrengthStrategy {
  public readonly kind = 'password' as const;

  public evaluate(value: string): StrengthResult {
    return evaluatePassword(value);
  }
}

/** Senha mestra: usa a mesma régua da senha qualquer. */
class MasterStrengthStrategy implements StrengthStrategy {
  public readonly kind = 'master' as const;

  public evaluate(value: string): StrengthResult {
    return evaluateMaster(value);
  }
}

/** PIN: nota teto "razoável", bloqueio só do degenerado. */
class PinStrengthStrategy implements StrengthStrategy {
  public readonly kind = 'pin' as const;

  public evaluate(value: string): StrengthResult {
    return evaluatePin(value);
  }
}

/** Frase de recuperação escrita pelo usuário. */
class PhraseStrengthStrategy implements StrengthStrategy {
  public readonly kind = 'phrase' as const;

  public evaluate(value: string): StrengthResult {
    return evaluatePhrase(value);
  }
}

/** Trocar a régua de um tipo é trocar uma entrada aqui. */
const STRATEGIES: Record<StrengthKind, StrengthStrategy> = {
  password: new PasswordStrengthStrategy(),
  master: new MasterStrengthStrategy(),
  pin: new PinStrengthStrategy(),
  phrase: new PhraseStrengthStrategy(),
};

/** Estratégia vigente para o tipo de credencial. */
export function strengthFor(kind: StrengthKind): StrengthStrategy {
  return STRATEGIES[kind];
}
