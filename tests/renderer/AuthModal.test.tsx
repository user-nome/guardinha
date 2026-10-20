import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '@zero/renderer/i18n';
import { AuthModal } from '@zero/renderer/components/AuthModal';
import { installApi } from '../mocks/api.ts';
import { LOCKED, NO_PANIC, UNLOCKED } from '../mocks/api.ts';
import type { VaultStatus } from '@zero/types';

/**
 * A tela de autenticação é onde moram as regras de acesso do cofre, e ela tem
 * quatro modos distintos: criar (credenciais e frase), desbloquear por PIN,
 * desbloquear por senha mestra e redefinir o PIN. Cada validação abaixo é uma
 * barreira: remover uma delas aqui é remover a barreira do app.
 */

const MASTER = 'senha-mestra-guardinha24';
const PIN = '49201733';
const PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';

/** Frase curta o bastante para reprovar na contagem de palavras. */
const SHORT_PHRASE = 'o cavalo comeu cenoura';

const NO_VAULT: VaultStatus = { ...UNLOCKED, exists: false };

function open(
  status: VaultStatus = NO_VAULT,
  onRefresh: () => Promise<void> = vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
): () => Promise<void> {
  render(
    <MessagesProvider language="pt-BR">
      <AuthModal status={status} onRefresh={onRefresh} />
    </MessagesProvider>,
  );
  return onRefresh;
}

/** Preenche o passo de credenciais e avança para a frase. */
async function fillCredentials(
  user: ReturnType<typeof userEvent.setup>,
  master = MASTER,
  pin = PIN,
): Promise<void> {
  await user.type(screen.getByLabelText('Senha mestra (24 caracteres)'), master);
  await user.type(screen.getByLabelText('Repita a senha mestra'), master);
  await user.type(screen.getByLabelText('PIN (8 dígitos)'), pin);
  await user.click(screen.getByRole('button', { name: 'Avançar' }));
}

