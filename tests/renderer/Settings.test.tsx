import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Settings } from '@zero/renderer/components/Settings';
import { UNLOCKED, installApi } from '../mocks/api.ts';
import type { PanicStatus, VaultResult, VaultStatus } from '@zero/types';

function installPanic(panic: PanicStatus): void {
  installApi({ status: UNLOCKED, panic });
}

/** Promessa controlada pelo teste, para observar o botão travado durante o voo. */
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

describe('Configurações: coluna do formulário', () => {
  it('usa a coluna estreita, própria de formulário', async () => {
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
    render(<Settings />);

    await screen.findByRole('heading', { name: 'Configurações' });
    expect(document.querySelector('.max-w-2xl')).not.toBeNull();
  });
});

describe('Configurações: PIN de pânico', () => {
  it('não mostra o formulário quando já existe um PIN de coação', async () => {
    installPanic({ hasPanicPin: true, nukeLimit: 0, attemptsMaster: 0 });

    render(<Settings />);

    expect(await screen.findByText(/PIN de coação ativo/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/PIN de coação/i)).not.toBeInTheDocument();
  });

  it('oferece remover o PIN de coação e passa pelo canal', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: true, nukeLimit: 0, attemptsMaster: 0 });
    const api = window.api;
    const clear = vi.fn(() => Promise.resolve(UNLOCKED));
    api.vault.clearPanicPin = clear;

    render(<Settings />);
    await user.click(await screen.findByRole('button', { name: /Remover PIN de coação/i }));

    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('exige confirmação do PIN antes de enviar', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
    const api = window.api;
    const setPanic = vi.fn(() => Promise.resolve({ ok: true, status: UNLOCKED }));
    api.vault.setPanicPin = setPanic;

    render(<Settings />);
    const field = await screen.findByLabelText(/PIN de coação \(8 dígitos\)/i);
    await user.type(field, '73910456');
    await user.type(screen.getByLabelText(/Repita o PIN de coação/i), '73910457');
    await user.click(screen.getByRole('button', { name: /Definir PIN de coação/i }));

    expect(await screen.findByText(/Os PINs não coincidem/i)).toBeInTheDocument();
    expect(setPanic).not.toHaveBeenCalled();
  });

  it('envia o PIN de coação pelo canal quando os dois batem', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
    const api = window.api;
    const setPanic = vi.fn(() => Promise.resolve({ ok: true, status: UNLOCKED }));
    api.vault.setPanicPin = setPanic;
    // o main passa a reportar o PIN instalado depois do envio
    let installed = false;
    const panicStatus = vi.fn(() =>
      Promise.resolve({ hasPanicPin: installed, nukeLimit: 0, attemptsMaster: 0 }),
    );
    api.vault.panicStatus = panicStatus;
    setPanic.mockImplementation(() => {
      installed = true;
      return Promise.resolve({ ok: true, status: UNLOCKED });
    });

    render(<Settings />);
    await user.type(await screen.findByLabelText(/PIN de coação \(8 dígitos\)/i), '73910456');
    await user.type(screen.getByLabelText(/Repita o PIN de coação/i), '73910456');
    await user.click(screen.getByRole('button', { name: /Definir PIN de coação/i }));

    expect(setPanic).toHaveBeenCalledWith({ pin: '73910456' });
    expect(await screen.findByText(/PIN de coação ativo/i)).toBeInTheDocument();
    expect(panicStatus).toHaveBeenCalled();
  });

  it('mostra o erro devolvido pelo main sem trocar a tela', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
    const api = window.api;
    api.vault.setPanicPin = vi.fn(() =>
      Promise.resolve({
        ok: false,
        error: 'O PIN de coação não pode ser igual ao PIN que abre o cofre.',
        status: UNLOCKED,
      }),
    );

    render(<Settings />);
    await user.type(await screen.findByLabelText(/PIN de coação \(8 dígitos\)/i), '73910456');
    await user.type(screen.getByLabelText(/Repita o PIN de coação/i), '73910456');
    await user.click(screen.getByRole('button', { name: /Definir PIN de coação/i }));

    expect(
      await screen.findByText(/não pode ser igual ao PIN que abre o cofre/i),
    ).toBeInTheDocument();
  });
});

