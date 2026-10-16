/** Credencial salva no cofre (conteúdo decifrado, só em memória). */
export interface Credential {
  id: string;
  title: string;
  username: string;
  password: string;
  domain: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

/** Entrada de credencial aceita pelo save (id ausente cria uma nova). */
export type CredentialInput = Omit<Credential, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

/**
 * Como o usuário está tentando desbloquear o cofre. A frase de recuperação
 * **não é forma de login**: ela só serve para redefinir o PIN (`ResetPinInput`).
 */
export type UnlockKind = 'master' | 'pin';

/** Estado do cofre exposto ao renderer. */
export interface VaultStatus {
  exists: boolean;
  locked: boolean;
  attempts: number;
  lockUntil: number | null;
  lockRemainingMs: number;
}

export interface CreateVaultInput {
  masterPassword: string;
  pin: string;
  /** Frase escrita pelo próprio usuário (não gerada pelo app). */
  recoveryPhrase: string;
}

export interface UnlockInput {
  credential: string;
  kind: UnlockKind;
}

/** Redefinição do PIN provando posse da frase de recuperação. */
export interface ResetPinInput {
  phrase: string;
  newPin: string;
}

/** Instalação do PIN de coação (exige cofre desbloqueado). */
export interface PanicPinInput {
  pin: string;
}

/**
 * Estado da trava exponencial como ele fica gravado no `vault.zkv`.
 *
 * Mora aqui, e não em `src/main/storage.ts`, porque não é detalhe do arquivo:
 * `auth.ts` (que calcula a trava), `vault.ts`, `unlock.ts` e a fachada
 * repartem esse estado, e `FailedAttemptResult` abaixo o expõe. Declarar aqui
 * mantém `src/types/` sem depender de `src/main/`, que é a direção correta da
 * dependência.
 */
export interface PersistedAuthState {
  attempts: number;
  lockUntil: number | null;
  /** Falhas só da senha mestra; o PIN não soma aqui. */
  attemptsMaster: number;
  /** Limite estrito da senha mestra; `0` = autodestruição desligada. */
  nukeLimit: number;
}

/** Estado novo da trava e se ele já cruzou o limite de autodestruição. */
export interface FailedAttemptResult {
  state: PersistedAuthState;
  crossed: boolean;
}

/**
 * Estado das proteções de pânico do cofre. `hasPanicPin` diz se existe um
 * caminho de coação instalado; `nukeLimit` é o teto de tentativas da senha
 * mestra, com `0` significando desligado (que é o padrão).
 */
export interface PanicStatus {
  hasPanicPin: boolean;
  nukeLimit: number;
  attemptsMaster: number;
}

/** Resultado de uma operação de cofre, com o status atualizado. */
export interface VaultResult {
  ok: boolean;
  error?: string;
  status: VaultStatus;
}

/**
 * Resultado do Cryptographic Erase: quantos arquivos foram sobrescritos e
 * apagados, e quantos resistiram. Só serve para diagnóstico; a autodestruição
 * é lógica mesmo quando algum arquivo não pôde ser tocado.
 */
export interface EraseResult {
  shredded: number;
  failed: number;
}

/**
 * Varredura de temporários órfãos: quantos `.tmp` foram sobrescritos e apagados,
 * e quantos foram deixados intactos por ainda poderem ser de uma escrita em
 * curso. Irmão de `EraseResult`, e pelo mesmo motivo mora aqui.
 */
export interface TempCleanupResult {
  removed: number;
  kept: number;
}