describe('AuthModal: criação do cofre, credenciais', () => {
  it('abre no primeiro passo quando o cofre ainda não existe', () => {
    open();
    expect(screen.getByText('Crie o seu cofre')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha mestra (24 caracteres)')).toBeInTheDocument();
    expect(screen.queryByText('Criar cofre')).not.toBeInTheDocument();
  });

  it('exige senha mestra de exatamente 24 caracteres', async () => {
    const user = userEvent.setup();
    open();

    await user.type(screen.getByLabelText('Senha mestra (24 caracteres)'), 'curta');
    await user.click(screen.getByRole('button', { name: 'Avançar' }));

    expect(
      screen.getByText('A senha mestra precisa ter exatamente 24 caracteres (você digitou 5).'),
    ).toBeInTheDocument();
  });

  it('recusa senha mestra previsível, mesmo com 24 caracteres', async () => {
    const user = userEvent.setup();
    open();

    const trivial = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    await user.type(screen.getByLabelText('Senha mestra (24 caracteres)'), trivial);
    await user.type(screen.getByLabelText('Repita a senha mestra'), trivial);
    await user.click(screen.getByRole('button', { name: 'Avançar' }));

    expect(screen.getByText(/Senha mestra previsível/)).toBeInTheDocument();
  });

  it('recusa quando as duas senhas não coincidem', async () => {
    const user = userEvent.setup();
    open();

    await user.type(screen.getByLabelText('Senha mestra (24 caracteres)'), MASTER);
    await user.type(screen.getByLabelText('Repita a senha mestra'), 'outra-senha-mestra-24chr');
    await user.click(screen.getByRole('button', { name: 'Avançar' }));

    expect(screen.getByText('As senhas não coincidem.')).toBeInTheDocument();
  });

  it('exige PIN de 8 dígitos', async () => {
    const user = userEvent.setup();
    open();

    await user.type(screen.getByLabelText('Senha mestra (24 caracteres)'), MASTER);
    await user.type(screen.getByLabelText('Repita a senha mestra'), MASTER);
    await user.type(screen.getByLabelText('PIN (8 dígitos)'), '123');
    await user.click(screen.getByRole('button', { name: 'Avançar' }));

    expect(screen.getByText('O PIN precisa ter exatamente 8 dígitos.')).toBeInTheDocument();
  });

  it('recusa PIN previsível, mesmo com 8 dígitos', async () => {
    const user = userEvent.setup();
    open();

    await user.type(screen.getByLabelText('Senha mestra (24 caracteres)'), MASTER);
    await user.type(screen.getByLabelText('Repita a senha mestra'), MASTER);
    await user.type(screen.getByLabelText('PIN (8 dígitos)'), '12345678');
    await user.click(screen.getByRole('button', { name: 'Avançar' }));

    expect(screen.getByText(/PIN previsível/)).toBeInTheDocument();
  });

  it('avança para a frase quando tudo está válido', async () => {
    const user = userEvent.setup();
    open();

    await fillCredentials(user);

    expect(screen.getByText('Frase de recuperação')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar cofre' })).toBeInTheDocument();
  });

  it('avança também pelo Enter, sem o botão', async () => {
    const user = userEvent.setup();
    open();

    await user.type(screen.getByLabelText('Senha mestra (24 caracteres)'), MASTER);
    await user.type(screen.getByLabelText('Repita a senha mestra'), MASTER);
    await user.type(screen.getByLabelText('PIN (8 dígitos)'), `${PIN}{Enter}`);

    expect(screen.getByText('Frase de recuperação')).toBeInTheDocument();
  });

  it('mede a força da senha e do PIN enquanto digita', async () => {
    const user = userEvent.setup();
    open();

    await user.type(screen.getByLabelText('Senha mestra (24 caracteres)'), 'aaaa');
    expect(screen.getByText('Muito fraca')).toBeInTheDocument();
  });

  it('volta ao passo anterior limpando o erro', async () => {
    const user = userEvent.setup();
    open();

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(screen.getByLabelText('Senha mestra (24 caracteres)')).toBeInTheDocument();
  });
});

describe('AuthModal: criação do cofre, frase de recuperação', () => {
  it('exige pelo menos 12 palavras', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const create = vi.fn();
    api.vault.create = create;
    open();
    await fillCredentials(user);

    await user.type(screen.getByLabelText('Sua frase de recuperação'), SHORT_PHRASE);
    await user.type(screen.getByLabelText('Repita a frase de recuperação'), SHORT_PHRASE);
    await user.click(screen.getByRole('button', { name: 'Criar cofre' }));

    expect(screen.getByText(/A frase precisa de pelo menos 12 palavras/)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('recusa frase previsível, mesmo com 12 palavras', async () => {
    const user = userEvent.setup();
    open();
    await fillCredentials(user);

    const trivial =
      'cavalo cavalo cavalo cavalo cavalo cavalo cavalo cavalo cavalo cavalo cavalo cavalo';
    await user.type(screen.getByLabelText('Sua frase de recuperação'), trivial);
    await user.type(screen.getByLabelText('Repita a frase de recuperação'), trivial);
    await user.click(screen.getByRole('button', { name: 'Criar cofre' }));

    expect(screen.getByText(/Frase previsível/)).toBeInTheDocument();
  });

  it('recusa quando as duas frases não coincidem', async () => {
    const user = userEvent.setup();
    open();
    await fillCredentials(user);

    await user.type(screen.getByLabelText('Sua frase de recuperação'), PHRASE);
    await user.type(screen.getByLabelText('Repita a frase de recuperação'), `${PHRASE} diferente`);
    await user.click(screen.getByRole('button', { name: 'Criar cofre' }));

    expect(screen.getByText('As frases não coincidem.')).toBeInTheDocument();
  });

  it('cria o cofre com a frase escrita pelo usuário', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const create = vi.fn().mockResolvedValue({ ok: true, status: UNLOCKED });
    api.vault.create = create;
    const onRefresh = open();
    await fillCredentials(user);

    await user.type(screen.getByLabelText('Sua frase de recuperação'), PHRASE);
    await user.type(screen.getByLabelText('Repita a frase de recuperação'), PHRASE);
    await user.click(screen.getByRole('button', { name: 'Criar cofre' }));

    expect(create).toHaveBeenCalledWith({
      masterPassword: MASTER,
      pin: PIN,
      recoveryPhrase: PHRASE,
    });
    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it('mostra o erro devolvido pelo cofre sem sair da tela', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.vault.create = vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'Senha mestra incorreta.', status: NO_VAULT });
    open();
    await fillCredentials(user);

    await user.type(screen.getByLabelText('Sua frase de recuperação'), PHRASE);
    await user.type(screen.getByLabelText('Repita a frase de recuperação'), PHRASE);
    await user.click(screen.getByRole('button', { name: 'Criar cofre' }));

    expect(await screen.findByText('Senha mestra incorreta.')).toBeInTheDocument();
  });

  it('usa a mensagem padrão quando o cofre não diz o que deu errado', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.vault.create = vi.fn().mockResolvedValue({ ok: false, status: NO_VAULT });
    open();
    await fillCredentials(user);

    await user.type(screen.getByLabelText('Sua frase de recuperação'), PHRASE);
    await user.type(screen.getByLabelText('Repita a frase de recuperação'), PHRASE);
    await user.click(screen.getByRole('button', { name: 'Criar cofre' }));

    expect(await screen.findByText('Erro interno do cofre.')).toBeInTheDocument();
  });

  it('mostra o erro quando a chamada ao cofre explode', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.vault.create = vi.fn().mockRejectedValue(new Error('Sem permissão em /var/lib.'));
    open();
    await fillCredentials(user);

    await user.type(screen.getByLabelText('Sua frase de recuperação'), PHRASE);
    await user.type(screen.getByLabelText('Repita a frase de recuperação'), PHRASE);
    await user.click(screen.getByRole('button', { name: 'Criar cofre' }));

    expect(await screen.findByText('Sem permissão em /var/lib.')).toBeInTheDocument();
  });
});