describe('Configurações: autodestruição por tentativas', () => {
  it('começa desligada e avisa antes de confirmar', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
    const api = window.api;
    const setNuke = vi.fn(() => Promise.resolve({ ok: true, status: UNLOCKED }));
    api.vault.setNukeLimit = setNuke;

    render(<Settings />);
    expect(await screen.findByText(/^Desligada$/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ativar autodestruição/i }));
    expect(await screen.findByText(/não há como desfazer/i)).toBeInTheDocument();
    // a confirmação ainda não dispara nada
    expect(setNuke).not.toHaveBeenCalled();
  });

  it('envia o limite confirmado pelo usuário', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
    const api = window.api;
    const setNuke = vi.fn(() => Promise.resolve({ ok: true, status: UNLOCKED }));
    api.vault.setNukeLimit = setNuke;
    const panicStatus = vi.fn(() =>
      Promise.resolve({ hasPanicPin: false, nukeLimit: 60, attemptsMaster: 0 }),
    );
    api.vault.panicStatus = panicStatus;

    render(<Settings />);
    await user.click(await screen.findByRole('button', { name: /Ativar autodestruição/i }));
    await user.type(screen.getByLabelText('Digite o limite para confirmar'), '60');
    await user.click(screen.getByRole('button', { name: /Ativar autodestruição/i }));

    expect(setNuke).toHaveBeenCalledWith(60);
    expect(await screen.findByText(/60 tentativas/i)).toBeInTheDocument();
  });

  it('recusa limite abaixo do piso, com o erro do main', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
    const api = window.api;
    api.vault.setNukeLimit = vi.fn(() =>
      Promise.resolve({
        ok: false,
        error: 'O limite é baixo demais para não confundir com erro de digitação.',
        status: UNLOCKED,
      }),
    );

    render(<Settings />);
    await user.click(await screen.findByRole('button', { name: /Ativar autodestruição/i }));
    await user.type(screen.getByLabelText('Digite o limite para confirmar'), '5');
    await user.click(screen.getByRole('button', { name: /Ativar autodestruição/i }));

    expect(await screen.findByText(/baixo demais/i)).toBeInTheDocument();
  });

  it('permite desligar quando está ligado', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 60, attemptsMaster: 12 });
    const api = window.api;
    const setNuke = vi.fn(() => Promise.resolve({ ok: true, status: UNLOCKED }));
    api.vault.setNukeLimit = setNuke;

    render(<Settings />);
    expect(await screen.findByText(/60 tentativas/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Desativar autodestruição/i }));

    expect(setNuke).toHaveBeenCalledWith(0);
  });

  it('edita o limite ativo e confirma o novo valor', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 60, attemptsMaster: 12 });
    const api = window.api;
    const setNuke = vi.fn(() => Promise.resolve({ ok: true, status: UNLOCKED }));
    api.vault.setNukeLimit = setNuke;
    api.vault.panicStatus = vi.fn(() =>
      Promise.resolve({ hasPanicPin: false, nukeLimit: 80, attemptsMaster: 0 }),
    );

    render(<Settings />);
    const input = await screen.findByLabelText('Limite de tentativas da senha mestra');
    await user.clear(input);
    await user.type(input, '80');
    await user.click(screen.getByRole('button', { name: 'Ativar autodestruição' }));
    const confirmation = screen.getByLabelText('Digite o limite para confirmar');
    await user.clear(confirmation);
    await user.type(confirmation, '80');
    await user.click(screen.getByRole('button', { name: 'Ativar autodestruição' }));

    expect(setNuke).toHaveBeenCalledWith(80);
    expect(await screen.findByText(/80 tentativas/i)).toBeInTheDocument();
  });

  it('mostra erro interno quando falha ao desativar o limite', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 60, attemptsMaster: 12 });
    window.api.vault.setNukeLimit = vi.fn().mockRejectedValue(new Error(''));

    render(<Settings />);
    await user.click(await screen.findByRole('button', { name: /Desativar autodestruição/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/erro/i);
  });
});

