import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Settings } from '@zero/renderer/components/Settings';
import { MessagesProvider } from '@zero/renderer/i18n';
import { UNLOCKED, installApi } from '../mocks/api.ts';
import type { PanicStatus, VaultResult } from '@zero/types';

/**
 * A tela de Configurações tem duas proteções destrutivas, e os testes daqui
 * tratam cada falha de canal: uma rejeição que deixa a tela em branco é
 * justamente o caso em que o usuário não descobre que a mudança não valeu.
 */

function installPanic(panic: PanicStatus): void {
  installApi({ status: UNLOCKED, panic });
}

/**
 * Promessa que o teste resolve quando quiser. O estado `busy` só existe
 * enquanto o canal está em voo, então sem segurar a resposta não há como
 * observar o botão travado.
 */
function pending<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      settle?.(value);
    },
  };
}

function mount(): void {
  render(
    <MessagesProvider language="pt-BR">
      <Settings />
    </MessagesProvider>,
  );
}

/**
 * Primeiro elemento de uma lista de `getAllBy*`. Os botões de ação aparecem
 * uma vez por credencial, então o primeiro é o da lista; o `undefined` é
 * impossible aqui, mas o TypeScript não sabe disso com `noUncheckedIndexedAccess`.
 */
function first(elements: HTMLElement[]): HTMLElement {
  const element = elements[0];
  if (element === undefined) throw new Error('nenhum elemento encontrado');
  return element;
}

/**
 * O campo do limite é o único `input[type=text]` da tela (os de PIN são
 * `password`, que não têm papel de textbox). Agora ele também tem rótulo
 * visível, então os testes usam `getByLabelText` e o papel fica de reserva.
 */
function limitField(): HTMLElement {
  return screen.getByLabelText('Digite o limite para confirmar');
}

