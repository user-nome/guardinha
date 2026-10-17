// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupVaultDirectory } from '@zero/main/privilege';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));

const spawn = vi.mocked(spawnSync);

function result(status: number | null): ReturnType<typeof spawnSync> {
  return { status } as unknown as ReturnType<typeof spawnSync>;
}

let savedVaultDir: string | undefined;
let savedVarLib: string | undefined;
let savedResourcesPath: PropertyDescriptor | undefined;

beforeEach(() => {
  savedVaultDir = process.env.GUARDINHA_VAULT_DIR;
  savedVarLib = process.env.GUARDINHA_VAR_LIB;
  savedResourcesPath = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
  delete process.env.GUARDINHA_VAULT_DIR;
  delete process.env.GUARDINHA_VAR_LIB;
  spawn.mockReset();
});

afterEach(() => {
  if (savedVaultDir === undefined) delete process.env.GUARDINHA_VAULT_DIR;
  else process.env.GUARDINHA_VAULT_DIR = savedVaultDir;
  if (savedVarLib === undefined) delete process.env.GUARDINHA_VAR_LIB;
  else process.env.GUARDINHA_VAR_LIB = savedVarLib;
  if (savedResourcesPath === undefined) Reflect.deleteProperty(process, 'resourcesPath');
  else Object.defineProperty(process, 'resourcesPath', savedResourcesPath);
});

describe('setupVaultDirectory (pkexec)', () => {
  it('nunca dispara com override de teste/dev (GUARDINHA_VAULT_DIR)', () => {
    process.env.GUARDINHA_VAULT_DIR = '/tmp/override-qualquer';
    expect(setupVaultDirectory()).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('nunca dispara com override de raiz (GUARDINHA_VAR_LIB)', () => {
    process.env.GUARDINHA_VAR_LIB = '/tmp/var-qualquer';
    expect(setupVaultDirectory()).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('chama pkexec com o helper do pacote', () => {
    spawn.mockReturnValue(result(0));
    expect(setupVaultDirectory()).toBe(true);
    expect(spawn).toHaveBeenCalledWith('pkexec', ['guardinha-setup'], { timeout: 120_000 });
  });

  it('resolve o helper dentro do diretório de recursos do Electron', () => {
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: '/opt/guardinha/resources',
    });
    spawn.mockReturnValue(result(0));

    expect(setupVaultDirectory()).toBe(true);
    expect(spawn).toHaveBeenCalledWith('pkexec', ['/opt/guardinha/resources/guardinha-setup'], {
      timeout: 120_000,
    });
  });

  it('ignora resourcesPath quando o valor não é uma string', () => {
    Object.defineProperty(process, 'resourcesPath', { configurable: true, value: 42 });
    spawn.mockReturnValue(result(0));

    expect(setupVaultDirectory()).toBe(true);
    expect(spawn).toHaveBeenCalledWith('pkexec', ['guardinha-setup'], { timeout: 120_000 });
  });

  it('devolve false quando o usuário cancela/recusa no diálogo', () => {
    spawn.mockReturnValue(result(126)); // pkexec: não autenticado
    expect(setupVaultDirectory()).toBe(false);
  });

  it('devolve false quando o diálogo expira (status nulo)', () => {
    spawn.mockReturnValue(result(null));
    expect(setupVaultDirectory()).toBe(false);
  });

  it('devolve false quando o pkexec não existe', () => {
    spawn.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(setupVaultDirectory()).toBe(false);
  });
});
