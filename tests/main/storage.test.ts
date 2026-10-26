// @vitest-environment node
import fs from 'node:fs';
import fsExtra from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { packEntryPayload, packVaultContainer, sealManifest } from '@zero/main/container';
import { clearDestroyedFlag, markVaultDestroyed } from '@zero/main/erasure-state';
import { currentMessages } from '@zero/main/i18n';
import { containerFile } from '@zero/main/layout';
import {
  deleteEntry,
  listEntryIds,
  readEntryPayload,
  writeEntryPayload,
} from '@zero/main/entries-store';
import { ensureVaultStructure } from '@zero/main/structure';
import {
  readVaultContainer,
  updateManifest,
  vaultExists,
  verifyManifest,
  writeAuthState,
  writeVaultContainer,
} from '@zero/main/storage';
import type { VaultContainerData } from '@zero/main/container';

/**
 * Container e arquivos de credencial no layout atual. O formato do cofre não
 * tem mais caminho de leitura legado: o que o app grava é o que ele lê.
 */

const ENTRY_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ENTRY_PAYLOAD = {
  salt: 'ff'.repeat(16),
  iv: '00'.repeat(16),
  tag: '99'.repeat(16),
  encryptedData: 'ab',
};

const KDF = { algo: 'argon2id', memoryKiB: 65536, iterations: 3, parallelism: 4 } as const;

function container(): VaultContainerData {
  return {
    createdAt: 1_770_000_000_000,
    attempts: 1,
    lockUntil: null,
    attemptsMaster: 0,
    nukeLimit: 0,
    methods: {
      master: {
        kdf: KDF,
        kdfSalt: 'ab'.repeat(16),
        payload: {
          salt: 'cd'.repeat(16),
          iv: 'ef'.repeat(16),
          tag: '12'.repeat(16),
          encryptedData: '34',
        },
      },
    },
    manifest: null,
  };
}

interface SavedEnv {
  HOME: string | undefined;
  GUARDINHA_VAULT_DIR: string | undefined;
  GUARDINHA_VAR_LIB: string | undefined;
}

let savedEnv: SavedEnv;
const tempRoots: string[] = [];

function targetVaultDir(): string {
  return path.join(process.env.GUARDINHA_VAR_LIB ?? '', '.guardinha', '.vault');
}

beforeAll(() => {
  savedEnv = {
    HOME: process.env.HOME,
    GUARDINHA_VAULT_DIR: process.env.GUARDINHA_VAULT_DIR,
    GUARDINHA_VAR_LIB: process.env.GUARDINHA_VAR_LIB,
  };
  const varLib = fs.mkdtempSync(path.join(os.tmpdir(), 'guardinha-storage-'));
  tempRoots.push(varLib);
  process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'guardinha-storage-home-'));
  process.env.GUARDINHA_VAR_LIB = varLib;
  delete process.env.GUARDINHA_VAULT_DIR;
});

afterAll(() => {
  process.env.HOME = savedEnv.HOME;
  if (savedEnv.GUARDINHA_VAULT_DIR === undefined) delete process.env.GUARDINHA_VAULT_DIR;
  else process.env.GUARDINHA_VAULT_DIR = savedEnv.GUARDINHA_VAULT_DIR;
  if (savedEnv.GUARDINHA_VAR_LIB === undefined) delete process.env.GUARDINHA_VAR_LIB;
  else process.env.GUARDINHA_VAR_LIB = savedEnv.GUARDINHA_VAR_LIB;
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true });
});