describe('Configurações: autodestruição por tentativas', () => {
  it('começa desligada e mostra o estado', async () => {
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
    mount();

    expect(await screen.findByText('Desligada')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Desativar autodestruição' }),
    ).not.toBeInTheDocument();
  });

  it('exige o limite digitado de volta antes de ligar', async () => {
    const user = userEvent.setup();
    const api = installApi({
      status: UNLOCKED,
      panic: { hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 },
    });
    const setNuke = vi.fn().mockResolvedValue({ ok: true, status: UNLOCKED });
    api.vault.setNukeLimit = setNuke;
    mount();

    await user.click(await screen.findByRole('button', { name: 'Ativar autodestruição' }));
    expect(screen.getByText(/Ao atingir/)).toBeInTheDocument();

    // campo vazio: o botão fica desabilitado, nada é enviado
    expect(screen.getByRole('button', { name: 'Ativar autodestruição' })).toBeDisabled();

    await user.type(limitField(), '60');
    await user.click(screen.getByRole('button', { name: 'Ativar autodestruição' }));

    await waitFor(() => {
      expect(setNuke).toHaveBeenCalledWith(60);
    });
  });

  it('cancela a confirmação sem gravar nada', async () => {
    const user = userEvent.setup();
    const api = installApi({
      status: UNLOCKED,
      panic: { hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 },
    });
    const setNuke = vi.fn();
    api.vault.setNukeLimit = setNuke;
    mount();

    await user.click(await screen.findByRole('button', { name: 'Ativar autodestruição' }));
    await user.type(limitField(), '60');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(setNuke).not.toHaveBeenCalled();
    // o texto de confirmação some e o valor digitado é descartado, para a
    // próxima tentativa não herdar um limite pela metade; o campo volta a ser
    // o de escolha do limite, com o outro rótulo
    expect(screen.queryByText(/Ao atingir/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Limite de tentativas da senha mestra')).toHaveValue('');
  });

  it('mostra o limite atual e oferece desligar quando está ativo', async () => {
    const user = userEvent.setup();
    const api = installApi({
      status: UNLOCKED,
      panic: { hasPanicPin: false, nukeLimit: 80, attemptsMaster: 3 },
    });
    const setNuke = vi.fn().mockResolvedValue({ ok: true, status: UNLOCKED });
    api.vault.setNukeLimit = setNuke;
    mount();

    expect(await screen.findByText('80 tentativas')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Desativar autodestruição' }));

    await waitFor(() => {
      expect(setNuke).toHaveBeenCalledWith(0);
    });
  });

  it('mostra o erro devolvido pelo cofre ao ligar o limite', async () => {
    const user = userEvent.setup();
    const api = installApi({
      status: UNLOCKED,
      panic: { hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 },
    });
    api.vault.setNukeLimit = vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'Limite de tentativas inválido.', status: UNLOCKED });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Ativar autodestruição' }));
    await user.type(limitField(), '10');
    await user.click(screen.getByRole('button', { name: 'Ativar autodestruição' }));

    expect(await screen.findByText('Limite de tentativas inválido.')).toBeInTheDocument();
  });

  it('usa a mensagem padrão quando o cofre não diz o que deu errado', async () => {
    const user = userEvent.setup();
    const api = installApi({
      status: UNLOCKED,
      panic: { hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 },
    });
    api.vault.setNukeLimit = vi.fn().mockResolvedValue({ ok: false, status: UNLOCKED });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Ativar autodestruição' }));
    await user.type(limitField(), '10');
    await user.click(screen.getByRole('button', { name: 'Ativar autodestruição' }));

    expect(await screen.findByText('Erro interno do cofre.')).toBeInTheDocument();
  });

  it('mostra o erro quando a chamada ao cofre explode', async () => {
    const user = userEvent.setup();
    const api = installApi({
      status: UNLOCKED,
      panic: { hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 },
    });
    api.vault.setNukeLimit = vi.fn().mockRejectedValue(new Error('canal fechado'));
    mount();

    await user.click(await screen.findByRole('button', { name: 'Ativar autodestruição' }));
    await user.type(limitField(), '10');
    await user.click(screen.getByRole('button', { name: 'Ativar autodestruição' }));

    expect(await screen.findByText('canal fechado')).toBeInTheDocument();
  });

  it('avisa quando o estado das proteções não pode ser lido', async () => {
    const api = installApi({
      status: UNLOCKED,
      panic: { hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 },
    });
    api.vault.panicStatus = vi.fn().mockRejectedValue(new Error('sem permissão'));
    mount();

    // sem estado, a tela não inventa limite nenhum: fica em "consultando"
    expect(await screen.findByText('Verificando o cofre…')).toBeInTheDocument();
    expect(screen.queryByText('Desligada')).not.toBeInTheDocument();
  });
});

describe('Configurações: PIN de coação, falhas de canal', () => {
  it('mostra o erro quando a definição do PIN é recusada pelo cofre', async () => {
    const user = userEvent.setup();
    const api = installApi({
      status: UNLOCKED,
      panic: { hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 },
    });
    api.vault.setPanicPin = vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'PIN previsível.', status: UNLOCKED });
    mount();

    await user.type(await screen.findByLabelText('PIN de coação (8 dígitos)'), '49201733');
    await user.type(screen.getByLabelText('Repita o PIN de coação'), '49201733');
    await user.click(screen.getByRole('button', { name: 'Definir PIN de coação' }));

    expect(await screen.findByText('PIN previsível.')).toBeInTheDocument();
  });

  it('usa a mensagem padrão quando a recusa vem sem texto', async () => {
    const user = userEvent.setup();
    const api = installApi({
      status: UNLOCKED,
      panic: { hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 },
    });
    api.vault.setPanicPin = vi.fn().mockResolvedValue({ ok: false, status: UNLOCKED });
    mount();

    await user.type(await screen.findByLabelText('PIN de coação (8 dígitos)'), '49201733');
    await user.type(screen.getByLabelText('Repita o PIN de coação'), '49201733');
    await user.click(screen.getByRole('button', { name: 'Definir PIN de coação' }));

    expect(await screen.findByText('Erro interno do cofre.')).toBeInTheDocument();
  });

  it('mostra o erro quando a definição do PIN explode', async () => {
    const user = userEvent.setup();
    const api = installApi({
      status: UNLOCKED,
      panic: { hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 },
    });
    api.vault.setPanicPin = vi.fn().mockRejectedValue(new Error('IPC bloqueado'));
    mount();

    await user.type(await screen.findByLabelText('PIN de coação (8 dígitos)'), '49201733');
    await user.type(screen.getByLabelText('Repita o PIN de coação'), '49201733');
    await user.click(screen.getByRole('button', { name: 'Definir PIN de coação' }));

    expect(await screen.findByText('IPC bloqueado')).toBeInTheDocument();
  });

  it('mostra o erro quando a remoção do PIN explode', async () => {
    const user = userEvent.setup();
    const api = installApi({
      status: UNLOCKED,
      panic: { hasPanicPin: true, nukeLimit: 0, attemptsMaster: 0 },
    });
    api.vault.clearPanicPin = vi.fn().mockRejectedValue(new Error('IPC bloqueado'));
    mount();

    await user.click(await screen.findByRole('button', { name: 'Remover PIN de coação' }));

    expect(await screen.findByText('IPC bloqueado')).toBeInTheDocument();
  });

  it('usa a mensagem padrão quando a remoção vem sem texto', async () => {
    const user = userEvent.setup();
    const api = installApi({
      status: UNLOCKED,
      panic: { hasPanicPin: true, nukeLimit: 0, attemptsMaster: 0 },
    });
    api.vault.clearPanicPin = vi.fn().mockRejectedValue(new Error(''));
    mount();

    await user.click(await screen.findByRole('button', { name: 'Remover PIN de coação' }));

    expect(await screen.findByText('Erro interno do cofre.')).toBeInTheDocument();
  });

  it('mostra e oculta o PIN digitado', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
    mount();

    const field = await screen.findByLabelText('PIN de coação (8 dígitos)');
    expect(field).toHaveAttribute('type', 'password');

    await user.click(first(screen.getAllByRole('button', { name: 'Mostrar senha' })));
    expect(screen.getByLabelText('PIN de coação (8 dígitos)')).toHaveAttribute('type', 'text');
  });

  it('limpa o formulário depois de definir o PIN com sucesso', async () => {
    const user = userEvent.setup();
    const api = installApi({
      status: UNLOCKED,
      panic: { hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 },
    });
    api.vault.setPanicPin = vi.fn().mockResolvedValue({ ok: true, status: UNLOCKED });
    // ainda sem PIN na primeira consulta; com PIN depois do setPanicPin
    api.vault.panicStatus = vi
      .fn()
      .mockResolvedValueOnce({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 })
      .mockResolvedValue({ hasPanicPin: true, nukeLimit: 0, attemptsMaster: 0 });
    mount();

    await user.type(await screen.findByLabelText('PIN de coação (8 dígitos)'), '49201733');
    await user.type(screen.getByLabelText('Repita o PIN de coação'), '49201733');
    await user.click(screen.getByRole('button', { name: 'Definir PIN de coação' }));

    // o formulário some e a tela passa a dizer que o PIN está ativo
    expect(await screen.findByText(/PIN de coação ativo/)).toBeInTheDocument();
    expect(screen.queryByLabelText('PIN de coação (8 dígitos)')).not.toBeInTheDocument();
  });
});

