import { activityMonitor } from '@zero/main/activity';
import { currentMessages } from '@zero/main/i18n';

/** Única detentora da chave em memória (Singleton): guarda e zera a chave, ninguém mais. */
export class VaultSessionManager {
  private static instance: VaultSessionManager | null = null;

  private key: Buffer | null = null;

  /** Sessão decoy: cofre destruído, sem chave na RAM, mas com a tela de cofre vazio. */
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

  /** Sessão de coação: cofre vazio e sem chave, então nada aqui decifra um `.zke`. */
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

  /** Zera a chave na RAM (`fill(0)`) e cancela o auto-lock; a sessão decoy morre aqui. */
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