describe('container do cofre no layout atual', () => {
  beforeAll(() => {
    ensureVaultStructure();
    writeVaultContainer(container());
  });

  it('grava e lê o container', () => {
    expect(vaultExists()).toBe(true);
    const read = readVaultContainer();
    expect(read?.createdAt).toBe(1_770_000_000_000);
    expect(read?.methods.master?.kdfSalt).toBe('ab'.repeat(16));
    expect(read?.attempts).toBe(1);
  });

  it('usa permissões restritas (0700 nas pastas, 0600 nos arquivos)', () => {
    ensureVaultStructure();
    writeEntryPayload(ENTRY_ID, ENTRY_PAYLOAD);
    expect(fs.statSync(targetVaultDir()).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(targetVaultDir(), '.entries')).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(targetVaultDir(), 'vault.zkv')).mode & 0o777).toBe(0o600);
    expect(
      fs.statSync(path.join(targetVaultDir(), '.entries', `${ENTRY_ID}.zke`)).mode & 0o777,
    ).toBe(0o600);
  });

  it('é idempotente (rodar de novo não altera o container)', () => {
    const containerPath = path.join(targetVaultDir(), 'vault.zkv');
    const before = fs.readFileSync(containerPath);
    expect(vaultExists()).toBe(true);
    expect(readVaultContainer()).not.toBeNull();
    expect(fs.readFileSync(containerPath).equals(before)).toBe(true);
  });

  it('grava a credencial em .entries/ e a lê de volta', () => {
    expect(listEntryIds()).toContain(ENTRY_ID);
    expect(readEntryPayload(ENTRY_ID)).toEqual(ENTRY_PAYLOAD);
    expect(fs.existsSync(path.join(targetVaultDir(), '.entries', `${ENTRY_ID}.zke`))).toBe(true);
  });

  it('não existe mais layout visível nem extensão legada', () => {
    const entries = path.join(targetVaultDir(), '.entries');
    expect(fs.existsSync(path.join(targetVaultDir(), 'entries'))).toBe(false);
    // `.enc` foi o payload em JSON de uma versão que não existe mais
    expect(fs.existsSync(path.join(entries, `${ENTRY_ID}.enc`))).toBe(false);
  });

  it('empacota o container com o magic esperado', () => {
    const raw = packVaultContainer(container());
    expect(raw.subarray(0, 8).toString('ascii')).toBe('ZKVAULT1');
    expect(packEntryPayload(ENTRY_PAYLOAD).subarray(0, 8).toString('ascii')).toBe('ZENTRY01');
  });
});

describe('path traversal bloqueado na camada de storage (CVE-2026-21589)', () => {
  it('recusa id com separador, nulo ou vazio antes de montar o caminho', () => {
    expect(() => readEntryPayload('../../vault.zkv')).toThrow(currentMessages().errors.invalidId);
    expect(() => writeEntryPayload('..\\..\\fora', ENTRY_PAYLOAD)).toThrow(
      currentMessages().errors.invalidId,
    );
    expect(() => deleteEntry('/etc/passwd')).toThrow(currentMessages().errors.invalidId);
    expect(() => deleteEntry('')).toThrow(currentMessages().errors.invalidId);
    expect(() => deleteEntry(String.fromCharCode(0))).toThrow(currentMessages().errors.invalidId);
  });
});

describe('erros de payload e manifesto adulterados', () => {
  it('recusa bytes que não formam um payload de credencial', () => {
    const id = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const file = path.join(targetVaultDir(), '.entries', `${id}.zke`);
    fs.writeFileSync(file, 'payload inválido');

    expect(() => readEntryPayload(id)).toThrow(currentMessages().errors.vaultTampered);
  });

  it('converte falha de leitura do container em erro de adulteração', () => {
    const read = vi.spyOn(fsExtra, 'readFileSync').mockImplementationOnce(() => {
      throw new Error('erro de I/O');
    });
    expect(() => readVaultContainer()).toThrow(currentMessages().errors.vaultTampered);
    read.mockRestore();
  });

  it('recusa container com formato inválido como adulterado', () => {
    fs.writeFileSync(containerFile(), 'container inválido');
    expect(() => readVaultContainer()).toThrow(currentMessages().errors.vaultTampered);
  });

  it('recusa manifesto cifrado com outra chave', () => {
    writeVaultContainer(container());
    const data = readVaultContainer();
    if (data === null) throw new Error('container de teste não foi gravado');
    data.manifest = sealManifest(Buffer.alloc(32, 1), [], []);
    writeVaultContainer(data);

    expect(() => verifyManifest(Buffer.alloc(32, 2))).toThrow(
      currentMessages().errors.vaultTampered,
    );
  });
});

