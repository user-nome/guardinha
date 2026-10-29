import { IDLE_LOCK_MS } from '@zero/shared/auth-constants';

/** Trava automática após 2 minutos sem operação no cofre. */
export { IDLE_LOCK_MS };

/** Evento emitido quando o cofre passa do tempo de ociosidade. */
export type ActivityEvent = 'idle-timeout';

export type ActivityListener = (event: ActivityEvent) => void;

/** Observer da ociosidade: o temporizador mora aqui e cada interessado se inscreve. */
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
