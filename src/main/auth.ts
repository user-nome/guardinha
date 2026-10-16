import { vaultStorage } from '@zero/main/facade';
import { currentMessages } from '@zero/main/i18n';
import type { FailedAttemptResult, PersistedAuthState, UnlockKind, VaultStatus } from '@zero/types';

const PENALTY_DELAYS_SECONDS = [10, 30, 60, 3600, 86400] as const; // 10s, 30s, 1m, 1h, 24h

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

export function getLockRemainingMs(state: PersistedAuthState): number {
  if (state.lockUntil === null) return 0;
  return Math.max(0, state.lockUntil - Date.now());
}

/**
 * Registra tentativa fallhada e aplica trava exponencial.
 *
 * `kind` separa o que é erro de digitação do que é ataque: só a falha da
 * **senha mestra** soma em `attemptsMaster`, que é o contador do limite de
 * autodestruição. Falha de PIN não soma lá, porque o PIN é o método do dia a
 * dia e o valor padrão do limite fica bem acima de erro de digitação.
 *
 * Devolve o estado novo junto do limite estrito, para quem chama decidir se
 * crossed e precisa destruir. O retorno existe porque o corte da autodestruição
 * mora em `vault.ts` (único lugar que pode apagar o cofre), e não aqui.
 */
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
  return /^([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(domain) || /^https?:\/\//i.test(domain);
}

/**
 * URL a abrir no navegador padrão, já normalizada com o esquema. Lança o erro
 * localizado quando o texto não é um domínio aceitável. É regra de domínio,
 * não transporte: o handler IPC só repassa o resultado para o `shell`.
 */
export function openableUrl(domain: string): string {
  if (domain === '' || !validateDomainFormat(domain)) {
    throw new Error(currentMessages().errors.invalidDomain);
  }
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}
