import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { LANGUAGES } from '@zero/messages';
import { writeSecretFile } from '@zero/main/structure';
import type { AppSettings, Language } from '@zero/types';

/** Configurações não sensíveis em XDG ($XDG_CONFIG_HOME/guardinha/). */
function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg !== undefined && xdg !== '' ? xdg : path.join(os.homedir(), '.config');
  return path.join(base, 'guardinha');
}

function settingsFile(): string {
  return path.join(configDir(), 'settings.json');
}

/** Objeto JSON para leitura campo a campo; qualquer outra forma é objeto vazio. */
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? { ...value } : {};
}

function normalizeLanguage(value: unknown): Language {
  const language = LANGUAGES.find((candidate) => candidate === value);
  if (language !== undefined) return language;
  return 'pt-BR';
}

export function loadSettings(): AppSettings {
  if (!fs.existsSync(settingsFile())) return { language: 'pt-BR' };
  try {
    // `readJsonSync` devolve `any`: o arquivo é do usuário e pode ser qualquer
    // coisa, então ele vira `unknown` e quem decide o formato é
    // `normalizeLanguage`, não uma afirmação de tipo feita aqui.
    const raw: unknown = fs.readJsonSync(settingsFile());
    return { language: normalizeLanguage(asRecord(raw).language) };
  } catch {
    return { language: 'pt-BR' };
  }
}

export function saveSettings(settings: AppSettings): AppSettings {
  const normalized: AppSettings = { language: normalizeLanguage(settings.language) };
  fs.ensureDirSync(configDir(), { mode: 0o700 });
  fs.chmodSync(configDir(), 0o700);
  writeSecretFile(settingsFile(), JSON.stringify(normalized, null, 2));
  return normalized;
}
