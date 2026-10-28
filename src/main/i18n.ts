import { messages } from '@zero/messages';
import type { Messages } from '@zero/messages';
import { loadSettings } from '@zero/main/settings';

/** Mensagens do idioma corrente (`settings.language`), relidas a cada chamada. */
export function currentMessages(): Messages {
  return messages(loadSettings().language);
}
