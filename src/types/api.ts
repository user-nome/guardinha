import type { GeneratorOptions } from '@zero/types/generator';
import type { AppSettings } from '@zero/types/settings';
import type { AuthCode, AuthToken, AuthTokenDraft } from '@zero/types/authenticator';
import type { BackupOutcome, RestoreOutcome } from '@zero/types/backup';
import type {
  CreateVaultInput,
  Credential,
  CredentialInput,
  PanicPinInput,
  PanicStatus,
  ResetPinInput,
  UnlockInput,
  VaultMigrationInput,
  VaultMigrationStatus,
  VaultResult,
  VaultStatus,
} from '@zero/types/vault';

/** Contrato único da ponte renderer ↔ main, exposto pelo preload como `window.api`. */
export interface ElectronApi {
  vault: {
    status: () => Promise<VaultStatus>;
    create: (input: CreateVaultInput) => Promise<VaultResult>;
    unlock: (input: UnlockInput) => Promise<VaultResult>;
    /** Prova posse da frase de recuperação e instala um novo PIN. */
    resetPin: (input: ResetPinInput) => Promise<VaultResult>;
    lock: () => Promise<VaultStatus>;
    /** Cryptographic Erase sob comando explícito; a confirmação mora no renderer. */
    destroy: () => Promise<VaultStatus>;
    /** Instala o PIN de coação (exige cofre desbloqueado). */
    setPanicPin: (input: PanicPinInput) => Promise<VaultResult>;
    /** Remove o PIN de coação. */
    clearPanicPin: () => Promise<VaultStatus>;
    /** Configura o limite estrito da senha mestra; `0` desliga. */
    setNukeLimit: (limit: number) => Promise<VaultResult>;
    /** Estado das proteções de pânico, para a interface montar o formulário. */
    panicStatus: () => Promise<PanicStatus>;
    /** Diz se o cofre aberto ainda está no formato antigo e o que a migração vai tocar. */
    migrationStatus: () => Promise<VaultMigrationStatus>;
    /** Migra o cofre inteiro de uma vez, com as credenciais informadas no login. */
    migrate: (input: VaultMigrationInput) => Promise<VaultResult>;
    /** Ouvinte do auto-lock (Observer); devolve a função que cancela. */
    onAutoLocked: (listener: (status: VaultStatus) => void) => () => void;
  };
  /** Abre o domínio da credencial no navegador padrão do sistema. */
  openDomain: (domain: string) => Promise<void>;
  clipboard: {
    /** Copia para o clipboard nativo; some da área de transferência em 30 s. */
    copy: (value: string) => Promise<void>;
  };
  entries: {
    list: () => Promise<Credential[]>;
    save: (entry: CredentialInput) => Promise<Credential[]>;
    remove: (id: string) => Promise<Credential[]>;
  };
  /** Gerador TOTP: devolve metadados e o código pronto, nunca o segredo. */
  authenticator: {
    list: () => Promise<AuthToken[]>;
    /** Salva a URI `otpauth://` que o serviço exibiu. */
    saveUri: (uri: string) => Promise<AuthToken[]>;
    /** Salva com o segredo digitado à mão, para quem não tem QR legível. */
    save: (token: AuthTokenDraft) => Promise<AuthToken[]>;
    remove: (id: string) => Promise<AuthToken[]>;
    /** Códigos de todos os tokens no instante atual (uma chamada por período). */
    codes: () => Promise<AuthCode[]>;
  };
  generator: {
    generate: (options: GeneratorOptions) => Promise<string>;
  };
  /** Backup cifrado no pendrive; o caminho vem do diálogo nativo, nunca da página. */
  backup: {
    /** Empacota o cofre e grava no destino escolhido no diálogo. */
    export: () => Promise<BackupOutcome>;
    /** Substitui o cofre atual pelos arquivos do backup escolhido. */
    restore: () => Promise<RestoreOutcome>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    set: (settings: AppSettings) => Promise<AppSettings>;
  };
}