describe('Configurações: disciplina do formulário do limite', () => {
  it('trava a confirmação do limite enquanto o canal está em voo', async () => {
    const user = userEvent.setup();
    const api = installApi({
      status: UNLOCKED,
      panic: { hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 },
    });
    const deferred = pending<VaultResult>();
    api.vault.setNukeLimit = vi.fn(() => deferred.promise);
    mount();

    await user.click(await screen.findByRole('button', { name: 'Ativar autodestruição' }));
    await user.type(limitField(), '60');
    await user.click(screen.getByRole('button', { name: 'Ativar autodestruição' }));

    // o campo está preenchido; só o `busy` mantém o botão travado
    expect(screen.getByRole('button', { name: 'Ativar autodestruição' })).toBeDisabled();

    deferred.resolve({ ok: true, status: UNLOCKED });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ativar autodestruição' })).toBeEnabled();
    });
  });

  it('libera a confirmação do limite depois de uma falha', async () => {
    const user = userEvent.setup();
    const api = installApi({
      status: UNLOCKED,
      panic: { hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 },
    });
    api.vault.setNukeLimit = vi.fn().mockRejectedValue(new Error('canal fechado'));
    mount();

    await user.click(await screen.findByRole('button', { name: 'Ativar autodestruição' }));
    await user.type(limitField(), '60');
    await user.click(screen.getByRole('button', { name: 'Ativar autodestruição' }));

    expect(await screen.findByText('canal fechado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ativar autodestruição' })).toBeEnabled();
  });

  it('volta ao formulário simples depois de gravar o limite', async () => {
    const user = userEvent.setup();
    const api = installApi({
      status: UNLOCKED,
      panic: { hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 },
    });
    api.vault.setNukeLimit = vi.fn().mockResolvedValue({ ok: true, status: UNLOCKED });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Ativar autodestruição' }));
    await user.type(limitField(), '60');
    await user.click(screen.getByRole('button', { name: 'Ativar autodestruição' }));

    // sucesso: some o aviso de confirmação, nenhum erro aparece e o campo é
    // esvaziado, sem herdar o valor antigo numa próxima edição
    await waitFor(() => {
      expect(screen.queryByText(/Ao atingir/)).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Limite de tentativas da senha mestra')).toHaveValue('');
  });

  it('mostra o aviso de confirmação mesmo sem ler o estado', async () => {
    const user = userEvent.setup();
    const api = installApi({
      status: UNLOCKED,
      panic: { hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 },
    });
    api.vault.panicStatus = vi.fn().mockRejectedValue(new Error('sem permissão'));
    mount();

    // sem estado, a tela fica em "consultando", mas ainda dá para pedir o limite
    expect(await screen.findByText('Verificando o cofre…')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ativar autodestruição' }));

    expect(await screen.findByText(/Ao atingir 0 erros/)).toBeInTheDocument();
  });

  it('dá a dica do limite no campo quando está desligado', async () => {
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
    mount();

    expect(await screen.findByLabelText('Limite de tentativas da senha mestra')).toHaveAttribute(
      'placeholder',
      'Desligada',
    );
  });

  it('deixa a dica do campo em zero quando o estado não foi lido', async () => {
    const api = installApi({
      status: UNLOCKED,
      panic: { hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 },
    });
    api.vault.panicStatus = vi.fn().mockRejectedValue(new Error('sem permissão'));
    mount();

    // sem estado não há limite conhecido: a dica cai no zero, não inventa um
    expect(await screen.findByText('Verificando o cofre…')).toBeInTheDocument();
    expect(screen.getByLabelText('Limite de tentativas da senha mestra')).toHaveAttribute(
      'placeholder',
      '0',
    );
  });

  it('dá a dica do limite no campo quando está ligado', async () => {
    installPanic({ hasPanicPin: false, nukeLimit: 80, attemptsMaster: 0 });
    mount();

    expect(await screen.findByLabelText('Limite de tentativas da senha mestra')).toHaveAttribute(
      'placeholder',
      '80',
    );
  });

  it('oferece desligar quando o limite é 1', async () => {
    installPanic({ hasPanicPin: false, nukeLimit: 1, attemptsMaster: 0 });
    mount();

    expect(
      await screen.findByRole('button', { name: 'Desativar autodestruição' }),
    ).toBeInTheDocument();
  });

  it('prepara o campo e volta ao estado simples ao desligar', async () => {
    const user = userEvent.setup();
    const api = installApi({
      status: UNLOCKED,
      panic: { hasPanicPin: false, nukeLimit: 60, attemptsMaster: 12 },
    });
    api.vault.setNukeLimit = vi.fn().mockResolvedValue({ ok: true, status: UNLOCKED });
    mount();

    await user.click(await screen.findByRole('button', { name: 'Desativar autodestruição' }));

    // o campo fica com o "0" que acabou de ser gravado e não entra no modo de
    // confirmação, que é só para escolher um limite novo
    await waitFor(() => {
      expect(screen.getByLabelText('Limite de tentativas da senha mestra')).toHaveValue('0');
    });
    expect(screen.queryByLabelText('Digite o limite para confirmar')).not.toBeInTheDocument();
  });
});