describe('Configurações: estados de envio', () => {
  it('trava o envio do PIN de coação enquanto o canal está em voo', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
    const api = window.api;
    const deferred = pending<VaultResult>();
    api.vault.setPanicPin = vi.fn(() => deferred.promise);

    render(<Settings />);
    await user.type(await screen.findByLabelText(/PIN de coação \(8 dígitos\)/i), '73910456');
    await user.type(screen.getByLabelText(/Repita o PIN de coação/i), '73910456');
    await user.click(screen.getByRole('button', { name: /Definir PIN de coação/i }));

    // o PIN já está completo; só o `busy` mantém o botão travado
    expect(screen.getByRole('button', { name: /Definir PIN de coação/i })).toBeDisabled();

    deferred.resolve({ ok: false, error: 'recusado pelo cofre', status: UNLOCKED });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Definir PIN de coação/i })).toBeEnabled();
    });
  });

  it('mantém o envio travado enquanto o PIN está incompleto', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });

    render(<Settings />);
    await user.type(await screen.findByLabelText(/PIN de coação \(8 dígitos\)/i), '7391');

    expect(screen.getByRole('button', { name: /Definir PIN de coação/i })).toBeDisabled();
  });

  it('esconde o PIN de novo depois de definir com sucesso', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
    const api = window.api;
    api.vault.setPanicPin = vi.fn().mockResolvedValue({ ok: true, status: UNLOCKED });

    render(<Settings />);
    const field = await screen.findByLabelText(/PIN de coação \(8 dígitos\)/i);
    await user.click(screen.getByRole('button', { name: /Mostrar senha/i }));
    expect(field).toHaveAttribute('type', 'text');

    await user.type(field, '73910456');
    await user.type(screen.getByLabelText(/Repita o PIN de coação/i), '73910456');
    await user.click(screen.getByRole('button', { name: /Definir PIN de coação/i }));

    // o main ainda não reporta PIN instalado, então o formulário fica; mesmo
    // assim a visibilidade volta ao padrão e o PIN digitado não fica à mostra
    await waitFor(() => {
      expect(screen.getByLabelText(/PIN de coação \(8 dígitos\)/i)).toHaveAttribute(
        'type',
        'password',
      );
    });
  });

  it('trava a remoção do PIN de coação enquanto o canal está em voo', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: true, nukeLimit: 0, attemptsMaster: 0 });
    const api = window.api;
    const deferred = pending<VaultStatus>();
    api.vault.clearPanicPin = vi.fn(() => deferred.promise);

    render(<Settings />);
    await user.click(await screen.findByRole('button', { name: /Remover PIN de coação/i }));

    expect(screen.getByRole('button', { name: /Remover PIN de coação/i })).toBeDisabled();

    deferred.resolve(UNLOCKED);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Remover PIN de coação/i })).toBeEnabled();
    });
  });

  it('libera a remoção do PIN depois de uma falha', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: true, nukeLimit: 0, attemptsMaster: 0 });
    const api = window.api;
    api.vault.clearPanicPin = vi.fn().mockRejectedValue(new Error('IPC bloqueado'));

    render(<Settings />);
    await user.click(await screen.findByRole('button', { name: /Remover PIN de coação/i }));

    expect(await screen.findByText('IPC bloqueado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remover PIN de coação/i })).toBeEnabled();
  });

  it('mostra a força apenas com o PIN de 8 dígitos completo', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });

    render(<Settings />);
    const field = await screen.findByLabelText(/PIN de coação \(8 dígitos\)/i);

    await user.type(field, '7391045');
    expect(screen.queryByText(/São só 8 dígitos/)).not.toBeInTheDocument();

    await user.type(field, '6');
    expect(await screen.findByText(/São só 8 dígitos/)).toBeInTheDocument();
  });

  it('limita o campo do limite ao teto de 999', async () => {
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });

    render(<Settings />);

    expect(await screen.findByLabelText('Limite de tentativas da senha mestra')).toHaveAttribute(
      'max',
      '999',
    );
  });
});
