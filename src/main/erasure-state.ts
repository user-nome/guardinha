/** Estado de destruição do cofre no processo, sem `fs`, para evitar ciclo. */
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