describe('AuthModal: desbloqueio por PIN', () => {
  it('oferece só o PIN antes de 3 falhas', () => {
    open(LOCKED);
    expect(screen.getByRole('button', { name: 'PIN' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Senha mestra' })).not.toBeInTheDocument();
    expect(screen.queryByText(/PIN incorreto 3 vezes/)).not.toBeInTheDocument();
  });

  it('desbloqueia com o PIN e recarrega o status', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const unlock = vi.fn().mockResolvedValue({ ok: true, status: UNLOCKED });
    api.vault.unlock = unlock;
    const onRefresh = open(LOCKED);

    await user.type(screen.getByPlaceholderText('Ex.: 49201733'), PIN);
    await user.click(screen.getByRole('button', { name: 'Desbloquear' }));

    expect(unlock).toHaveBeenCalledWith({ credential: PIN, kind: 'pin' });
    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it('não chama o cofre com a credencial em branco', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const unlock = vi.fn();
    api.vault.unlock = unlock;
    open(LOCKED);

    await user.click(screen.getByRole('button', { name: 'Desbloquear' }));

    expect(unlock).not.toHaveBeenCalled();
  });

  it('desbloqueia pelo Enter', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const unlock = vi.fn().mockResolvedValue({ ok: true, status: UNLOCKED });
    api.vault.unlock = unlock;
    open(LOCKED);

    await user.type(screen.getByPlaceholderText('Ex.: 49201733'), `${PIN}{Enter}`);

    expect(unlock).toHaveBeenCalledWith({ credential: PIN, kind: 'pin' });
  });

  it('mostra o erro do cofre e recarrega o status numa falha', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.vault.unlock = vi.fn().mockResolvedValue({
      ok: false,
      error: 'PIN incorreto.',
      status: LOCKED,
    });
    const onRefresh = open(LOCKED);

    await user.type(screen.getByPlaceholderText('Ex.: 49201733'), PIN);
    await user.click(screen.getByRole('button', { name: 'Desbloquear' }));

    expect(await screen.findByText('PIN incorreto.')).toBeInTheDocument();
    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it('usa a mensagem padrão quando a falha vem sem texto', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.vault.unlock = vi.fn().mockResolvedValue({ ok: false, status: LOCKED });
    open(LOCKED);

    await user.type(screen.getByPlaceholderText('Ex.: 49201733'), PIN);
    await user.click(screen.getByRole('button', { name: 'Desbloquear' }));

    expect(await screen.findByText('Erro interno do cofre.')).toBeInTheDocument();
  });

  it('mostra o erro quando a chamada explode', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.vault.unlock = vi.fn().mockRejectedValue(new Error('canal IPC fechado'));
    open(LOCKED);

    await user.type(screen.getByPlaceholderText('Ex.: 49201733'), PIN);
    await user.click(screen.getByRole('button', { name: 'Desbloquear' }));

    expect(await screen.findByText('canal IPC fechado')).toBeInTheDocument();
  });

  it('bloqueia o botão e conta o tempo enquanto a trava expira', () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const status: VaultStatus = { ...LOCKED, lockRemainingMs: 65_000 };
    render(
      <MessagesProvider language="pt-BR">
        <AuthModal status={status} onRefresh={onRefresh} />
      </MessagesProvider>,
    );

    expect(screen.getByText('Muitas tentativas. Tente novamente em 1:05.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desbloquear' })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Muitas tentativas. Tente novamente em 5s.')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.queryByText(/Muitas tentativas/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desbloquear' })).toBeEnabled();
  });

  it('volta ao PIN e limpa a senha mestra quando as tentativas caem de 3', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <MessagesProvider language="pt-BR">
        <AuthModal
          status={{ ...LOCKED, attempts: 3 }}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
        />
      </MessagesProvider>,
    );
    expect(screen.getByRole('button', { name: 'Senha mestra' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Senha mestra' }));
    const masterInput = screen.getByPlaceholderText('Ex.: 24 caracteres quaisquer');
    await user.type(masterInput, MASTER);

    rerender(
      <MessagesProvider language="pt-BR">
        <AuthModal
          status={{ ...LOCKED, attempts: 1 }}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
        />
      </MessagesProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Senha mestra' })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ex.: 49201733')).toHaveValue('');
  });
});

