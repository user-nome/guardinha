import { app } from 'electron';

/** Cala as duas linhas de `ERROR` do Chromium sobre atoms do X11; o resto do log segue. */
export function quietChromiumLog(): void {
  if (app.commandLine.hasSwitch('log-level')) return;
  app.commandLine.appendSwitch('log-level', '3');
}
