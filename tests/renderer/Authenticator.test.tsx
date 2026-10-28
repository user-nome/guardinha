import { describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MessagesProvider } from '@zero/renderer/i18n';
import { Authenticator } from '@zero/renderer/components/Authenticator';
import { AuthTokenModal } from '@zero/renderer/components/AuthTokenModal';
import { installApi } from '../mocks/api.ts';
import type { AuthCode, AuthToken } from '@zero/types';

const GITHUB_URI =
  'otpauth://totp/GitHub:alice@github.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=GitHub';

function token(overrides: Partial<AuthToken> = {}): AuthToken {
  return {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    issuer: 'GitHub',
    account: 'alice@github.com',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function code(id: string, value = '071271', remainingMs = 25_000): AuthCode {
  return { id, code: value, remainingMs };
}

/** O card e o diálogo têm botões "Excluir"; o do diálogo é o último da lista. */
function confirmDelete(): HTMLElement {
  const all = screen.getAllByRole('button', { name: 'Excluir' });
  const last = all[all.length - 1];
  if (last === undefined) throw new Error('diálogo de confirmação não aberto');
  return last;
}

function renderScreen(tokens: AuthToken[], codes: AuthCode[] = []): void {
  const api = installApi({ tokens });
  api.authenticator.codes = () => Promise.resolve(codes);
  render(
    <MessagesProvider language="pt-BR">
      <Authenticator onToast={() => undefined} />
    </MessagesProvider>,
  );
}

/** Barra de progresso do card, pelo `style` inline que carrega a fração desenhada. */
function barFor(codeText: string): HTMLElement {
  const bar = screen.getByText(codeText).closest('li')?.querySelector('div[style]');
  if (!(bar instanceof HTMLElement)) throw new Error('barra do token não encontrada');
  return bar;
}

/** Congela o relógio em `1_000_000`; com timer falso, o carregamento sai por `act`. */
async function renderFrozen(
  tokens: AuthToken[],
  codes: AuthCode[] | (() => Promise<AuthCode[]>),
): Promise<void> {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  const api = installApi({ tokens });
  api.authenticator.codes = typeof codes === 'function' ? codes : () => Promise.resolve(codes);
  render(
    <MessagesProvider language="pt-BR">
      <Authenticator onToast={() => undefined} />
    </MessagesProvider>,
  );
  await act(() => Promise.resolve());
}

/** Monta o modal de token com os manipuladores vazios. */
function renderModal(token: AuthToken | null): void {
  render(
    <MessagesProvider language="pt-BR">
      <AuthTokenModal
        token={token}
        onClose={() => undefined}
        onSaved={() => undefined}
        onError={() => undefined}
      />
    </MessagesProvider>,
  );
}

/** Promise que só resolve quando o teste chama `resolve`, para olhar o "salvando". */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let release: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: (value) => release(value) };
}

