// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { currentMessages } from '@zero/main/i18n';
import { createVault } from '@zero/main/vault';

const MASTER = 'senha-mestra-guardinha24';
const PIN = '49201733';
const PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';

describe('criação do cofre sem permissão na raiz (/var/lib)', () => {
  it('responde vaultAuthCancelled (e não dispara pkexec em teste/dev)', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'guardinha-ro-'));
    fs.chmodSync(base, 0o555);
    const saved = process.env.GUARDINHA_VAULT_DIR;
    process.env.GUARDINHA_VAULT_DIR = path.join(base, 'cofre');

    try {
      const result = await createVault({
        masterPassword: MASTER,
        pin: PIN,
        recoveryPhrase: PHRASE,
      });
      expect(result).toMatchObject({
        ok: false,
        error: currentMessages().errors.vaultAuthCancelled,
      });
    } finally {
      if (saved === undefined) delete process.env.GUARDINHA_VAULT_DIR;
      else process.env.GUARDINHA_VAULT_DIR = saved;
      fs.chmodSync(base, 0o700);
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
