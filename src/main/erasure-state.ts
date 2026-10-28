/**
 * Estado de destruição do cofre no processo: sem `fs` e sem importação, para
 * `storage.ts` e `erase.ts` lerem a mesma verdade sem ciclo.
 */
let destroyed = false;

export function isVaultDestroyed(): boolean {
  return destroyed;
}

export function markVaultDestroyed(): void {
  destroyed = true;
}

/** Chamado só por `createVault`: um cofre novo é o usuário decidindo de novo. */
export function clearDestroyedFlag(): void {
  destroyed = false;
}
