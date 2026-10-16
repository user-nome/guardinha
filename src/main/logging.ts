import { app } from 'electron';

/**
 * O Chromium escreve em `ERROR` duas linhas que não são erro do app:
 * `Add application/vnd.portal.filetransfer to kAtomsToCache` e a mesma coisa
 * com `application/vnd.portal.files`. Elas saem de `ui/gfx/x/atom_cache.cc` no
 * instante em que a área de transferência do X11 é lida, e o
 * `SecureClipboardProxy` lê o clipboard toda vez que o usuário copia uma
 * credencial ou um código de 2FA. A causa é a tabela de atoms que o Chromium
 * pré-carrega estar desatualizada em relação aos MIME types do portal de
 * transferência de arquivos: é defeito upstream, aparece igual no Chrome puro
 * e nada do cofre é afetado.
 *
 * `log-level=3` deixa passar só `FATAL` do log nativo do Chromium, o que cala
 * essas duas linhas. O que continua aparecendo, que é o que serve para
 * diagnosticar:
 *
 * - `console.warn` e `console.error` do main, ou seja, todas as mensagens do
 *   app (`console.log` segue vetado por regra de lint);
 * - o console do renderer, no DevTools e no evento `console-message`;
 * - o que o driver de vídeo imprime direto no stderr, como o
 *   `libva error: iHD_drv_video.so init failed`, porque não passa pelo log do
 *   Chromium.
 *
 * O que fica oculto: `LOG(INFO)`, `LOG(WARNING)` e `LOG(ERROR)` do próprio
 * Chromium, entre eles aviso de GPU/Vulkan, falha do portal no D-Bus, erro de
 * sandbox e aviso de certificado. Quem precisar desses avisos sobe o app com
 * `--log-level=0` na linha de comando, que o Chromium prefere a este switch,
 * e o log nativo volta inteiro.
 */
export function quietChromiumLog(): void {
  if (app.commandLine.hasSwitch('log-level')) return;
  app.commandLine.appendSwitch('log-level', '3');
}
