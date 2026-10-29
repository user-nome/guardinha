import path from 'node:path';

/** Onde o cofre mora: só resolve caminhos, sem I/O nem Electron. */

/** Raiz do cofre; `GUARDINHA_VAR_LIB` e `GUARDINHA_VAULT_DIR` redirecionam (testes/dev). */
export function vaultDir(): string {
  const override = process.env.GUARDINHA_VAULT_DIR;
  if (override !== undefined && override !== '') return override;
  const varLib = process.env.GUARDINHA_VAR_LIB;
  const base = varLib !== undefined && varLib !== '' ? varLib : '/var/lib';
  return path.join(base, '.guardinha', '.vault');
}

export function entriesDir(): string {
  return path.join(vaultDir(), '.entries');
}

/** Tokens de 2FA dentro de `.vault`, para o erase alcançar junto com as credenciais. */
export function authDir(): string {
  return path.join(vaultDir(), '.auth');
}

/** Container com as chaves embrulhadas, a trava e o manifesto. */
export function containerFile(): string {
  return path.join(vaultDir(), 'vault.zkv');
}

/** Snapshot de downgrade da versão anterior; o nome carrega a versão. */
export function containerBackupFile(version: number): string {
  return path.join(vaultDir(), `vault.zkv.v${version}.bak`);
}
