/** Trava automática após 5 minutos sem operação no cofre. */
export const IDLE_LOCK_MS = 5 * 60 * 1000;

/** O que a atividade do usuário acabou de significar para o app. */
export type ActivityEvent = 'idle-timeout';

export type ActivityListener = (event: ActivityEvent) => void;

/**
 * Observer do ciclo de vida da sessão (padrão Observer): o temporizador de
 * ociosidade mora aqui e cada interessado se inscreve. Hoje há dois ouvintes:
 * o `VaultSessionManager`, que zera a chave, e o entrypoint, que avisa o
 * renderer pelo IPC. Adicionar um terceiro não toca em nenhum dos dois.
 */
export class ActivityMonitor {
  private readonly listeners = new Set<ActivityListener>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Assina o evento e devolve a função que cancela a assinatura. */
  public subscribe(listener: ActivityListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Rearma o temporizador de ociosidade (a cada operação no cofre). */
  public touch(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.emit('idle-timeout');
    }, IDLE_LOCK_MS);
  }

  /** Cancela o temporizador (cofre bloqueado ou app encerrando). */
  public stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emit(event: ActivityEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

/** Instância única do monitor de atividade do app. */
export const activityMonitor = new ActivityMonitor();
