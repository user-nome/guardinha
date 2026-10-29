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

/** Como o usuário desbloqueia o cofre; a frase de recuperação só redefine o PIN. */
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

/** Métodos que precisam da credencial para migrar a chave para o formato atual. */
export type MigrationMethod = 'master' | 'pin' | 'recovery';

/** O que falta para o cofre estar no formato mais novo, para a tela de atualização. */
export interface VaultMigrationStatus {
  needed: boolean;
  fromVersion: number;
  toVersion: number;
  /** Métodos presentes no container, na ordem em que a tela pede as credenciais. */
  methods: MigrationMethod[];
  entries: number;
  authTokens: number;
}

/** Credenciais informadas no login para reembrulhar todos os métodos de uma vez. */
export type VaultMigrationInput = Partial<Record<MigrationMethod, string>>;

/** Estado da trava exponencial gravado no `vault.zkv`, repartido por `auth.ts` e `vault.ts`. */
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

/** Proteções de pânico: PIN de coação instalado e teto de tentativas (`0` = desligado). */
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

/** Resultado do erase: arquivos sobrescritos e quantos resistiram (só diagnóstico). */
export interface EraseResult {
  shredded: number;
  failed: number;
}

/** Varredura de `.tmp` órfãos: apagados e os mantidos por escrita em curso. */
export interface TempCleanupResult {
  removed: number;
  kept: number;
}
