// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { authDir, containerFile, entriesDir } from '@zero/main/layout';
import { exportBackup, restoreBackup } from '@zero/main/backup/backup';
import { packBackup, unpackBackup } from '@zero/main/backup/backup-container';
import { currentMessages } from '@zero/main/i18n';
import { listEntryIds } from '@zero/main/entries-store';
import { listAuthIds } from '@zero/main/auth-store';
import { saveEntry } from '@zero/main/entries';
import { saveToken } from '@zero/main/authenticator';
import { vaultStorage } from '@zero/main/facade';
import { createVault } from '@zero/main/vault';
import * as privilege from '@zero/main/privilege';

/**
 * O backup integral é o caminho de quem formatou a máquina: o pacote é cópia
 * de bytes já cifrados, e a restauração tem que valer **sem** cofre nem sessão.
 * O que os testes provam: o pacote reúne contêiner, `.zke` e `.zka`; um byte
 * trocado derruba antes de encostar no disco; e a restauração devolve um cofre
 * funcional mesmo depois do Cryptographic Erase.
 */

const MASTER = 'senha-mestra-guardinha24';
const PIN = '49201733';
const PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';
const STRONG_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

let outDir: string;

function exportTo(name: string): string {
  return path.join(outDir, name);
}

describe('backup integral do cofre', () => {
  beforeAll(async () => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardinha-backup-'));
    const result = await createVault({ masterPassword: MASTER, pin: PIN, recoveryPhrase: PHRASE });
    expect(result.ok).toBe(true);
    saveEntry({
      title: 'Banco',
      username: 'alice',
      password: 'segredo',
      domain: 'banco.com',
      notes: '',
    });
    saveToken({
      issuer: 'GitHub',
      account: 'alice',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: STRONG_SECRET,
    });
  }, 120_000);

  it('empacota contêiner, credenciais e tokens, sem segredo em claro', () => {
    const destination = exportTo('completo.gbk');
    const result = exportBackup(destination, '1.0.0');

    expect(result.files).toBe(1 + listEntryIds().length + listAuthIds().length);
    expect(result.bytes).toBe(fs.statSync(destination).size);

    const raw = fs.readFileSync(destination);
    expect(raw.subarray(0, 8).toString('ascii')).toBe('ZKBACKUP');
    // o pacote é cópia do que já está cifrado: nada de senha nem segredo legível
    expect(raw.toString('latin1')).not.toContain('segredo');
    expect(raw.toString('latin1')).not.toContain(STRONG_SECRET);

    const opened = unpackBackup(raw);
    const byPath = new Map(opened.files.map((file) => [file.path, file.data]));
    expect(byPath.get('vault.zkv')?.equals(fs.readFileSync(containerFile()))).toBe(true);
    const [entryId] = listEntryIds();
    expect(byPath.has(`.entries/${entryId}.zke`)).toBe(true);
    const [authId] = listAuthIds();
    expect(byPath.has(`.auth/${authId}.zka`)).toBe(true);
  });

  it('recusa pacote adulterado sem tocar no cofre atual', () => {
    const destination = exportTo('adulterado.gbk');
    exportBackup(destination, '1.0.0');
    const raw = fs.readFileSync(destination);
    // troca um byte do payload (antes do digest global)
    raw[raw.length - 40] = (raw[raw.length - 40] ?? 0) ^ 0xff;
    fs.writeFileSync(destination, raw);

    const entriesBefore = listEntryIds().length;
    expect(() => restoreBackup(destination)).toThrow(currentMessages().errors.backupCorrupted);
    expect(fs.existsSync(containerFile())).toBe(true);
    expect(listEntryIds().length).toBe(entriesBefore);
  });

  it('recusa pacote sem o contêiner do cofre', () => {
    const destination = exportTo('sem-container.gbk');
    fs.writeFileSync(
      destination,
      packBackup(
        [{ path: '.entries/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.zke', data: Buffer.from('x') }],
        '1.0.0',
      ),
    );

    expect(() => restoreBackup(destination)).toThrow(currentMessages().errors.backupInvalid);
  });

  it('recusa arquivo inexistente', () => {
    expect(() => restoreBackup(exportTo('nao-existe.gbk'))).toThrow(
      currentMessages().errors.backupInvalid,
    );
  });

  it('restaura um cofre funcional depois do Cryptographic Erase', () => {
    const destination = exportTo('restaurar.gbk');
    const exported = exportBackup(destination, '1.0.0');
    const expectedEntries = listEntryIds().length;
    const expectedAuth = listAuthIds().length;

    // simula a máquina formatada: o cofre e a chave em memória somem
    vaultStorage.erase();
    expect(fs.existsSync(containerFile())).toBe(false);

    const restored = restoreBackup(destination);

    expect(restored.files).toBe(exported.files);
    expect(fs.existsSync(containerFile())).toBe(true);
    expect(fs.statSync(containerFile()).mode & 0o777).toBe(0o600);
    expect(listEntryIds().length).toBe(expectedEntries);
    expect(listAuthIds().length).toBe(expectedAuth);
    expect(fs.existsSync(path.join(entriesDir(), `${listEntryIds()[0]}.zke`))).toBe(true);
    expect(fs.existsSync(path.join(authDir(), `${listAuthIds()[0]}.zka`))).toBe(true);
  });
});

