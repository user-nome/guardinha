import { describe, expect, it } from 'vitest';
import { en } from '@zero/messages/en';
import { ja } from '@zero/messages/ja';
import { ko } from '@zero/messages/ko';
import { ptBR } from '@zero/messages/pt-BR';
import { zhCN } from '@zero/messages/zh-CN';

/**
 * O teste de paridade (`parity.test.ts`) confere chaves, tipos e aridade, mas
 * nunca **chama** as funções de mensagem. Um `${n}` que o tradutor perdeu ao
 * reescrever a frase passaria pela paridade e apareceria na tela como
 * "caracteres" sem número. Aqui toda função é chamada nos dois idiomas e cada
 * argumento precisa reaparecer no texto.
 */

/** Valores representativos, alternando número e texto para cobrir as duas formas. */
const SAMPLE = [42, 'EXEMPLO', 7, 'OUTRO'] as const;

function collect(value: unknown, prefix: string, out: Map<string, unknown>): void {
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      collect(child, prefix === '' ? key : `${prefix}.${key}`, out);
    }
    return;
  }
  out.set(prefix, value);
}

function functionsOf(bundle: object): [string, (...args: unknown[]) => string][] {
  const leaves = new Map<string, unknown>();
  collect(bundle, '', leaves);
  const out: [string, (...args: unknown[]) => string][] = [];
  for (const [path, value] of leaves) {
    if (typeof value === 'function') {
      out.push([path, value as (...args: unknown[]) => string]);
    }
  }
  return out;
}

const PT_FUNCTIONS = functionsOf(ptBR);
const EN_FUNCTIONS = functionsOf(en);
const LOCALIZED_BUNDLES = [
  ['pt-BR', ptBR],
  ['en', en],
  ['ja', ja],
  ['ko', ko],
  ['zh-CN', zhCN],
] as const;

describe('funções de mensagem', () => {
  it('o bundle tem funções parametrizadas para exercitar', () => {
    expect(PT_FUNCTIONS.length).toBeGreaterThan(0);
    expect(EN_FUNCTIONS.map(([path]) => path)).toEqual(PT_FUNCTIONS.map(([path]) => path));
  });

  it.each(PT_FUNCTIONS.map(([path]) => path))('%s devolve texto em pt-BR', (path) => {
    const entry = PT_FUNCTIONS.find(([key]) => key === path);
    const fn = entry?.[1];
    expect(fn).toBeTypeOf('function');
    const args = SAMPLE.slice(0, fn?.length ?? 0);
    const out = fn?.(...args) ?? '';
    expect(out).toBeTypeOf('string');
    expect(out.trim()).not.toBe('');
  });

  it.each(EN_FUNCTIONS.map(([path]) => path))('%s devolve texto em en', (path) => {
    const entry = EN_FUNCTIONS.find(([key]) => key === path);
    const fn = entry?.[1];
    expect(fn).toBeTypeOf('function');
    const args = SAMPLE.slice(0, fn?.length ?? 0);
    const out = fn?.(...args) ?? '';
    expect(out).toBeTypeOf('string');
    expect(out.trim()).not.toBe('');
  });

  it('nenhum parâmetro desaparece na tradução', () => {
    // o defeito clássico de i18n: reescrever a frase e esquecer o `${}`
    const missing: string[] = [];
    for (const [path, ptFn] of PT_FUNCTIONS) {
      const enFn = EN_FUNCTIONS.find(([key]) => key === path)?.[1];
      if (enFn === undefined) continue;
      const args = SAMPLE.slice(0, ptFn.length);
      const rendered = enFn(...args);
      for (const arg of args) {
        if (!rendered.includes(String(arg))) missing.push(`${path} <- ${String(arg)}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('as versões em pt-BR e en usam os mesmos parâmetros', () => {
    // mesma aridade já é testada na paridade; aqui o foco é o texto final
    const mismatched: string[] = [];
    for (const [path, ptFn] of PT_FUNCTIONS) {
      const enFn = EN_FUNCTIONS.find(([key]) => key === path)?.[1];
      if (enFn === undefined) continue;
      const args = SAMPLE.slice(0, ptFn.length);
      if (ptFn(...args).trim() === enFn(...args).trim()) {
        // texto idêntico é permitido em rótulos curtos, mas não em frases com
        // parâmetro: ali significa que o inglês não foi traduzido
        mismatched.push(path);
      }
    }
    expect(mismatched).toEqual([]);
  });

  it.each(LOCALIZED_BUNDLES)('%s executa todas as funções de mensagem', (_language, bundle) => {
    for (const [path, fn] of functionsOf(bundle)) {
      const args = SAMPLE.slice(0, fn.length);
      expect(fn(...args), path).toEqual(expect.any(String));
      expect(fn(...args).trim(), path).not.toBe('');
    }
  });

  it.each(LOCALIZED_BUNDLES)('%s formata versões ausentes e explícitas', (_language, bundle) => {
    const unsupported = bundle.errors.vaultUnsupportedVersion;
    expect(unsupported()).toContain('Guardinha');
    expect(unsupported(5)).toContain('v5');
  });

  it('nenhuma mensagem vazia ou com marcador quebrado', () => {
    const leaves = new Map<string, unknown>();
    collect(ptBR, '', leaves);
    for (const [path, value] of leaves) {
      if (typeof value !== 'string') continue;
      expect(value.trim(), path).not.toBe('');
      // `**` e `` ` `` precisam vir em pares, senão o richText vaza texto cru
      const stars = value.split('**').length - 1;
      expect(stars % 2, path).toBe(0);
      const ticks = value.split('`').length - 1;
      expect(ticks % 2, path).toBe(0);
    }
  });
});
