import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PRIVILEGE_TIMEOUT_MS } from '@zero/shared/auth-constants';

function hasVaultOverride(): boolean {
  const dir = process.env.GUARDINHA_VAULT_DIR;
  if (dir !== undefined && dir !== '') return true;
  const varLib = process.env.GUARDINHA_VAR_LIB;
  return varLib !== undefined && varLib !== '';
}

/** Pede admin via `pkexec` para criar a estrutura; a senha fica com o PolicyKit. */
export function setupVaultDirectory(): boolean {
  if (hasVaultOverride()) return false;
  try {
    // Electron define process.resourcesPath; em teste/node pode não existir
    const resourcesPath: unknown = 'resourcesPath' in process ? process.resourcesPath : undefined;
    const resources = typeof resourcesPath === 'string' ? resourcesPath : '';
    const helper = path.join(resources, 'guardinha-setup');
    const result = spawnSync('pkexec', [helper], { timeout: PRIVILEGE_TIMEOUT_MS });
    return result.status === 0;
  } catch {
    return false;
  }
}
