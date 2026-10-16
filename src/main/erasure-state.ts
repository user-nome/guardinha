/**
 * Estado de destruição do cofre no processo. Fica sozinho, sem `fs` e sem
 * nenhuma importação, para que tanto `storage.ts` (que se recusa a escrever
 * depois do erase) quanto `erase.ts` (que marca) leiam a mesma verdade sem
 * ciclo de importação.
 *
 * O que ele impede: depois de um Cryptographic Erase, qualquer caminho que
 * ainda segure um `VaultContainerData` em memória (por exemplo o `read-
 * modify-write` de `writeAuthState`, ou um `initManifest` disparado por
 * engano) tentaria recriar o `vault.zkv` pela metade, sem chave embrulhada, e
 * o usuário cairia em "cofre adulterado" em vez de "cofre destruído".
 *
 * Quem zera é só `createVault`, porque só o usuário cria um cofre novo de
 * propósito.
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
