// @vitest-environment node
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { currentMessages } from '@zero/main/i18n';
import { packBackup, unpackBackup } from '@zero/main/backup/backup-container';
import type { BackupSegment } from '@zero/main/backup/backup-container';

/** Pacote `.gbk`: a leitura valida magic, versão, digest global e SHA-256 por arquivo. */

const M = currentMessages();

/** Cabeçalho montado à mão para forjar pacotes que o `packBackup` recusaria. */
function rawPack(manifest: unknown, payload: Buffer, version = 1): Buffer {
  const manifestJson = Buffer.from(JSON.stringify(manifest), 'utf8');
  const header = Buffer.alloc(16);
  Buffer.from('ZKBACKUP', 'ascii').copy(header, 0);
  header.writeUInt32BE(version, 8);
  header.writeUInt32BE(manifestJson.length, 12);
  const body = Buffer.concat([header, manifestJson, payload]);
  return Buffer.concat([body, crypto.createHash('sha256').update(body).digest()]);
}

const FILE = { path: 'vault.zkv', data: Buffer.from('conteúdo cifrado do cofre') };
const EMPTY_SHA = crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex');
const ENTRIES: BackupSegment[] = [
  { path: 'vault.zkv', data: Buffer.from('blobs de chave') },
  { path: '.entries/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.zke', data: Buffer.from('credencial') },
  { path: '.auth/11111111-2222-4333-8444-555555555555.zka', data: Buffer.from('token') },
];

describe('pacote de backup: ida e volta', () => {
  it('empacota e abre devolvendo os mesmos arquivos e o manifesto', () => {
    const packed = packBackup(ENTRIES, '9.9.9');
    expect(packed.subarray(0, 8).toString('ascii')).toBe('ZKBACKUP');

    const opened = unpackBackup(packed);
    expect(opened.manifest.app).toBe('Guardinha');
    expect(opened.manifest.version).toBe('9.9.9');
    expect(opened.manifest.createdAt).toBeGreaterThan(0);
    expect(opened.files).toEqual(ENTRIES);
  });

  it('descreve cada arquivo com tamanho e SHA-256 do conteúdo', () => {
    const opened = unpackBackup(packBackup([FILE], '1.0.0'));
    expect(opened.manifest.files).toEqual([
      {
        path: 'vault.zkv',
        size: FILE.data.length,
        sha256: crypto.createHash('sha256').update(FILE.data).digest('hex'),
      },
    ]);
    expect(opened.files[0]?.data.equals(FILE.data)).toBe(true);
  });

  it('empacota pacote sem arquivo nenhum, com manifesto de lista vazia', () => {
    const opened = unpackBackup(packBackup([], '1.0.0'));
    expect(opened.files).toEqual([]);
  });

  it('aceita arquivo de tamanho zero, que é o piso do manifesto', () => {
    // `size < 0` é o corte: zero é arquivo vazio legítimo, e `<= 0` recusaria o pacote do app
    const opened = unpackBackup(packBackup([{ path: 'vault.zkv', data: Buffer.alloc(0) }], '1'));
    expect(opened.files).toEqual([{ path: 'vault.zkv', data: Buffer.alloc(0) }]);
  });
});

