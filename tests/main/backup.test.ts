// @vitest-environment node
import fs from 'node:fs';
import fsExtra from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { authDir, containerFile, entriesDir } from '@zero/main/layout';
import { exportBackup, restoreBackup } from '@zero/main/backup/backup';
import { packBackup, unpackBackup } from '@zero/main/backup/backup-container';
import { packVaultContainer } from '@zero/main/container';
import { currentMessages } from '@zero/main/i18n';
import { listEntryIds } from '@zero/main/entries-store';
import { listAuthIds } from '@zero/main/auth-store';
import { saveEntry } from '@zero/main/entries';
import { saveToken } from '@zero/main/authenticator';
import { vaultStorage } from '@zero/main/facade';
import { vaultSession } from '@zero/main/session';
import { createVault } from '@zero/main/vault';
import * as privilege from '@zero/main/privilege';

/** Backup `.gbk` de bytes já cifrados: exporta, valida e restaura sem sessão aberta. */

const MASTER = 'senha-mestra-guardinha24';
const PIN = '49201733';
const PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';
const STRONG_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

let outDir: string;

function exportTo(name: string): string {
  return path.join(outDir, name);
}

/** Sessão descartável: a restauração só olha `isUnlocked()`, não decifra nada. */
function markUnlocked(): void {
  vaultSession().adopt(Buffer.alloc(32, 7));
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

  it('exporta credenciais mesmo quando o contêiner não existe', () => {
    const destination = exportTo('sem-container-na-origem.gbk');
    const original = fsExtra.existsSync;
    const exists = vi.spyOn(fsExtra, 'existsSync').mockImplementation((target) => {
      if (String(target) === containerFile()) return false;
      return original(target);
    });

    try {
      const result = exportBackup(destination, '1.0.0');
      const opened = unpackBackup(fs.readFileSync(destination));

      expect(result.files).toBeGreaterThan(0);
      expect(opened.files.some((file) => file.path === 'vault.zkv')).toBe(false);
      expect(exists).toHaveBeenCalledWith(containerFile());
    } finally {
      exists.mockRestore();
    }
  });

  it('não segue o symlink plantado no .tmp previsível do pendrive', () => {
    // P5b: o export gravava em `${destino}.tmp` com `writeFileSync`, que segue
    // symlink. Um pendrive hostil planta esse nome apontando para o `vault.zkv`
    // e o backup sobrescreve o container. O nome aleatório e o `wx` fecham isso.
    const destination = exportTo('pendrive-hostil.gbk');
    const victim = containerFile();
    const before = fs.readFileSync(victim);
    fs.symlinkSync(victim, `${destination}.tmp`);

    exportBackup(destination, '1.0.0');

    expect(fs.readFileSync(victim).equals(before)).toBe(true);
    expect(unpackBackup(fs.readFileSync(destination)).files.length).toBeGreaterThan(0);
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

  it('recusa container válido sem manifesto selado', () => {
    // sem o manifesto não há como provar que o diretório restaurado é o do
    // pacote: o cofre até abriria, mas a lista de credenciais viraria a do disco
    const destination = exportTo('sem-manifesto.gbk');
    const current = vaultStorage.readContainer();
    if (current === null) throw new Error('o cofre do teste sumiu');
    fs.writeFileSync(
      destination,
      packBackup(
        [
          {
            path: 'vault.zkv',
            data: packVaultContainer({ ...current, manifest: null }),
          },
        ],
        '1.0.0',
      ),
    );

    expect(() => restoreBackup(destination)).toThrow(currentMessages().errors.backupInvalid);
  });

  it('recusa container inválido no pacote antes de apagar o cofre atual', () => {
    // P4: o pacote é autofabricável (SHA-256 não é assinatura). Antes, um
    // `vault.zkv` que não era container passava pela checagem de digest, o
    // cofre atual era apagado e o lixo tomava o lugar. Agora o container é
    // validado antes do erase.
    const destination = exportTo('container-invalido.gbk');
    const before = fs.readFileSync(containerFile());
    fs.writeFileSync(
      destination,
      packBackup([{ path: 'vault.zkv', data: Buffer.from('ZKV1 nao e um container') }], '1.0.0'),
    );

    expect(() => restoreBackup(destination)).toThrow(currentMessages().errors.backupInvalid);
    expect(fs.readFileSync(containerFile()).equals(before)).toBe(true);
  });

  it('recusa arquivo inexistente', () => {
    expect(() => restoreBackup(exportTo('nao-existe.gbk'))).toThrow(
      currentMessages().errors.backupInvalid,
    );
  });

  it('restaura um cofre funcional depois do Cryptographic Erase', () => {
    const destination = exportTo('restaurar.gbk');
    const exported = exportBackup(destination, '1.0.0');
    const expectedEntries = [...listEntryIds()].sort();
    const expectedAuth = [...listAuthIds()].sort();

    // simula a máquina formatada: o cofre e a chave em memória somem
    vaultStorage.erase();
    vaultSession().wipe();
    expect(fs.existsSync(containerFile())).toBe(false);

    const restored = restoreBackup(destination);

    expect(restored.files).toBe(exported.files);
    expect(fs.existsSync(containerFile())).toBe(true);
    expect(fs.statSync(containerFile()).mode & 0o777).toBe(0o600);
    // os mesmos ids, não só a mesma quantidade: um nome de destino montado com
    // um caractere a menos criaria arquivos novos e a contagem continuaria igual
    expect([...listEntryIds()].sort()).toEqual(expectedEntries);
    expect([...listAuthIds()].sort()).toEqual(expectedAuth);
    expect(fs.existsSync(path.join(entriesDir(), `${expectedEntries[0]}.zke`))).toBe(true);
    expect(fs.existsSync(path.join(authDir(), `${expectedAuth[0]}.zka`))).toBe(true);
  });

  it('grava o contêiner por último, uma vez só', () => {
    // O contêiner é a chave do cofre: se ele for escrito no meio, um crash
    // deixa credenciais pela metade ao lado de um cofre que abre. As gravações
    // atômicas passam por `rename`, então a ordem dos renomes é a ordem das
    // escritas.
    const destination = exportTo('ordem.gbk');
    exportBackup(destination, '1.0.0');
    markUnlocked();
    const written: string[] = [];
    const original = fsExtra.renameSync;
    const rename = vi.spyOn(fsExtra, 'renameSync').mockImplementation((from, to) => {
      written.push(String(to));
      original(from, to);
    });

    try {
      restoreBackup(destination);
    } finally {
      rename.mockRestore();
    }

    expect(written.filter((target) => target === containerFile())).toHaveLength(1);
    expect(written[written.length - 1]).toBe(containerFile());
  });

  it('recusa restaurar por cima de um cofre existente com a sessão bloqueada', () => {
    // P4: o SHA-256 do pacote não é assinatura, então um `.gbk` forjado trocaria
    // o cofre de quem só clicou em restaurar. A sessão aberta é a prova da
    // credencial atual; sem ela, a restauração não pode encostar no disco.
    const destination = exportTo('bloqueado.gbk');
    exportBackup(destination, '1.0.0');
    const before = fs.readFileSync(containerFile());
    vaultSession().wipe();

    expect(() => restoreBackup(destination)).toThrow(currentMessages().errors.vaultLocked);
    expect(fs.readFileSync(containerFile()).equals(before)).toBe(true);

    // devolve a sessão que os testes seguintes usam; a chave não é decifrada
    markUnlocked();
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

  beforeEach(() => {
    markUnlocked();
  });

  it('grava o pacote mesmo em mídia que recusa o modo do arquivo', () => {
    // Pendrive FAT/exFAT não tem dono nem modo: o `chmod` falha e o backup
    // precisa ter saído mesmo assim. O conteúdo continua cifrado, então perder o
    // 0600 ali não expõe nada; perder o arquivo, sim.
    const destino = exportTo('sem-modo.gbk');
    // Só o `chmod` do **destino** falha: as pastas do cofre usam `chmodSync`
    // também, e um espelho que recusasse toda chamada derrubaria a montagem do
    // pacote antes de ele ser escrito. O filtro pelo caminho é o que separa as
    // duas coisas, como no pendrive de verdade, onde só o arquivo novo é
    // recusado.
    const original = fsExtra.chmodSync;
    const chmod = vi.spyOn(fsExtra, 'chmodSync').mockImplementation((target, mode) => {
      if (String(target) === destino) {
        throw new Error('operação não suportada pelo sistema de arquivos');
      }
      original(target, mode);
    });

    try {
      const resultado = exportBackup(destino, '1.0.0');

      expect(resultado.files).toBeGreaterThan(0);
      expect(fs.readFileSync(destino).subarray(0, 8).toString('ascii')).toBe('ZKBACKUP');
      // o `chmod` falhou, então o modo que ficou é o passado na criação do
      // temporário: o backup não pode nascer legível por outros usuários
      expect(fs.statSync(destino).mode & 0o777).toBe(0o600);
      expect(chmod).toHaveBeenCalledWith(destino, 0o600);
    } finally {
      chmod.mockRestore();
    }
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
