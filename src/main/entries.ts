import { validateDomainFormat, validateUsernameFormat } from '@zero/main/auth';
import { vaultStorage } from '@zero/main/facade';
import { requireSessionKey, touch } from '@zero/main/vault';
import { vaultSession } from '@zero/main/session';
import { currentMessages } from '@zero/main/i18n';
import { isUuid } from '@zero/shared';
import type { Credential, CredentialInput } from '@zero/types';

/** Todas as credenciais decifradas, da mais recente para a mais antiga; falha fechado. */
export function listEntries(): Credential[] {
  // sessão decoy (PIN de coação): o cofre foi destruído e não há o que decifrar
  if (vaultSession().isDecoy()) return [];
  const key = requireSessionKey();
  vaultStorage.verifyManifest(key);
  const records = vaultStorage.listIds().map((id) => vaultStorage.readRecord(id, key));
  records.sort((a, b) => b.updatedAt - a.updatedAt);
  touch();
  return records;
}

/** Valida, cifra e grava a credencial em arquivo próprio (<uuid>.zke). */
export function saveEntry(input: CredentialInput): Credential[] {
  const key = requireSessionKey();
  const m = currentMessages();

  const title = input.title.trim();
  if (title === '') throw new Error(m.errors.invalidTitle);
  if (!validateUsernameFormat(input.username.trim())) throw new Error(m.errors.invalidUsername);
  const domain = input.domain.trim().toLowerCase();
  if (!validateDomainFormat(domain)) throw new Error(m.errors.invalidDomain);

  const now = Date.now();
  let id = vaultStorage.newId();
  let createdAt = now;

  if (input.id !== undefined && input.id !== '') {
    if (!isUuid(input.id)) throw new Error(m.errors.invalidId);
    if (!vaultStorage.listIds().includes(input.id)) throw new Error(m.errors.entryNotFound);
    // a fachada já responde adulteração quando o arquivo não decifra
    const stored = vaultStorage.readRecord(input.id, key);
    id = input.id;
    createdAt = stored.createdAt;
  }

  const record: Credential = {
    id,
    title,
    username: input.username.trim(),
    password: input.password,
    domain,
    notes: input.notes,
    createdAt,
    updatedAt: now,
  };
  vaultStorage.writeRecord(record, key);
  touch();
  return listEntries();
}

/** Remove o arquivo cifrado da credencial e re-sella o manifesto. */
export function removeEntry(id: string): Credential[] {
  const key = requireSessionKey();
  const m = currentMessages();
  if (!isUuid(id)) throw new Error(m.errors.invalidId);
  if (!vaultStorage.listIds().includes(id)) throw new Error(m.errors.entryNotFound);
  vaultStorage.removeRecord(id, key);
  touch();
  return listEntries();
}
