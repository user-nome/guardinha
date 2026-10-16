import { activityMonitor } from '@zero/main/activity';
import { currentMessages } from '@zero/main/i18n';

/**
 * Única detentora da chave do cofre em memória (Singleton). A guarda e a
 * zeragem de memória moram aqui: nenhum outro módulo mantém cópia da chave, e
 * o lock deixa de ser uma variável de módulo espalhada entre arquivos.
 *
 * A ociosidade não é assunto desta classe: quem mede o tempo é o
 * `ActivityMonitor` (Observer), que avisa e este Singleton obedece.
 */
export class VaultSessionManager {
  private static instance: VaultSessionManager | null = null;

  private key: Buffer | null = null;

  /**
   * Sessão decoy: o PIN de coação abriu um cofre que não existe mais. Não há
   * chave nenhuma em memória (a chave real foi apagada na RAM antes do disco),
   * mas o app se comporta como se tivesse aberto um cofre vazio, que é
   * exatamente o que a pessoa sob coação precisa poder mostrar.
   */
  private decoy = false;

  private constructor() {
    activityMonitor.subscribe(() => {
      this.wipe();
    });
  }

  /** Instância única do processo; o construtor é privado de propósito. */
  public static getInstance(): VaultSessionManager {
    VaultSessionManager.instance ??= new VaultSessionManager();
    return VaultSessionManager.instance;
  }

  /** Assume a posse da chave (zerando a anterior) e arma o auto-lock. */
  public adopt(key: Buffer): void {
    this.wipe();
    this.key = key;
    this.touch();
  }

  /**
   * Sessão de coação: o cofre foi destruído e o que aparece é um cofre vazio.
   * Não guarda chave alguma, então nada aqui pode decifrar um `.zke`.
   */
  public adoptDecoy(): void {
    this.wipe();
    this.decoy = true;
  }

  /** true se a sessão é a de coação (cofre vazio, sem chave real). */
  public isDecoy(): boolean {
    return this.decoy;
  }

  /** Chave corrente; lança o erro localizado se o cofre estiver bloqueado. */
  public requireKey(): Buffer {
    if (this.key === null) {
      throw new Error(currentMessages().errors.vaultLocked);
    }
    return this.key;
  }

  /** Chave corrente ou `null`; nenhum chamador deve reter o Buffer. */
  public keyOrNull(): Buffer | null {
    return this.key;
  }

  public isUnlocked(): boolean {
    return this.key !== null || this.decoy;
  }

  /** Marca atividade e rearma a trava automática. */
  public touch(): void {
    if (this.key === null) return;
    activityMonitor.touch();
  }

  /**
   * Zera a chave na memória (`fill(0)`) e cancela o auto-lock: o lock manual,
   * o timeout e o encerramento do app passam por aqui, sem sobrar cópia
   * legível. A sessão decoy também morre aqui.
   */
  public wipe(): void {
    if (this.key !== null) {
      this.key.fill(0);
      this.key = null;
    }
    this.decoy = false;
    activityMonitor.stop();
  }
}

/** Atalho da instância única (o construtor é privado). */
export function vaultSession(): VaultSessionManager {
  return VaultSessionManager.getInstance();
}
