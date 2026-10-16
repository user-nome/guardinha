import path from 'node:path';

/**
 * Onde o cofre mora. Só resolve caminhos: nenhum I/O, nenhuma dependência de
 * Electron, para que `storage.ts`, o armazenamento das entradas e a rotina de
 * erasure concordem sobre o mesmo lugar sem repetir a árvore de diretórios.
 */

/**
 * Raiz do cofre: `/var/lib/.guardinha/.vault`, pastas ocultas por padrão
 * (fora de `~/`, sobrevive à limpeza da pasta do usuário). `GUARDINHA_VAR_LIB`
 * redireciona a raiz e `GUARDINHA_VAULT_DIR` sobrepõe o caminho completo (testes/dev).
 */
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

/**
 * Tokens de 2FA, uma pasta própria dentro do cofre e um arquivo cifrado por
 * token (`.auth/<uuid>.zka`), no mesmo formato dos `.zke` das credenciais.
 *
 * Fica **dentro** de `.vault` por um motivo prático: a raiz
 * `/var/lib/.guardinha/` é do sistema (`root:root 0711`, criada no `postinst`) e
 * o Cryptographic Erase não pode mexer nela. Dentro de `.vault` o token entra
 * na mesma varredura que a credencial, então a autodestruição alcança os dois
 * sem nenhum caminho novo capaz de esquecer um deles. Um segredo TOTP que
 * sobrevive ao Cryptographic Erase é uma senha de servidor
 * que sobrevive a ele.
 */
export function authDir(): string {
  return path.join(vaultDir(), '.auth');
}

/** Container com as chaves embrulhadas, a trava e o manifesto. */
export function containerFile(): string {
  return path.join(vaultDir(), 'vault.zkv');
}
