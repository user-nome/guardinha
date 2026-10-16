// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
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
