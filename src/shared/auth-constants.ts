/**
 * Constantes da autenticação e trava exponencial.
 *
 * Onde o `10`, `30`, `60`, `3600`, `86400` viviam soltos em `auth.ts`,
 * `15_000` vivia em `App.tsx`, `30_000` em `clipboard.ts`, `60_000` em
 * `index.ts`, `5 * 60 * 1000` em `activity.ts`, `3` em `shred.ts`,
 * `120_000` em `privilege.ts`, `50` em `vault.ts`, `999` em `Settings.tsx`.
 */

export const PENALTY_DELAYS_SECONDS = [10, 30, 60, 3_600, 86_400] as const; // 10s, 30s, 1m, 1h, 24h

/** Trava automática após 5 minutos sem operação no cofre. */
export const IDLE_LOCK_MS = 5 * 60 * 1_000;

/** Tempo até limpar o clipboard nativo após copiar (30 s). */
export const CLEAR_CLIPBOARD_MS = 30_000;

/** Tempo depois do qual um `.tmp` órfão é considerado lixo (1 min). */
export const STALE_TMP_MS = 60_000;

/** Polling de segurança do renderer (rede de segurança do auto-lock). */
export const STATUS_POLL_MS = 15_000;

/** Passadas de sobrescrita do shred (padrão do `shred(1)`). */
export const SHRED_PASSES = 3;

/** Teto aceito do chamador para passadas do shred. */
export const MAX_SHRED_PASSES = 16;

/** Bloco de escrita do shred (64 KiB). */
export const SHRED_BLOCK_BYTES = 64 * 1024;

/** Timeout do helper `pkexec` (2 min). */
export const PRIVILEGE_TIMEOUT_MS = 120_000;

/** Limite mínimo da autodestruição por tentativas de senha mestra. */
export const MIN_NUKE_LIMIT = 50;

/** Teto do campo de autodestruição na tela de Configurações. */
export const MAX_NUKE_LIMIT_INPUT = 999;

/** Passo do relógio do TOTP na tela (1 s). */
export const TICK_MS = 1_000;
