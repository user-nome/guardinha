import { clipboard } from 'electron';
import { CLEAR_CLIPBOARD_MS } from '@zero/shared/auth-constants';

/**
 * Proxy do clipboard nativo: o main é o único a tocar `electron.clipboard`,
 * com expiração e limpeza automática.
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

  /** Cancela o temporizador e limpa agora: o timer morre com o processo. */
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