describe('AuthModal: desbloqueio por senha mestra', () => {
  const THREE_FAILURES: VaultStatus = { ...LOCKED, attempts: 3 };

  it('só oferece a senha mestra depois de 3 falhas de PIN', () => {
    open(THREE_FAILURES);
    expect(screen.getByRole('button', { name: 'Senha mestra' })).toBeInTheDocument();
    expect(screen.getByText(/PIN incorreto 3 vezes/)).toBeInTheDocument();
  });

  it('manda kind master e troca o placeholder', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const unlock = vi.fn().mockResolvedValue({ ok: true, status: UNLOCKED });
    api.vault.unlock = unlock;
    open(THREE_FAILURES);

    await user.click(screen.getByRole('button', { name: 'Senha mestra' }));
    const input = screen.getByPlaceholderText('Ex.: 24 caracteres quaisquer');
    await user.type(input, MASTER);
    await user.click(screen.getByRole('button', { name: 'Desbloquear' }));

    expect(unlock).toHaveBeenCalledWith({ credential: MASTER, kind: 'master' });
  });

  it('volta ao PIN limpando o que foi digitado', async () => {
    const user = userEvent.setup();
    open(THREE_FAILURES);

    await user.click(screen.getByRole('button', { name: 'Senha mestra' }));
    await user.type(screen.getByPlaceholderText('Ex.: 24 caracteres quaisquer'), 'abc');
    await user.click(screen.getByRole('button', { name: 'PIN' }));

    expect(screen.getByPlaceholderText('Ex.: 49201733')).toHaveValue('');
  });
});

