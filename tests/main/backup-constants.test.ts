// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  BACKUP_MAGIC,
  BACKUP_VERSION,
  BACKUP_HEADER_BYTES,
  BACKUP_DIGEST_BYTES,
  BACKUP_FILE_PATH,
  BACKUP_APP_NAME,
} from '@zero/main/backup-constants';

/**
 * As constantes do formato de backup são usadas pelo `backup-container.ts` e
 * pelo `backup.ts`. Este teste garante que os valores exportados existem e
 * têm o formato esperado.
 */

describe('backup-constants', () => {
  it('BACKUP_MAGIC é o buffer esperado', () => {
    expect(BACKUP_MAGIC).toBeInstanceOf(Buffer);
    expect(BACKUP_MAGIC.toString('ascii')).toBe('ZKBACKUP');
    expect(BACKUP_MAGIC.length).toBe(8);
  });

  it('BACKUP_VERSION é 1', () => {
    expect(BACKUP_VERSION).toBe(1);
  });

  it('BACKUP_HEADER_BYTES é 16 (magic + version + manifestLen)', () => {
    expect(BACKUP_HEADER_BYTES).toBe(16);
  });

  it('BACKUP_DIGEST_BYTES é 32 (SHA-256)', () => {
    expect(BACKUP_DIGEST_BYTES).toBe(32);
  });

  it('BACKUP_FILE_PATH aceita caminhos válidos', () => {
    expect(BACKUP_FILE_PATH.test('vault.zkv')).toBe(true);
    expect(BACKUP_FILE_PATH.test('.entries/abc123.zke')).toBe(true);
    expect(BACKUP_FILE_PATH.test('.auth/def456.zka')).toBe(true);
  });

  it('BACKUP_FILE_PATH rejeita caminhos inválidos', () => {
    expect(BACKUP_FILE_PATH.test('vault.zkv.tmp')).toBe(false);
    // O padrão aceita UUIDs (com hífens), então `.entries/abc.zke` passa.
    // Para rejeitar, precisamos de um caminho com caractere inválido ou estrutura errada.
    expect(BACKUP_FILE_PATH.test('.entries/abc!.zke')).toBe(false);
    expect(BACKUP_FILE_PATH.test('.auth/def!.zka')).toBe(false);
    expect(BACKUP_FILE_PATH.test('../etc/passwd')).toBe(false);
    expect(BACKUP_FILE_PATH.test('vault')).toBe(false);
  });

  it('BACKUP_APP_NAME é "Guardinha"', () => {
    expect(BACKUP_APP_NAME).toBe('Guardinha');
  });
});
