import { describe, expect, it } from 'vitest';
import { LANGUAGES, LANGUAGE_LABELS, messages } from '@zero/messages';
import { en } from '@zero/messages/en';
import { ja } from '@zero/messages/ja';
import { ko } from '@zero/messages/ko';
import { ptBR } from '@zero/messages/pt-BR';
import { zhCN } from '@zero/messages/zh-CN';
import type { Language } from '@zero/types';

function collectLeaves(value: unknown, prefix: string, out: Map<string, unknown>): void {
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      collectLeaves(child, prefix === '' ? key : `${prefix}.${key}`, out);
    }
    return;
  }
  out.set(prefix, value);
}

function leavesOf(bundle: object): Map<string, unknown> {
  const out = new Map<string, unknown>();
  collectLeaves(bundle, '', out);
  return out;
}

/**
 * O bundle canônico é o pt-BR; os outros traduções. Cada um é conferido
 * separadamente, então traduzir `zh-CN` não pode quebrar o `ko`, e um bundle
 * novo entra na lista sem ninguém lembrar de estender o teste.
 */
const TRADUCOES: readonly Language[] = ['en', 'zh-CN', 'ko', 'ja'];

describe('bundles de mensagens', () => {
  it.each(TRADUCOES)('%s cobre exatamente as chaves do pt-BR (canônico)', (idioma) => {
    const canonical = [...leavesOf(ptBR).keys()].sort();
    const translated = [...leavesOf(messages(idioma)).keys()].sort();
    expect(translated).toEqual(canonical);
  });

  it.each(TRADUCOES)('%s mantém strings e funções com a mesma aridade', (idioma) => {
    const canonical = leavesOf(ptBR);
    const translated = leavesOf(messages(idioma));
    for (const [key, value] of canonical) {
      const other = translated.get(key);
      expect(typeof other).toBe(typeof value);
      if (typeof value === 'function') {
        const a = value as (...args: unknown[]) => unknown;
        const b = other as (...args: unknown[]) => unknown;
        expect(b.length).toBe(a.length);
      }
    }
  });

  it.each(TRADUCOES)('%s não deixa texto vazio nem marcador de rico pela metade', (idioma) => {
    for (const [key, value] of leavesOf(messages(idioma))) {
      if (typeof value !== 'string') continue;
      expect(value.trim(), `${idioma} em ${key} está vazio`).not.toBe('');
      // `**` e crase precisam vir em par, senão o richText mostra o marcador
      expect(value.split('**').length % 2, `${idioma} em ${key} tem ** sem par`).toBe(1);
      expect(value.split('`').length % 2, `${idioma} em ${key} tem crase sem par`).toBe(1);
    }
  });

  it('idiomas e rótulos nativos estão registrados na ordem de exibição', () => {
    // pt-BR primeiro (canônico) e inglês por último; entre eles, os três CJK
    expect(LANGUAGES).toEqual(['pt-BR', 'zh-CN', 'ko', 'ja', 'en']);
    expect(Object.keys(LANGUAGE_LABELS).sort()).toEqual([...LANGUAGES].sort());
    expect(LANGUAGE_LABELS['pt-BR']).toBe('Português (Brasil)');
    expect(LANGUAGE_LABELS['zh-CN']).toBe('简体中文');
    expect(LANGUAGE_LABELS.ko).toBe('한국어');
    expect(LANGUAGE_LABELS.ja).toBe('日本語');
    expect(LANGUAGE_LABELS.en).toBe('English');
  });

  it('messages() devolve o bundle correspondente', () => {
    expect(messages('pt-BR')).toBe(ptBR);
    expect(messages('zh-CN')).toBe(zhCN);
    expect(messages('ko')).toBe(ko);
    expect(messages('ja')).toBe(ja);
    expect(messages('en')).toBe(en);
  });

  it('todo idioma listado resolve para um bundle, e cada bundle é único', () => {
    const bundles = LANGUAGES.map((idioma) => messages(idioma));
    // dois idiomas apontando para o mesmo objeto significaria tradução faltando
    // (o `Record<Language, Messages>` do barrel já garante que existe bundle)
    expect(new Set(bundles).size).toBe(LANGUAGES.length);
  });
});