describe('AuthModal: redefinição de PIN', () => {
  it('mostra a trava ativa também durante a redefinição do PIN', async () => {
    const user = userEvent.setup();
    open({ ...LOCKED, lockRemainingMs: 65_000, lockUntil: Date.now() + 65_000 });

    await user.click(screen.getByRole('button', { name: 'Esqueci o PIN' }));

    expect(screen.getByText(/Muitas tentativas/)).toBeInTheDocument();
  });

  it('abre pela tela de esqueci o PIN e volta ao PIN', async () => {
    const user = userEvent.setup();
    open(LOCKED);

    await user.click(screen.getByRole('button', { name: 'Esqueci o PIN' }));
    expect(screen.getByText('Redefinir PIN')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Voltar para o PIN' }));
    expect(screen.getByText('Cofre bloqueado')).toBeInTheDocument();
  });

  it('exige 12 palavras na frase de recuperação', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const resetPin = vi.fn();
    api.vault.resetPin = resetPin;
    open(LOCKED);
    await user.click(screen.getByRole('button', { name: 'Esqueci o PIN' }));

    await user.type(screen.getByLabelText('Sua frase de recuperação'), SHORT_PHRASE);
    await user.type(screen.getByLabelText('Novo PIN (8 dígitos)'), PIN);
    await user.type(screen.getByLabelText('Repita o novo PIN'), PIN);
    await user.click(screen.getByRole('button', { name: 'Redefinir e abrir' }));

    expect(screen.getByText(/A frase precisa de pelo menos 12 palavras/)).toBeInTheDocument();
    expect(resetPin).not.toHaveBeenCalled();
  });

  it('exige PIN de 8 dígitos', async () => {
    const user = userEvent.setup();
    open(LOCKED);
    await user.click(screen.getByRole('button', { name: 'Esqueci o PIN' }));

    await user.type(screen.getByLabelText('Sua frase de recuperação'), PHRASE);
    await user.type(screen.getByLabelText('Novo PIN (8 dígitos)'), '123');
    await user.click(screen.getByRole('button', { name: 'Redefinir e abrir' }));

    expect(screen.getByText('O PIN precisa ter exatamente 8 dígitos.')).toBeInTheDocument();
  });

  it('recusa PIN previsível', async () => {
    const user = userEvent.setup();
    open(LOCKED);
    await user.click(screen.getByRole('button', { name: 'Esqueci o PIN' }));

    await user.type(screen.getByLabelText('Sua frase de recuperação'), PHRASE);
    await user.type(screen.getByLabelText('Novo PIN (8 dígitos)'), '12345678');
    await user.click(screen.getByRole('button', { name: 'Redefinir e abrir' }));

    expect(screen.getByText(/PIN previsível/)).toBeInTheDocument();
  });

  it('recusa quando os dois PINs não coincidem', async () => {
    const user = userEvent.setup();
    open(LOCKED);
    await user.click(screen.getByRole('button', { name: 'Esqueci o PIN' }));

    await user.type(screen.getByLabelText('Sua frase de recuperação'), PHRASE);
    await user.type(screen.getByLabelText('Novo PIN (8 dígitos)'), PIN);
    await user.type(screen.getByLabelText('Repita o novo PIN'), '11111111');
    await user.click(screen.getByRole('button', { name: 'Redefinir e abrir' }));

    expect(screen.getByText('Os PINs não coincidem.')).toBeInTheDocument();
  });

  it('redefine o PIN e volta para a tela de desbloqueio', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const resetPin = vi.fn().mockResolvedValue({ ok: true, status: UNLOCKED });
    api.vault.resetPin = resetPin;
    const onRefresh = open(LOCKED);
    await user.click(screen.getByRole('button', { name: 'Esqueci o PIN' }));

    await user.type(screen.getByLabelText('Sua frase de recuperação'), PHRASE);
    await user.type(screen.getByLabelText('Novo PIN (8 dígitos)'), PIN);
    await user.type(screen.getByLabelText('Repita o novo PIN'), PIN);
    await user.click(screen.getByRole('button', { name: 'Redefinir e abrir' }));

    expect(resetPin).toHaveBeenCalledWith({ phrase: PHRASE, newPin: PIN });
    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalled();
    });
    expect(await screen.findByText('Cofre bloqueado')).toBeInTheDocument();
  });

  it('mostra o erro do cofre quando a frase não bate', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.vault.resetPin = vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'Frase de recuperação incorreta.', status: LOCKED });
    open(LOCKED);
    await user.click(screen.getByRole('button', { name: 'Esqueci o PIN' }));

    await user.type(screen.getByLabelText('Sua frase de recuperação'), PHRASE);
    await user.type(screen.getByLabelText('Novo PIN (8 dígitos)'), PIN);
    await user.type(screen.getByLabelText('Repita o novo PIN'), PIN);
    await user.click(screen.getByRole('button', { name: 'Redefinir e abrir' }));

    expect(await screen.findByText('Frase de recuperação incorreta.')).toBeInTheDocument();
  });

  it('usa a mensagem padrão quando a falha vem sem texto', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.vault.resetPin = vi.fn().mockResolvedValue({ ok: false, status: LOCKED });
    open(LOCKED);
    await user.click(screen.getByRole('button', { name: 'Esqueci o PIN' }));

    await user.type(screen.getByLabelText('Sua frase de recuperação'), PHRASE);
    await user.type(screen.getByLabelText('Novo PIN (8 dígitos)'), PIN);
    await user.type(screen.getByLabelText('Repita o novo PIN'), PIN);
    await user.click(screen.getByRole('button', { name: 'Redefinir e abrir' }));

    expect(await screen.findByText('Erro interno do cofre.')).toBeInTheDocument();
  });

  it('mostra o erro quando a chamada explode', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.vault.resetPin = vi.fn().mockRejectedValue(new Error('canal fechado'));
    open(LOCKED);
    await user.click(screen.getByRole('button', { name: 'Esqueci o PIN' }));

    await user.type(screen.getByLabelText('Sua frase de recuperação'), PHRASE);
    await user.type(screen.getByLabelText('Novo PIN (8 dígitos)'), PIN);
    await user.type(screen.getByLabelText('Repita o novo PIN'), PIN);
    await user.click(screen.getByRole('button', { name: 'Redefinir e abrir' }));

    expect(await screen.findByText('canal fechado')).toBeInTheDocument();
  });

  it('mede a força do novo PIN enquanto digita', async () => {
    const user = userEvent.setup();
    open(LOCKED);
    await user.click(screen.getByRole('button', { name: 'Esqueci o PIN' }));

    await user.type(screen.getByLabelText('Novo PIN (8 dígitos)'), '999');
    expect(screen.getByText('Muito fraca')).toBeInTheDocument();
  });
});

