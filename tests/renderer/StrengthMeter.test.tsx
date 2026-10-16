import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '@zero/renderer/i18n';
import { StrengthMeter } from '@zero/renderer/components/StrengthMeter';
import { evaluatePassword } from '@zero/shared';
import type { StrengthResult } from '@zero/shared';

/**
 * A barra de força é informativa: quem bloqueia é quem chama. Mesmo assim ela
 * tem decisões próprias (o `score` é limitado a 0..4, o primeiro segmento acende
 * sempre, e o motivo só aparece quando existe), e é o que o usuário lê para
 * entender por que o cofre recusou a senha.
 */

function result(overrides: Partial<StrengthResult> = {}): StrengthResult {
  return { score: 0, level: 'veryWeak', blocked: false, reasons: [], ...overrides };
}

function segments(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[aria-hidden="true"] > span')].map(
    (node) => node.getAttribute('class') ?? '',
  );
}

function renderMeter(input: StrengthResult, hint?: string): HTMLElement {
  const { container } = render(
    <MessagesProvider language="pt-BR">
      <StrengthMeter result={input} {...(hint === undefined ? {} : { hint })} />
    </MessagesProvider>,
  );
  return container;
}

describe('StrengthMeter', () => {
  it('acende exatamente `score` segmentos, mais o primeiro', () => {
    for (const score of [0, 1, 2, 3, 4]) {
      const lit = segments(renderMeter(result({ score }))).filter(
        (className) =>
          className.includes('bg-rose') ||
          className.includes('bg-amber') ||
          className.includes('bg-yellow') ||
          className.includes('bg-emerald'),
      );
      expect(lit.length).toBe(Math.max(1, score));
    }
  });

  it('desenha sempre os quatro segmentos, acesos ou não', () => {
    for (const score of [0, 2, 4]) {
      const all = segments(renderMeter(result({ score })));
      expect(all.length).toBe(4);
    }
    const meio = segments(renderMeter(result({ score: 2 })));
    expect(meio[0]).not.toContain('bg-slate-800');
    expect(meio[2]).toContain('bg-slate-800');
    expect(meio[3]).toContain('bg-slate-800');
  });

  it('limita o score nas duas pontas, sem barra quebrada', () => {
    // O `score` vem do cálculo de força; um valor fora de 0..4 não pode gerar
    // segmento extra nem índice `undefined` na tabela de cores.
    expect(segments(renderMeter(result({ score: -3 }))).length).toBe(4);
    expect(segments(renderMeter(result({ score: 9 }))).length).toBe(4);
    expect(
      segments(renderMeter(result({ score: -3 }))).filter((c) => c.includes('bg-slate')).length,
    ).toBe(3);
  });

  it('mostra a nota vinda do resultado, não um índice calculado', () => {
    render(
      <MessagesProvider language="pt-BR">
        <StrengthMeter result={evaluatePassword('Xk9#mQ2$vLp8!Rt4&Wy6^Zn1')} />
      </MessagesProvider>,
    );
    expect(screen.getByText('Muito forte')).toBeInTheDocument();
  });

  it('lista os motivos e esconde a linha quando não há nenhum', () => {
    const { unmount } = render(
      <MessagesProvider language="pt-BR">
        <StrengthMeter result={result({ score: 1, reasons: ['allSame', 'sequence'] })} />
      </MessagesProvider>,
    );
    expect(screen.getByText(/mesmo caractere repetido · sequência óbvia/)).toBeInTheDocument();
    unmount();

    render(
      <MessagesProvider language="pt-BR">
        <StrengthMeter result={result({ score: 4, reasons: [] })} />
      </MessagesProvider>,
    );
    expect(screen.queryByText('mesmo caractere repetido')).not.toBeInTheDocument();
  });

  it('mostra a dica quando vem e não cria parágrafo vazio quando não vem', () => {
    const { container, unmount } = render(
      <MessagesProvider language="pt-BR">
        <StrengthMeter result={result({ score: 2 })} hint="Use a mesma do banco" />
      </MessagesProvider>,
    );
    expect(screen.getByText('Use a mesma do banco')).toBeInTheDocument();
    unmount();

    render(
      <MessagesProvider language="pt-BR">
        <StrengthMeter result={result({ score: 2 })} />
      </MessagesProvider>,
    );
    expect(screen.queryByText('Use a mesma do banco')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('undefined');
  });
});

describe('a linha de motivos é condicional de verdade', () => {
  it('sem motivo e sem dica, o componente não deixa nenhum parágrafo para trás', () => {
    // A linha dos motivos só existe quando há motivo. Renderizá-la vazia
    // deixaria um parágrafo sem texto na tela, que é o que o `> 0` evita.
    const { container } = render(
      <MessagesProvider language="pt-BR">
        <StrengthMeter result={result({ score: 4, reasons: [] })} />
      </MessagesProvider>,
    );

    expect(container.querySelectorAll('p')).toHaveLength(0);
  });
});
