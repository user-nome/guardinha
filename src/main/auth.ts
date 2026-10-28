/** Trava exponencial e validação de domínio do cofre; não toca `fs` nem cifra. */
import { vaultStorage } from '@zero/main/facade';
import { currentMessages } from '@zero/main/i18n';
import type { FailedAttemptResult, PersistedAuthState, UnlockKind, VaultStatus } from '@zero/types';
import { PENALTY_DELAYS_SECONDS } from '@zero/shared/auth-constants';

export function loadAuthState(): PersistedAuthState {
  return vaultStorage.readAuthState();
}

/** Visão do cofre para a interface: existe, está travado e quanto falta da espera. */
export function statusFrom(
  auth: PersistedAuthState,
  exists: boolean,
  locked: boolean,
): VaultStatus {
  return {
    exists,
    locked,
    attempts: auth.attempts,
    lockUntil: auth.lockUntil,
    lockRemainingMs: getLockRemainingMs(auth),
  };
}

export function calculateLockout(attemptCount: number): number {
  const index = Math.min(attemptCount - 1, PENALTY_DELAYS_SECONDS.length - 1);
  const delaySec = PENALTY_DELAYS_SECONDS[Math.max(0, index)] ?? PENALTY_DELAYS_SECONDS[0];
  return Date.now() + delaySec * 1000;
}

/** Maior espera legítima: o último degrau da trava exponencial (24 h). */
const MAX_LOCKOUT_MS = Math.max(...PENALTY_DELAYS_SECONDS) * 1000;

/** Espera restante em ms; `lockUntil` acima do teto conta como vencido (estado adulterado). */
export function getLockRemainingMs(state: PersistedAuthState): number {
  if (state.lockUntil === null) return 0;
  const remaining = state.lockUntil - Date.now();
  if (remaining > MAX_LOCKOUT_MS) return 0;
  return Math.max(0, remaining);
}

/** Soma a falha e aplica a trava; só a senha mestra conta para a autodestruição. */
export function registerFailedAttempt(kind: UnlockKind, nukeLimit = 0): FailedAttemptResult {
  const current = vaultStorage.readAuthState();
  const attempts = current.attempts + 1;
  const attemptsMaster = kind === 'master' ? current.attemptsMaster + 1 : current.attemptsMaster;
  const state: PersistedAuthState = {
    attempts,
    lockUntil: calculateLockout(attempts),
    attemptsMaster,
    nukeLimit,
  };
  vaultStorage.writeAuthState(state);
  return { state, crossed: nukeLimit > 0 && attemptsMaster >= nukeLimit };
}

export function resetAttempts(): void {
  const current = vaultStorage.readAuthState();
  // `nukeLimit` sobrevive ao reset: é configuração do cofre, não estado de trava
  vaultStorage.writeAuthState({
    attempts: 0,
    lockUntil: null,
    attemptsMaster: 0,
    nukeLimit: current.nukeLimit,
  });
}

export function validateUsernameFormat(username: string): boolean {
  if (username === '') return true;
  // Permite palavra simples, kebab-case ou snake_case
  const validPattern = /^[a-z0-9]+([-_][a-z0-9]+)*$/i;
  return validPattern.test(username);
}

export function validateDomainFormat(domain: string): boolean {
  if (domain === '') return true;
  return /^([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(domain) || /^https:\/\//i.test(domain);
}

/** URL com esquema; recusa domínio inválido e nunca rebaixa https para http. */
export function openableUrl(domain: string): string {
  if (domain === '' || !validateDomainFormat(domain)) {
    throw new Error(currentMessages().errors.invalidDomain);
  }
  return /^https:\/\//i.test(domain) ? domain : `https://${domain}`;
}