describe('AuthModal: restauração de backup na criação', () => {
  it('restaura o cofre e recarrega o status, sem exigir cofre existente', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const restore = vi.fn().mockResolvedValue({ path: '/media/p/guardinha.gbk', files: 3 });
    api.backup.restore = restore;
    const onRefresh = open();

    await user.click(screen.getByRole('button', { name: 'Restaurar de um backup' }));

    expect(restore).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it('não recarrega o status quando o usuário cancela o diálogo', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.backup.restore = vi.fn().mockResolvedValue({ canceled: true });
    const onRefresh = open();

    await user.click(screen.getByRole('button', { name: 'Restaurar de um backup' }));

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('mostra o erro quando a restauração falha, sem sair da tela', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.backup.restore = vi.fn().mockRejectedValue(new Error('O backup está corrompido.'));
    open();

    await user.click(screen.getByRole('button', { name: 'Restaurar de um backup' }));

    expect(await screen.findByText('O backup está corrompido.')).toBeInTheDocument();
    expect(screen.getByText('Crie o seu cofre')).toBeInTheDocument();
  });
});

describe('AuthModal: estado de ocupado de cada operação', () => {
  interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
  }

  function deferred<T>(): Deferred<T> {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  it('desabilita "Criar cofre" enquanto o main cria o cofre', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const pending = deferred<{ ok: true; status: VaultStatus }>();
    api.vault.create = vi.fn(() => pending.promise);
    open();
    await fillCredentials(user);
    await user.type(screen.getByLabelText('Sua frase de recuperação'), PHRASE);
    await user.type(screen.getByLabelText('Repita a frase de recuperação'), PHRASE);

    await user.click(screen.getByRole('button', { name: 'Criar cofre' }));
    expect(screen.getByRole('button', { name: 'Criando cofre…' })).toBeDisabled();

    await act(async () => {
      pending.resolve({ ok: true, status: UNLOCKED });
      await pending.promise;
    });
    expect(await screen.findByRole('button', { name: 'Criar cofre' })).toBeEnabled();
  });

  it('desabilita "Desbloquear" enquanto verifica a credencial', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const pending = deferred<{ ok: true; status: VaultStatus }>();
    api.vault.unlock = vi.fn(() => pending.promise);
    open(LOCKED);

    await user.type(screen.getByPlaceholderText('Ex.: 49201733'), PIN);
    await user.click(screen.getByRole('button', { name: 'Desbloquear' }));
    expect(screen.getByRole('button', { name: 'Verificando…' })).toBeDisabled();

    await act(async () => {
      pending.resolve({ ok: true, status: UNLOCKED });
      await pending.promise;
    });
    expect(await screen.findByRole('button', { name: 'Desbloquear' })).toBeEnabled();
  });

  it('desabilita "Redefinir e abrir" enquanto troca o PIN', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const pending = deferred<{ ok: true; status: VaultStatus }>();
    api.vault.resetPin = vi.fn(() => pending.promise);
    open(LOCKED);
    await user.click(screen.getByRole('button', { name: 'Esqueci o PIN' }));
    await user.type(screen.getByLabelText('Sua frase de recuperação'), PHRASE);
    await user.type(screen.getByLabelText('Novo PIN (8 dígitos)'), PIN);
    await user.type(screen.getByLabelText('Repita o novo PIN'), PIN);

    await user.click(screen.getByRole('button', { name: 'Redefinir e abrir' }));
    expect(screen.getByRole('button', { name: 'Redefinindo…' })).toBeDisabled();

    await act(async () => {
      pending.resolve({ ok: true, status: UNLOCKED });
      await pending.promise;
    });
    expect(await screen.findByRole('button', { name: 'Desbloquear' })).toBeEnabled();
  });

  it('desabilita a restauração enquanto o backup é lido', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const pending = deferred<{ canceled: true }>();
    api.backup.restore = vi.fn(() => pending.promise);
    open();

    await user.click(screen.getByRole('button', { name: 'Restaurar de um backup' }));
    expect(screen.getByRole('button', { name: 'Restaurar de um backup' })).toBeDisabled();

    await act(async () => {
      pending.resolve({ canceled: true });
      await pending.promise;
    });
    expect(await screen.findByRole('button', { name: 'Restaurar de um backup' })).toBeEnabled();
  });
});