describe('a varredura ignora o que não é credencial', () => {
  it('arquivo estranho em .entries/ não vira id na lista', () => {
    // `listEntryIds` filtra pelo sufixo. Sem o filtro, o `.tmp` de uma escrita
    // em curso apareceria como credencial na lista da interface.
    const entries = path.join(targetVaultDir(), '.entries');
    fs.writeFileSync(path.join(entries, 'escrito-vez.zke.tmp'), 'meio de escrita');
    fs.writeFileSync(path.join(entries, 'notas.txt'), 'anotacao');

    // A lista é exatamente o que está em disco com a extensão da credencial, e
    // nada mais: conferir só que o nome esperado não apareceu deixaria passar
    // um id tirado do nome errado.
    const noDisco = fs
      .readdirSync(entries)
      .filter((name) => name.endsWith('.zke'))
      .map((name) => name.slice(0, -'.zke'.length))
      .sort();
    const ids = [...listEntryIds()].sort();

    expect(ids).toContain(ENTRY_ID);
    expect(ids).toEqual(noDisco);
  });

  it('id bem formado cujo arquivo sumiu dá erro de credencial inexistente', () => {
    // O id passa pela validação de forma e só esbarra na ausência do arquivo.
    expect(() => readEntryPayload('0f0f0f0f-0000-4000-8000-000000000000')).toThrow(
      currentMessages().errors.entryNotFound,
    );
  });

  it('escrever depois de um Cryptographic Erase não ressuscita o container', () => {
    // A guarda de `writeVaultContainer`: com o cofre marcado como destruído, a
    // escrita sai sem tocar o disco. Sem ela, um read-modify-write com a chave
    // ainda em memória criaria um `vault.zkv` pela metade e o cofre destruído
    // voltaria a parecer "adulterado" em vez de "inexistente".
    const data = readVaultContainer();
    if (data === null) throw new Error('container de teste ausente');
    const antes = fs.readFileSync(containerFile());

    markVaultDestroyed();
    try {
      writeVaultContainer(data);

      expect(fs.readFileSync(containerFile()).equals(antes)).toBe(true);
    } finally {
      clearDestroyedFlag();
    }
  });
});

describe('manifesto: sem selo não há linha de base', () => {
  it('não sela um manifesto ausente: re-selar aceitaria exclusões silenciosas', () => {
    // O manifesto é a linha de base do cofre. Se `verifyManifest` selasse um
    // campo nulo, apagar um `.zke` por fora e chamar a listagem adotaria o
    // diretório já mutilado como estado legítimo. A ausência do selo é
    // adulteração, e o arquivo não pode ser reescrito no caminho de leitura.
    const chave = Buffer.alloc(32, 11);
    const data = container();
    data.manifest = null;
    writeVaultContainer(data);
    const noDisco = fs.readFileSync(containerFile());

    expect(() => verifyManifest(chave)).toThrow(currentMessages().errors.vaultTampered);
    expect(fs.readFileSync(containerFile()).equals(noDisco)).toBe(true);
  });
});

describe('verifyManifest com o arquivo fora do esperado', () => {
  it('sem container, diz que o cofre não existe', () => {
    const arquivo = containerFile();
    const backup = fs.readFileSync(arquivo);
    fs.rmSync(arquivo, { force: true });
    try {
      expect(() => verifyManifest(Buffer.alloc(32, 7))).toThrow(
        currentMessages().errors.vaultMissing,
      );
    } finally {
      fs.writeFileSync(arquivo, backup);
    }
  });

  it('atualizar o manifesto sem cofre não é erro, é não ter o que selar', () => {
    // `updateManifest` roda depois de salvar ou remover. Um cofre que não
    // existe não é erro de aplicação: o código devolve calado, e sem a guarda
    // o `data.manifest` derrubaria a exceção por cima da tela de autenticação.
    const arquivo = containerFile();
    const backup = fs.readFileSync(arquivo);
    fs.rmSync(arquivo, { force: true });
    try {
      expect(() => updateManifest(Buffer.alloc(32, 7))).not.toThrow();
      expect(fs.existsSync(arquivo)).toBe(false);
    } finally {
      fs.writeFileSync(arquivo, backup);
    }
  });

  it('gravar estado de trava sem cofre não é erro nem cria o container', () => {
    // A tela de desbloqueio atualiza a trava mesmo quando o cofre acabou de
    // sumir; sem a guarda, o acesso a `data.attempts` estoura por cima da tela.
    const arquivo = containerFile();
    const backup = fs.readFileSync(arquivo);
    fs.rmSync(arquivo, { force: true });
    try {
      expect(() =>
        writeAuthState({ attempts: 9, lockUntil: null, attemptsMaster: 2, nukeLimit: 0 }),
      ).not.toThrow();
      expect(fs.existsSync(arquivo)).toBe(false);
    } finally {
      fs.writeFileSync(arquivo, backup);
    }
  });

  it('updateManifest é o único caminho explícito de re-selar', () => {
    // A escrita de credencial chama `updateManifest` depois de gravar; é ele
    // que move a linha de base, nunca o caminho de leitura.
    const chave = Buffer.alloc(32, 3);
    const data = container();
    data.manifest = sealManifest(chave, [], []);
    writeVaultContainer(data);
    const antes = readVaultContainer()?.manifest;

    const id = 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    writeEntryPayload(id, ENTRY_PAYLOAD);
    updateManifest(chave);

    expect(readVaultContainer()?.manifest).not.toEqual(antes);
    expect(() => verifyManifest(chave)).not.toThrow();
    fs.rmSync(path.join(targetVaultDir(), '.entries', `${id}.zke`), {
      force: true,
    });
  });
});
