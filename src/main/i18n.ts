import { messages } from '@zero/messages';
import type { Messages } from '@zero/messages';
import { loadSettings } from '@zero/main/settings';

/**
 * Mensagens do idioma corrente (`settings.language`), lidas a cada chamada.
 *
 * O processo main formata os erros no idioma vigente; se o usuário trocar o
 * idioma, os textos já emitidos em memória só mudam na próxima chamada.
 */
export function currentMessages(): Messages {
  return messages(loadSettings().language);
}