describe('AuthModal: detalhes dos campos e dos modos', () => {
  it('só trata a trava de 1 ms como ativa, que é o último instante', () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    render(
      <MessagesProvider language="pt-BR">
        <AuthModal status={{ ...LOCKED, lockRemainingMs: 1 }} onRefresh={onRefresh} />
      </MessagesProvider>,
    );

    expect(screen.getByText(/Muitas tentativas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desbloquear' })).toBeDisabled();
    vi.useRealTimers();
  });

  it('o campo do PIN usa teclado numérico, e o da senha mestra não', async () => {
    const user = userEvent.setup();
    open({ ...LOCKED, attempts: 3 });

    const pin = screen.getByPlaceholderText('Ex.: 49201733');
    expect(pin).toHaveAttribute('inputmode', 'numeric');

    await user.click(screen.getByRole('button', { name: 'Senha mestra' }));
    expect(screen.getByPlaceholderText('Ex.: 24 caracteres quaisquer')).not.toHaveAttribute(
      'inputmode',
      'numeric',
    );
  });

  it('a frase de recuperação só ganha medidor quando tem texto', async () => {
    const user = userEvent.setup();
    open();
    await fillCredentials(user);

    expect(screen.queryByText('Força')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Sua frase de recuperação'), 'curta');
    expect(screen.getByText('Força')).toBeInTheDocument();
  });

  it('as caixas de frase têm três linhas', async () => {
    const user = userEvent.setup();
    open();
    await fillCredentials(user);

    for (const caixa of screen.getAllByRole('textbox')) {
      expect(caixa).toHaveAttribute('rows', '3');
    }
  });

  it('volta da redefinição para o PIN, e não para outro modo', async () => {
    const user = userEvent.setup();
    open(LOCKED);
    await user.click(screen.getByRole('button', { name: 'Esqueci o PIN' }));
    await user.click(screen.getByRole('button', { name: 'Voltar para o PIN' }));

    expect(screen.getByPlaceholderText('Ex.: 49201733')).toHaveValue('');
    expect(screen.getByPlaceholderText('Ex.: 49201733')).toHaveAttribute('inputmode', 'numeric');
  });

  it('depois de redefinir o PIN, o desbloqueio volta ao modo PIN', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.vault.resetPin = vi.fn().mockResolvedValue({ ok: true, status: UNLOCKED });
    open(LOCKED);
    await user.click(screen.getByRole('button', { name: 'Esqueci o PIN' }));
    await user.type(screen.getByLabelText('Sua frase de recuperação'), PHRASE);
    await user.type(screen.getByLabelText('Novo PIN (8 dígitos)'), PIN);
    await user.type(screen.getByLabelText('Repita o novo PIN'), PIN);
    await user.click(screen.getByRole('button', { name: 'Redefinir e abrir' }));

    expect(await screen.findByPlaceholderText('Ex.: 49201733')).toHaveAttribute(
      'inputmode',
      'numeric',
    );
  });
});

describe('AuthModal: mensagens de estado do cofre', () => {
  it('não oferece senha mestra como caminho novo de criação', () => {
    open({ ...NO_VAULT, attempts: 5 });
    // a regra vale para o desbloqueio; na criação o cofre não existe ainda
    expect(screen.getByText('Crie o seu cofre')).toBeInTheDocument();
    expect(NO_PANIC.hasPanicPin).toBe(false);
  });
});
