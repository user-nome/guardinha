import { clipboard } from 'electron';
import { CLEAR_CLIPBOARD_MS } from '@zero/shared/auth-constants';

/**
 * Proxy do clipboard nativo: o processo main é o único a tocar
 * `electron.clipboard`, com temporizador de expiração e limpeza automática.
 * Antes de limpar, lê o clipboard atual; se o usuário já tiver copiado outra
 * coisa, o valor alheio é preservado. Sem leitura disponível, limpa mesmo
 * assim (no cofre, senha esquecida pesa mais que conveniência).
 */
export class SecureClipboardProxy {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private copied: string | null = null;

  /** Copia e agenda a limpeza; uma nova cópia reprograma o temporizador. */
  public async copy(value: string): Promise<void> {
    await clipboard.writeText(value);
    this.copied = value;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.clearIfUnchanged();
    }, CLEAR_CLIPBOARD_MS);
  }

  /**
   * Encerra a vida do proxy: cancela o temporizador e **limpa agora** o que
   * ainda for nosso.
   *
   * Cancelar o temporizador sozinho deixava a senha no clipboard do sistema
   * para sempre, porque o temporizador morre com o processo: nos dois
   * encerramentos (destruição do cofre e saída do app) nada mais dispararia a
   * limpeza de 30 s.
   */
  public async dispose(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.copied === null) return;
    await this.clearIfUnchanged();
  }

  private async clearIfUnchanged(): Promise<void> {
    const copied = this.copied;
    this.copied = null;
    let current: string | null = null;
    try {
      current = await clipboard.readText();
    } catch {
      // sem leitura disponível: segue para a limpeza
    }
    if (current !== null && current !== copied) return;
    try {
      await clipboard.writeText('');
    } catch {
      // clipboard indisponível: nada a limpar
    }
  }
}

/** Instância única do proxy de clipboard do app. */
export const secureClipboard = new SecureClipboardProxy();