describe('backup: destino e pasta do cofre indisponíveis', () => {
  const m = currentMessages();

  beforeAll(() => {
    // A restauração valida o pacote inteiro **antes** de tentar criar as pastas,
    // então a falha que se quer provocar aqui (escrita e permissão) só aparece
    // com um `.gbk` de verdade na mão: um pacote válido do mesmo cofre serve.
    exportBackup(exportTo('cofre.gbk'), '1.0.0');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('devolve erro próprio quando o destino não pode ser gravado', () => {
    // pendrive sem ponto de montagem, pasta removida no meio do caminho: o
    // `.gbk` é montado em memória, mas a escrita é o que pode falhar
    const destino = path.join(outDir, 'pasta-que-nao-existe', 'cofre.gbk');

    expect(() => exportBackup(destino, '1.0.0')).toThrow(m.errors.backupWriteFailed);
    expect(fs.existsSync(destino)).toBe(false);
  });

  it('devolve erro próprio quando o destino existe e é uma pasta', () => {
    // destino já é um diretório: o `.tmp` chega a ser escrito e o `rename`
    // falha. O erro que volta é o do backup, não o do `rename` cru, para que a
    // tela não exponha nome de arquivo interno.
    const destino = exportTo('destino-que-e-pasta');
    fs.mkdirSync(destino, { recursive: true });

    expect(() => exportBackup(destino, '1.0.0')).toThrow(m.errors.backupWriteFailed);
  });

  it('repassa erro de disco que não é falta de permissão, sem abrir o pkexec', () => {
    // `EACCES` é o caso do `/var/lib`; qualquer outra falha (disco cheio, disco
    // sumindo) é do host e não se resolve com diálogo de sistema
    const setup = vi.spyOn(privilege, 'setupVaultDirectory');
    vi.spyOn(vaultStorage, 'ensureStructure').mockImplementationOnce(() => {
      throw new Error('disco cheio');
    });

    expect(() => restoreBackup(exportTo('cofre.gbk'))).toThrow('disco cheio');
    expect(setup).not.toHaveBeenCalled();
  });

  it('cancela a restauração quando o setup privilegiado é recusado', () => {
    vi.spyOn(vaultStorage, 'ensureStructure').mockImplementationOnce(() => {
      throw new Error(m.errors.vaultDirUnavailable);
    });
    vi.spyOn(privilege, 'setupVaultDirectory').mockReturnValue(false);

    expect(() => restoreBackup(exportTo('cofre.gbk'))).toThrow(m.errors.vaultAuthCancelled);
    // recusar o diálogo não pode virar cofre apagado: o erase vem depois
    expect(fs.existsSync(containerFile())).toBe(true);
  });

  it('reporta a falha quando a pasta continua inacessível depois do setup', () => {
    vi.spyOn(vaultStorage, 'ensureStructure')
      .mockImplementationOnce(() => {
        throw new Error(m.errors.vaultDirUnavailable);
      })
      .mockImplementationOnce(() => {
        throw new Error('ainda sem permissão');
      });
    vi.spyOn(privilege, 'setupVaultDirectory').mockReturnValue(true);

    expect(() => restoreBackup(exportTo('cofre.gbk'))).toThrow('ainda sem permissão');
    expect(fs.existsSync(containerFile())).toBe(true);
  });

  it('usa erro interno quando a retentativa falha sem valor Error', () => {
    const falhaSemError: unknown = 'falha sem Error';
    vi.spyOn(vaultStorage, 'ensureStructure')
      .mockImplementationOnce(() => {
        throw new Error(m.errors.vaultDirUnavailable);
      })
      .mockImplementationOnce(() => {
        throw falhaSemError;
      });
    vi.spyOn(privilege, 'setupVaultDirectory').mockReturnValue(true);

    expect(() => restoreBackup(exportTo('cofre.gbk'))).toThrow(falhaSemError);
  });
});
