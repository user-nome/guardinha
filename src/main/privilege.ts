import { spawnSync } from 'node:child_process';
import path from 'node:path';

function hasVaultOverride(): boolean {
  const dir = process.env.GUARDINHA_VAULT_DIR;
  if (dir !== undefined && dir !== '') return true;
  const varLib = process.env.GUARDINHA_VAR_LIB;
  return varLib !== undefined && varLib !== '';
}

/**
 * O que o app precisa saber do `process` do Electron. Node não declara
 * `resourcesPath`, e o processo de teste não tem a propriedade: a forma é
 * declarada uma vez aqui em vez de reescrita a cada leitura.
 */
interface AppProcess {
  resourcesPath?: string;
}

/**
 * Pedas autenticação de administrador para criar/reparar a estrutura de
 * `/var/lib/.guardinha` via `pkexec`: a caixinha de senha é a do próprio
 * sistema (PolicyKit/Mint); o app nunca vê a senha. O alvo é o helper
 * `guardinha-setup` do pacote, que só cria diretórios fixos.
 *
 * Com override de teste/dev (`GUARDINHA_VAULT_DIR`/`GUARDINHA_VAR_LIB`) nunca dispara.
 * Retorna `true` se o helper terminou com exit 0.
 */
export function setupVaultDirectory(): boolean {
  if (hasVaultOverride()) return false;
  try {
    // Electron define process.resourcesPath; em teste/node pode não existir
    const resources = (process as AppProcess).resourcesPath ?? '';
    const helper = path.join(resources, 'guardinha-setup');
    const result = spawnSync('pkexec', [helper], { timeout: 120_000 });
    return result.status === 0;
  } catch {
    return false;
  }
}