describe('tela do verificador 2FA', () => {
  it('mostra o serviço e a conta de cada token', async () => {
    renderScreen([token()], [code('aaaaaaaa-1111-4111-8111-111111111111')]);

    // antes de a lista resolver, o estado de carregamento ocupa a tela
    expect(screen.getByText('Abrindo os tokens…')).toBeInTheDocument();
    expect(await screen.findByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('alice@github.com')).toBeInTheDocument();
  });

  it('mostra o código que o main calculou, nunca o segredo', async () => {
    renderScreen([token()], [code('aaaaaaaa-1111-4111-8111-111111111111')]);

    expect(await screen.findByText('071271')).toBeInTheDocument();
    expect(screen.queryByText(/GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ/)).not.toBeInTheDocument();
  });

  it('mostra o estado vazio com a instrução de como adicionar', async () => {
    renderScreen([]);

    expect(await screen.findByText('Nenhum token ainda')).toBeInTheDocument();
    expect(screen.getByText(/otpauth:\/\//)).toBeInTheDocument();
    // a coluna larga é a que cabe o cartão do token
    expect(document.querySelector('.max-w-6xl')).not.toBeNull();
  });

  it('nomeia o token sem emissor em vez de deixar a linha em branco', async () => {
    renderScreen([token({ issuer: '', account: 'conta@example.com' })], []);

    expect(await screen.findByText('Sem serviço')).toBeInTheDocument();
    expect(screen.getByText('conta@example.com')).toBeInTheDocument();
  });

  it('pede o código enquanto o token ainda não chegou do main', async () => {
    renderScreen([token()], []);

    expect(await screen.findByText('······')).toBeInTheDocument();
  });

  it('copia o código com limpeza e avisa que ele expira', async () => {
    const user = userEvent.setup();
    const api = installApi({ tokens: [token()] });
    api.authenticator.codes = () => Promise.resolve([code('aaaaaaaa-1111-4111-8111-111111111111')]);
    const copy = vi.fn().mockResolvedValue(undefined);
    api.clipboard.copy = copy;
    const onToast = vi.fn();
    render(
      <MessagesProvider language="pt-BR">
        <Authenticator onToast={onToast} />
      </MessagesProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('071271')).toBeInTheDocument();
    });

    await user.click(screen.getByTitle('Copiar'));

    expect(copy).toHaveBeenCalledWith('071271');
    expect(onToast).toHaveBeenCalledWith('Código copiado. Ele expira em poucos segundos.');
  });

  it('avisa quando a cópia falha', async () => {
    const user = userEvent.setup();
    const api = installApi({ tokens: [token()] });
    api.authenticator.codes = () => Promise.resolve([code('aaaaaaaa-1111-4111-8111-111111111111')]);
    api.clipboard.copy = vi.fn().mockRejectedValue(new Error('sem área de transferência'));
    const onToast = vi.fn();
    render(
      <MessagesProvider language="pt-BR">
        <Authenticator onToast={onToast} />
      </MessagesProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('071271')).toBeInTheDocument();
    });

    await user.click(screen.getByTitle('Copiar'));

    expect(onToast).toHaveBeenCalledWith('sem área de transferência');
  });

  it('desabilita a cópia enquanto não há código', async () => {
    renderScreen([token()], []);
    await screen.findByText('······');
    expect(screen.getByTitle('Copiar')).toBeDisabled();
  });

  it('exclui o token depois de confirmar, e some da lista', async () => {
    const user = userEvent.setup();
    const api = installApi({ tokens: [token()] });
    const remove = vi.fn().mockResolvedValue([]);
    api.authenticator.remove = remove;
    const onToast = vi.fn();
    render(
      <MessagesProvider language="pt-BR">
        <Authenticator onToast={onToast} />
      </MessagesProvider>,
    );
    await screen.findByText('GitHub');

    await user.click(screen.getByTitle('Excluir'));
    expect(screen.getByText(/Esta ação não pode ser desfeita/)).toBeInTheDocument();

    await user.click(confirmDelete());

    expect(remove).toHaveBeenCalledWith('aaaaaaaa-1111-4111-8111-111111111111');
    await waitFor(() => {
      expect(screen.getByText('Nenhum token ainda')).toBeInTheDocument();
    });
    expect(onToast).toHaveBeenCalledWith('Token removido.');
  });

  it('cancela a exclusão sem chamar o cofre', async () => {
    const user = userEvent.setup();
    const api = installApi({ tokens: [token()] });
    const remove = vi.fn();
    api.authenticator.remove = remove;
    render(
      <MessagesProvider language="pt-BR">
        <Authenticator onToast={vi.fn()} />
      </MessagesProvider>,
    );
    await screen.findByText('GitHub');

    await user.click(screen.getByTitle('Excluir'));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('mostra o erro quando a exclusão falha', async () => {
    const user = userEvent.setup();
    const api = installApi({ tokens: [token()] });
    api.authenticator.remove = vi.fn().mockRejectedValue(new Error('Cofre bloqueado.'));
    const onToast = vi.fn();
    render(
      <MessagesProvider language="pt-BR">
        <Authenticator onToast={onToast} />
      </MessagesProvider>,
    );
    await screen.findByText('GitHub');

    await user.click(screen.getByTitle('Excluir'));
    await user.click(confirmDelete());

    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith('Cofre bloqueado.');
    });
  });

  it('avisa quando os tokens não carregam', async () => {
    const api = installApi({ tokens: [] });
    api.authenticator.list = vi.fn().mockRejectedValue(new Error('O cofre está incompleto.'));
    const onToast = vi.fn();
    render(
      <MessagesProvider language="pt-BR">
        <Authenticator onToast={onToast} />
      </MessagesProvider>,
    );

    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith('O cofre está incompleto.');
    });
    // o estado de carregamento tem que sair de cena mesmo com a falha
    await waitFor(() => {
      expect(screen.queryByText('Abrindo os tokens…')).not.toBeInTheDocument();
    });
  });

  it('avisa quando não consegue atualizar um código vencido', async () => {
    const api = installApi({ tokens: [token()] });
    api.authenticator.codes = vi
      .fn()
      .mockResolvedValueOnce([code(token().id, '111111', 0)])
      .mockRejectedValue(new Error('Falha ao atualizar códigos.'));
    const onToast = vi.fn();
    render(
      <MessagesProvider language="pt-BR">
        <Authenticator onToast={onToast} />
      </MessagesProvider>,
    );

    expect(await screen.findByText('111111')).toBeInTheDocument();
    await waitFor(
      () => {
        expect(onToast).toHaveBeenCalledWith('Falha ao atualizar códigos.');
      },
      { timeout: 4000 },
    );
  });

  it('abre o formulário para criar e para editar', async () => {
    const user = userEvent.setup();
    renderScreen([token()], []);
    await screen.findByText('GitHub');

    await user.click(screen.getByRole('button', { name: 'Adicionar token' }));
    expect(screen.getByText('Novo token de 2FA')).toBeInTheDocument();

    await user.click(screen.getByTitle('Editar token de 2FA'));
    expect(screen.getByText('Editar token de 2FA')).toBeInTheDocument();
  });

  it('fecha o formulário de novo token pelo botão de fechar', async () => {
    const user = userEvent.setup();
    renderScreen([], []);
    await screen.findByText('Nenhum token ainda');

    await user.click(screen.getByRole('button', { name: 'Adicionar token' }));
    expect(screen.getByText('Novo token de 2FA')).toBeInTheDocument();
    await user.click(screen.getByTitle('Fechar'));

    expect(screen.queryByText('Novo token de 2FA')).not.toBeInTheDocument();
  });

  it('valida campos editados e informa falha ao salvar manualmente', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const save = vi.fn().mockRejectedValue(new Error('Token recusado.'));
    api.authenticator.save = save;
    const onError = vi.fn();
    render(
      <MessagesProvider language="pt-BR">
        <AuthTokenModal
          token={token()}
          onClose={() => undefined}
          onSaved={() => undefined}
          onError={onError}
        />
      </MessagesProvider>,
    );

    await user.clear(screen.getByLabelText('Serviço'));
    await user.type(screen.getByLabelText('Serviço'), 'Discord');
    await user.clear(screen.getByLabelText('Conta'));
    await user.type(screen.getByLabelText('Conta'), 'morgan#4321');
    await user.clear(screen.getByLabelText('Validade (segundos)'));
    await user.type(screen.getByLabelText('Validade (segundos)'), '60');
    await user.type(
      screen.getByPlaceholderText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP'),
      'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    );
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Token recusado.')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith('Token recusado.');
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ issuer: 'Discord', account: 'morgan#4321', period: 60 }),
    );
  });

  it('usa a mensagem padrão quando a falha ao salvar não é um Error', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.authenticator.save = vi.fn().mockRejectedValue(undefined);
    const onError = vi.fn();
    render(
      <MessagesProvider language="pt-BR">
        <AuthTokenModal
          token={token()}
          onClose={() => undefined}
          onSaved={() => undefined}
          onError={onError}
        />
      </MessagesProvider>,
    );

    await user.type(
      screen.getByPlaceholderText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP'),
      'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    );
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Não foi possível salvar o token.')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith('Não foi possível salvar o token.');
  });

  it('avisa e recarrega depois de salvar pelo formulário', async () => {
    const user = userEvent.setup();
    const api = installApi({ tokens: [] });
    api.authenticator.saveUri = vi.fn().mockResolvedValue([]);
    const onToast = vi.fn();
    render(
      <MessagesProvider language="pt-BR">
        <Authenticator onToast={onToast} />
      </MessagesProvider>,
    );
    await screen.findByText('Nenhum token ainda');

    await user.click(screen.getByRole('button', { name: 'Adicionar token' }));
    await user.type(screen.getByRole('textbox'), GITHUB_URI);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith('Token salvo.');
    });
  });

  it('propaga à tela a falha de salvar pelo formulário', async () => {
    const user = userEvent.setup();
    const api = installApi({ tokens: [] });
    api.authenticator.saveUri = vi.fn().mockRejectedValue(new Error('Token recusado.'));
    const onToast = vi.fn();
    render(
      <MessagesProvider language="pt-BR">
        <Authenticator onToast={onToast} />
      </MessagesProvider>,
    );
    await screen.findByText('Nenhum token ainda');

    await user.click(screen.getByRole('button', { name: 'Adicionar token' }));
    await user.type(screen.getByRole('textbox'), GITHUB_URI);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith('Token recusado.');
    });
  });

  it('avisa quando recarregar a lista falha depois de salvar', async () => {
    const user = userEvent.setup();
    const api = installApi({ tokens: [] });
    api.authenticator.saveUri = vi.fn().mockResolvedValue([]);
    api.authenticator.list = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('Falha ao recarregar.'));
    const onToast = vi.fn();
    render(
      <MessagesProvider language="pt-BR">
        <Authenticator onToast={onToast} />
      </MessagesProvider>,
    );
    await screen.findByText('Nenhum token ainda');

    await user.click(screen.getByRole('button', { name: 'Adicionar token' }));
    await user.type(screen.getByRole('textbox'), GITHUB_URI);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith('Falha ao recarregar.');
    });
  });

  // o tique é o `setInterval` real de 1 s; `waitFor` não sonda com relógio parado
  it('pede os códigos de novo quando o período vira', async () => {
    const api = installApi({ tokens: [token()] });
    const codes = vi
      .fn()
      .mockResolvedValueOnce([{ id: token().id, code: '111111', remainingMs: 0 }])
      .mockResolvedValue([{ id: token().id, code: '222222', remainingMs: 30_000 }]);
    api.authenticator.codes = codes;
    render(
      <MessagesProvider language="pt-BR">
        <Authenticator onToast={vi.fn()} />
      </MessagesProvider>,
    );

    expect(await screen.findByText('111111')).toBeInTheDocument();

    // o tique de 1 s percebe o código vencido e pede o próximo
    expect(await screen.findByText('222222', undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(codes.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('não pede os códigos de novo enquanto o período não vira', async () => {
    const api = installApi({ tokens: [token()] });
    const codes = vi
      .fn()
      .mockResolvedValue([{ id: token().id, code: '111111', remainingMs: 25_000 }]);
    api.authenticator.codes = codes;
    render(
      <MessagesProvider language="pt-BR">
        <Authenticator onToast={vi.fn()} />
      </MessagesProvider>,
    );

    expect(await screen.findByText('111111')).toBeInTheDocument();
    const callsAfterMount = codes.mock.calls.length;

    // três tiques passam e o código continua válido: nada de novo é pedido
    await new Promise((resolve) => {
      setTimeout(resolve, 2200);
    });

    expect(codes).toHaveBeenCalledTimes(callsAfterMount);
    expect(screen.getByText('111111')).toBeInTheDocument();
  });

  it('conta o tempo restante no rótulo', async () => {
    const api = installApi({ tokens: [token()] });
    api.authenticator.codes = vi
      .fn()
      .mockResolvedValue([{ id: token().id, code: '111111', remainingMs: 30_000 }]);
    render(
      <MessagesProvider language="pt-BR">
        <Authenticator onToast={vi.fn()} />
      </MessagesProvider>,
    );

    expect(await screen.findByText('expira em 30s')).toBeInTheDocument();
    // o tique de 1 s desconta um segundo do rótulo, sem pedir código novo
    expect(
      await screen.findByText('expira em 29s', undefined, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it('conta em segundos inteiros e desconta um a cada tique', async () => {
    await renderFrozen([token()], [code(token().id, '111111', 1001)]);
    expect(screen.getByText('expira em 2s')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(screen.getByText('expira em 1s')).toBeInTheDocument();
  });

  it('sem código ou já vencido, o que resta é zero', async () => {
    const expired = token({ id: 'bbbbbbbb-2222-4222-8222-222222222222' });
    renderScreen([token(), expired], [code(expired.id, '111111', 0)]);

    expect(await screen.findAllByText('expira em 0s')).toHaveLength(2);
  });

  // a cor é o único sinal de vencimento: não há `aria` nem texto com o limiar
  it('desenha a barra e a cor pelo que resta', async () => {
    const half = token({ id: 'aaaaaaaa-1111-4111-8111-111111111111' });
    const full = token({ id: 'bbbbbbbb-2222-4222-8222-222222222222' });
    const invalid = token({ id: 'cccccccc-3333-4333-8333-333333333333', period: 0 });
    const tiny = token({ id: 'dddddddd-4444-4444-8444-444444444444' });
    const soon = token({ id: 'eeeeeeee-5555-4555-8555-555555555555' });
    const later = token({ id: 'ffffffff-6666-4666-8666-666666666666' });
    // período 1 é válido: meio segundo restante é metade da barra
    const fast = token({ id: 'abcdefab-1111-4111-8111-111111111111', period: 1 });
    await renderFrozen(
      [half, full, invalid, tiny, soon, later, fast],
      [
        code(half.id, '111111', 15_000),
        code(full.id, '222222', 60_000),
        code(invalid.id, '333333', 15_000),
        code(tiny.id, '444444', 150),
        code(soon.id, '555555', 5_000),
        code(later.id, '666666', 6_000),
        code(fast.id, '777777', 500),
      ],
    );

    expect(barFor('111111')).toHaveStyle({ width: '50%' });
    expect(barFor('222222')).toHaveStyle({ width: '100%' });
    expect(barFor('333333')).toHaveStyle({ width: '0%' });
    expect(barFor('444444')).toHaveStyle({ width: '1%' });
    expect(screen.getByText('555555')).toHaveClass('text-amber-400');
    expect(barFor('555555')).toHaveClass('bg-amber-500');
    expect(screen.getByText('666666')).toHaveClass('text-emerald-400');
    expect(barFor('666666')).toHaveClass('bg-emerald-500');
    expect(barFor('777777')).toHaveStyle({ width: '50%' });
  });

  it('pede código novo no exato instante em que o código vence', async () => {
    const codes = vi
      .fn()
      .mockResolvedValueOnce([code(token().id, '111111', 1000)])
      .mockResolvedValue([code(token().id, '222222', 30_000)]);
    await renderFrozen([token()], codes);
    expect(screen.getByText('111111')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(codes).toHaveBeenCalledTimes(2);
    expect(screen.getByText('222222')).toBeInTheDocument();
    // o código recarregado traz o tempo restante novo, não zero
    expect(screen.getByText('expira em 30s')).toBeInTheDocument();
  });
});

describe('modal de token', () => {
  it('prévia o endereço colado antes de salvar, sem gravar nada', async () => {
    const saved = vi.fn();
    const api = installApi();
    api.authenticator.saveUri = saved;
    const user = userEvent.setup();
    render(
      <MessagesProvider language="pt-BR">
        <AuthTokenModal
          token={null}
          onClose={() => undefined}
          onSaved={() => undefined}
          onError={() => undefined}
        />
      </MessagesProvider>,
    );

    await user.type(screen.getByRole('textbox'), GITHUB_URI);

    expect(
      await screen.findByText(/GitHub · alice@github.com · SHA1 · 6 · 30s/),
    ).toBeInTheDocument();
    expect(saved).not.toHaveBeenCalled();
  });

  it('avisa na hora que o endereço colado não serve', async () => {
    // antes o erro só aparecia no botão "Salvar"; colar metade do endereço esperava
    const user = userEvent.setup();
    installApi();
    render(
      <MessagesProvider language="pt-BR">
        <AuthTokenModal
          token={null}
          onClose={() => undefined}
          onSaved={() => undefined}
          onError={() => undefined}
        />
      </MessagesProvider>,
    );

    const field = screen.getByRole('textbox');
    await user.type(field, 'otpauth://totp/GitHub:eu');

    expect(await screen.findByText(/Endereço inválido ou sem segredo/)).toBeInTheDocument();
    // endereço inteiro, sem segredo, também é recusado com a mesma mensagem
    await user.clear(field);
    await user.type(field, 'otpauth://totp/GitHub:eu?issuer=GitHub');
    expect(await screen.findByText(/Endereço inválido ou sem segredo/)).toBeInTheDocument();
  });

  it('não reclama enquanto o campo está vazio', () => {
    installApi();
    render(
      <MessagesProvider language="pt-BR">
        <AuthTokenModal
          token={null}
          onClose={() => undefined}
          onSaved={() => undefined}
          onError={() => undefined}
        />
      </MessagesProvider>,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('tira o aviso assim que o endereço fica válido', async () => {
    const user = userEvent.setup();
    installApi();
    render(
      <MessagesProvider language="pt-BR">
        <AuthTokenModal
          token={null}
          onClose={() => undefined}
          onSaved={() => undefined}
          onError={() => undefined}
        />
      </MessagesProvider>,
    );

    const field = screen.getByRole('textbox');
    await user.type(field, 'lixo');
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.clear(field);
    await user.type(field, GITHUB_URI);

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('manda o endereço inteiro para o main e não monta o segredo na tela', async () => {
    const saved = vi.fn();
    const api = installApi();
    api.authenticator.saveUri = saved.mockResolvedValue([]);
    const user = userEvent.setup();
    render(
      <MessagesProvider language="pt-BR">
        <AuthTokenModal
          token={null}
          onClose={() => undefined}
          onSaved={() => undefined}
          onError={() => undefined}
        />
      </MessagesProvider>,
    );

    await user.type(screen.getByRole('textbox'), GITHUB_URI);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(saved).toHaveBeenCalledWith(GITHUB_URI);
    });
  });

  it('avisa quando o main recusa o endereço, sem fechar o formulário', async () => {
    const api = installApi();
    api.authenticator.saveUri = vi
      .fn()
      .mockRejectedValue(new Error('Endereço `otpauth://` inválido.'));
    const user = userEvent.setup();
    render(
      <MessagesProvider language="pt-BR">
        <AuthTokenModal
          token={null}
          onClose={() => undefined}
          onSaved={() => undefined}
          onError={() => undefined}
        />
      </MessagesProvider>,
    );

    await user.type(screen.getByRole('textbox'), 'https://exemplo.com');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Endereço `otpauth://` inválido.')).toBeInTheDocument();
  });

  it('na aba dos campos, edita manda o segredo e preserva o id', async () => {
    const saved = vi.fn();
    const api = installApi();
    api.authenticator.save = saved.mockResolvedValue([]);
    const user = userEvent.setup();
    render(
      <MessagesProvider language="pt-BR">
        <AuthTokenModal
          token={token()}
          onClose={() => undefined}
          onSaved={() => undefined}
          onError={() => undefined}
        />
      </MessagesProvider>,
    );

    // abrir para editar já vem nos campos, com o serviço preenchido
    expect(screen.getByDisplayValue('GitHub')).toBeInTheDocument();
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    await user.type(screen.getByPlaceholderText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP'), secret);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(saved).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'aaaaaaaa-1111-4111-8111-111111111111',
          issuer: 'GitHub',
          secret,
        }),
      );
    });
  });

  it('oferece SHA256 e SHA512, porque alguns serviços não usam SHA1', async () => {
    const user = userEvent.setup();
    render(
      <MessagesProvider language="pt-BR">
        <AuthTokenModal
          token={null}
          onClose={() => undefined}
          onSaved={() => undefined}
          onError={() => undefined}
        />
      </MessagesProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Digitar a chave' }));

    // o campo é o listbox do app, então as opções só existem com o menu aberto
    await user.click(screen.getByRole('button', { name: 'Algoritmo' }));

    expect(screen.getByRole('option', { name: 'SHA1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'SHA256' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'SHA512' })).toBeInTheDocument();
  });

  it('abre para editar já com a aba dos campos marcada', () => {
    installApi();
    renderModal(token());

    // a aba ativa só se distingue pela classe: não há `aria-selected` nem texto
    expect(screen.getByRole('button', { name: 'Digitar a chave' })).toHaveClass(
      'bg-emerald-500/10',
    );
    expect(screen.getByRole('button', { name: 'Endereço otpauth://' })).not.toHaveClass(
      'bg-emerald-500/10',
    );
  });

  it('dá três linhas ao campo e limita a validade', async () => {
    const user = userEvent.setup();
    installApi();
    renderModal(null);

    expect(screen.getByRole('textbox')).toHaveAttribute('rows', '3');
    await user.click(screen.getByRole('button', { name: 'Digitar a chave' }));
    expect(screen.getByLabelText('Validade (segundos)')).toHaveAttribute('min', '15');
    expect(screen.getByLabelText('Validade (segundos)')).toHaveAttribute('max', '300');
  });

  it('segura o botão enquanto salva e o solta no fim', async () => {
    const user = userEvent.setup();
    const uriApi = installApi();
    const uriGate = deferred<AuthToken[]>();
    uriApi.authenticator.saveUri = () => uriGate.promise;
    renderModal(null);

    await user.type(screen.getByRole('textbox'), GITHUB_URI);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled();
    await act(async () => {
      uriGate.resolve([]);
      await uriGate.promise;
    });
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();

    // agora a aba dos campos, que grava por `save` e não por `saveUri`
    cleanup();
    const fieldApi = installApi();
    const fieldGate = deferred<AuthToken[]>();
    fieldApi.authenticator.save = () => fieldGate.promise;
    renderModal(token());

    await user.type(
      screen.getByPlaceholderText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP'),
      'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    );
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled();
    await act(async () => {
      fieldGate.resolve([]);
      await fieldGate.promise;
    });
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
  });

  /** As dicas saem por `richText`; o teste olha os elementos, não a string. */
  describe('marcadores ricos nas dicas', () => {
    it('destaque e código viram elementos na aba do endereço', () => {
      render(
        <MessagesProvider language="pt-BR">
          <AuthTokenModal
            token={null}
            onClose={() => undefined}
            onSaved={() => undefined}
            onError={() => undefined}
          />
        </MessagesProvider>,
      );

      expect(screen.getByText('dentro do cofre', { selector: 'strong' })).toBeInTheDocument();
      expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
    });

    it('destaque e código viram elementos na aba dos campos', async () => {
      const user = userEvent.setup();
      render(
        <MessagesProvider language="pt-BR">
          <AuthTokenModal
            token={null}
            onClose={() => undefined}
            onSaved={() => undefined}
            onError={() => undefined}
          />
        </MessagesProvider>,
      );

      await user.click(screen.getByRole('button', { name: 'Digitar a chave' }));

      // "SHA1" também é o valor que o campo do algoritmo mostra, daí o selector
      expect(screen.getByText('SHA1', { selector: 'strong' })).toBeInTheDocument();
      expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
    });

    it('o aviso de endereço inválido também formata o trecho de código', async () => {
      const user = userEvent.setup();
      installApi();
      render(
        <MessagesProvider language="pt-BR">
          <AuthTokenModal
            token={null}
            onClose={() => undefined}
            onSaved={() => undefined}
            onError={() => undefined}
          />
        </MessagesProvider>,
      );

      await user.type(screen.getByRole('textbox'), 'otpauth://totp/GitHub:eu');

      expect(await screen.findByText('otpauth://totp/', { selector: 'code' })).toBeInTheDocument();
    });

    it('o estado vazio do 2FA formata o endereço', async () => {
      renderScreen([]);
      expect(await screen.findByText('otpauth://', { selector: 'code' })).toBeInTheDocument();
    });
  });
});
