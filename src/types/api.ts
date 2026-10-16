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
  VaultResult,
  VaultStatus,
} from '@zero/types/vault';

/**
 * Contrato único da ponte renderer ↔ main. O preload monta este objeto e o
 * registra no contextBridge como `window.api`; o renderer só enxerga isto.
 */
export interface ElectronApi {
  vault: {
    status: () => Promise<VaultStatus>;
    create: (input: CreateVaultInput) => Promise<VaultResult>;
    unlock: (input: UnlockInput) => Promise<VaultResult>;
    /** Prova posse da frase de recuperação e instala um novo PIN. */
    resetPin: (input: ResetPinInput) => Promise<VaultResult>;
    lock: () => Promise<VaultStatus>;
    /**
     * Cryptographic Erase sob comando explícito do usuário (botão de pânico).
     * Destruir sem confirmação é um clique de engano longe demais de ser
     * irreversível, então a confirmação mora no renderer.
     */
    destroy: () => Promise<VaultStatus>;
    /** Instala o PIN de coação (exige cofre desbloqueado). */
    setPanicPin: (input: PanicPinInput) => Promise<VaultResult>;
    /** Remove o PIN de coação. */
    clearPanicPin: () => Promise<VaultStatus>;
    /** Configura o limite estrito da senha mestra; `0` desliga. */
    setNukeLimit: (limit: number) => Promise<VaultResult>;
    /** Estado das proteções de pânico, para a interface montar o formulário. */
    panicStatus: () => Promise<PanicStatus>;
    /**
     * Ouvinte do auto-lock (Observer): o main empurra o status novo quando o
     * cofre trava sozinho por ociosidade. Devolve a função que cancela.
     */
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
  /**
   * Gerador de códigos de 2FA (TOTP, RFC 6238).
   *
   * O segredo do token **não faz parte de nenhum retorno**. `list` devolve só
   * metadados e `codes` devolve o número já calculado: quem pede o código nunca
   * vê o segredo, e o processo da interface nunca o tem em memória.
   */
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
  /**
   * Backup integral e cifrado do cofre no pendrive.
   *
   * O renderer dispara a operação e recebe só contagem e caminho; o pacote
   * (`.gbk`) é cópia de bytes já cifrados, montada e lida pelo processo main, e
   * todo caminho vem do diálogo nativo do sistema, nunca da página. Nenhuma
   * credencial ou segredo cruza este contrato.
   */
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