describe('pacote de backup: recusa antes de tocar no disco', () => {
  it('recusa caminho fora da lista fechada já na empacotação', () => {
    for (const path of ['../etc/passwd', '/etc/passwd', '.entries/../../x', 'outro.txt']) {
      expect(() => packBackup([{ path, data: Buffer.from('x') }], '1.0.0')).toThrow(
        M.errors.backupInvalid,
      );
    }
  });

  it('recusa blob curto demais para caber cabeçalho e digest', () => {
    expect(() => unpackBackup(Buffer.alloc(8))).toThrow(M.errors.backupInvalid);
  });

  it('recusa cabeçalho com magic certo mas sem espaço para o digest', () => {
    // o magic passou: sem a guarda de tamanho o `timingSafeEqual` estoura antes do erro do backup
    const header = Buffer.alloc(16);
    Buffer.from('ZKBACKUP', 'ascii').copy(header, 0);
    header.writeUInt32BE(1, 8);

    expect(() => unpackBackup(header)).toThrow(M.errors.backupInvalid);
  });

  it('recusa magic que não é do Guardinha', () => {
    const packed = packBackup([FILE], '1.0.0');
    packed.write('NAOEBACK', 0, 'ascii');
    expect(() => unpackBackup(packed)).toThrow(M.errors.backupInvalid);
  });

  it('recusa versão que esta build não lê, citando o número do formato', () => {
    const packed = packBackup([FILE], '1.0.0');
    packed.writeUInt32BE(2, 8);
    expect(() => unpackBackup(packed)).toThrow(M.errors.backupUnsupportedVersion(2));
  });

  it('recusa conteúdo alterado pelo digest global', () => {
    const packed = packBackup([FILE], '1.0.0');
    packed[20] = (packed[20] ?? 0) ^ 0xff;
    expect(() => unpackBackup(packed)).toThrow(M.errors.backupCorrupted);
  });

  it('recusa arquivo cujo SHA-256 não bate, mesmo com o digest global refeito', () => {
    // ataque real: payload reescrito com o digest global refeito; só o SHA-256 por arquivo pega
    const manifest = {
      app: 'Guardinha',
      version: '1.0.0',
      createdAt: Date.now(),
      files: [
        {
          path: 'vault.zkv',
          size: 4,
          sha256: crypto.createHash('sha256').update(Buffer.from('bom!')).digest('hex'),
        },
      ],
    };
    expect(() => unpackBackup(rawPack(manifest, Buffer.from('mau!')))).toThrow(
      M.errors.backupCorrupted,
    );
  });

  it('recusa quando o payload tem bytes a mais do que o manifesto promete', () => {
    const data = Buffer.from('xy');
    const manifest = {
      app: 'Guardinha',
      version: '1.0.0',
      createdAt: 1,
      files: [
        {
          path: 'vault.zkv',
          size: data.length,
          sha256: crypto.createHash('sha256').update(data).digest('hex'),
        },
      ],
    };
    expect(() =>
      unpackBackup(rawPack(manifest, Buffer.concat([data, Buffer.from('sobra')]))),
    ).toThrow(M.errors.backupCorrupted);
  });

  it('recusa manifesto de tamanho zero', () => {
    // comprimento zero com digest em dia: só a conferência do cabeçalho recusa este pacote
    const header = Buffer.alloc(16);
    Buffer.from('ZKBACKUP', 'ascii').copy(header, 0);
    header.writeUInt32BE(1, 8);
    header.writeUInt32BE(0, 12);
    const packed = Buffer.concat([header, crypto.createHash('sha256').update(header).digest()]);
    expect(() => unpackBackup(packed)).toThrow(M.errors.backupCorrupted);
  });

  it('recusa manifesto que não é JSON', () => {
    const header = Buffer.alloc(16);
    Buffer.from('ZKBACKUP', 'ascii').copy(header, 0);
    header.writeUInt32BE(1, 8);
    header.writeUInt32BE(3, 12);
    const body = Buffer.concat([header, Buffer.from('{{{', 'utf8')]);
    const packed = Buffer.concat([body, crypto.createHash('sha256').update(body).digest()]);
    expect(() => unpackBackup(packed)).toThrow(M.errors.backupCorrupted);
  });

  it('recusa manifesto que declara mais bytes do que o pacote tem', () => {
    // o comprimento vem do cabeçalho: um valor maior faria o `JSON.parse` ler bytes do payload
    const packed = packBackup([FILE], '1.0.0');
    packed.writeUInt32BE(4096, 12);
    expect(() => unpackBackup(packed)).toThrow(M.errors.backupCorrupted);
  });

  it('recusa arquivo que o manifesto diz ser maior que o payload inteiro', () => {
    // `size` além do fim do pacote: o `subarray` devolveria menos bytes do que o SHA-256 exige
    const manifest = {
      app: 'Guardinha',
      version: '1.0.0',
      createdAt: 1,
      files: [
        {
          path: 'vault.zkv',
          size: 4096,
          sha256: crypto.createHash('sha256').update(Buffer.alloc(4096)).digest('hex'),
        },
      ],
    };
    expect(() => unpackBackup(rawPack(manifest, Buffer.from('apenas quatro bytes')))).toThrow(
      M.errors.backupCorrupted,
    );
  });

  it('recusa manifesto com campo faltando ou fora do formato', () => {
    const casos: unknown[] = [
      null,
      'texto',
      { app: '', version: '1', createdAt: 1, files: [] },
      { app: 'Guardinha', version: 1, createdAt: 1, files: [] },
      { app: 'Guardinha', version: '1', createdAt: 'hoje', files: [] },
      { app: 'Guardinha', version: '1', createdAt: 1, files: 'x' },
      // item da lista que não é registro: o manifesto é dado de fora e cada item é conferido
      { app: 'Guardinha', version: '1', createdAt: 1, files: ['vault.zkv'] },
      { app: 'Guardinha', version: '1', createdAt: 1, files: [null] },
      {
        app: 'Guardinha',
        version: '1',
        createdAt: 1,
        files: [{ path: '../fora', size: 1, sha256: 'a'.repeat(64) }],
      },
      {
        app: 'Guardinha',
        version: '1',
        createdAt: 1,
        files: [{ path: 'vault.zkv', size: -1, sha256: 'a'.repeat(64) }],
      },
      {
        app: 'Guardinha',
        version: '1',
        createdAt: 1,
        files: [{ path: 'vault.zkv', size: 1.5, sha256: 'a'.repeat(64) }],
      },
      {
        app: 'Guardinha',
        version: '1',
        createdAt: 1,
        files: [{ path: 'vault.zkv', size: 1, sha256: 'curto' }],
      },
      // o `&&` só recusaria com todas as condições verdadeiras; um array com o texto certo engana
      {
        app: 'Guardinha',
        version: '1',
        createdAt: 1,
        files: [{ path: ['vault.zkv'], size: 0, sha256: EMPTY_SHA }],
      },
      {
        app: 'Guardinha',
        version: '1',
        createdAt: 1,
        files: [{ path: 'vault.zkv', size: null, sha256: EMPTY_SHA }],
      },
      {
        app: 'Guardinha',
        version: '1',
        createdAt: 1,
        files: [{ path: 'vault.zkv', size: 0, sha256: [EMPTY_SHA] }],
      },
    ];
    for (const manifest of casos) {
      // sem payload: com um byte sobrando o manifesto inválido nunca chegaria a ser lido
      expect(
        () => unpackBackup(rawPack(manifest, Buffer.alloc(0))),
        JSON.stringify(manifest),
      ).toThrow(M.errors.backupCorrupted);
    }
  });
});
