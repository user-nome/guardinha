import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '@zero/renderer/i18n';
import { AuthTokenModal } from '@zero/renderer/components/AuthTokenModal';
import { installApi } from '../mocks/api.ts';

describe('AuthTokenModal', () => {
  it('cria um token pela aba manual sem enviar um id', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const save = vi.fn().mockResolvedValue([]);
    api.authenticator.save = save;
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
    await user.type(
      screen.getByPlaceholderText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP'),
      'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    );
    await user.type(screen.getByLabelText('Serviço'), 'GitHub');
    await user.type(screen.getByLabelText('Conta'), 'alice@example.com');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          issuer: 'GitHub',
          account: 'alice@example.com',
          secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
        }),
      );
    });
    expect(save.mock.calls[0]?.[0]).not.toHaveProperty('id');
  });

  it('usa o emissor padrão na prévia sem emissor no endereço', async () => {
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

    await user.type(
      screen.getByRole('textbox'),
      'otpauth://totp/alice?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    );

    expect(await screen.findByText(/Sem serviço · alice · SHA1 · 6 · 30s/)).toBeInTheDocument();
  });

  it('avisa quando a chave fica abaixo do mínimo da OWASP', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Digitar a chave' }));
    await user.type(
      screen.getByPlaceholderText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP'),
      'JBSWY3DPEHPK3PXP',
    );

    expect(await screen.findByText(/Esta chave tem 80 bits/)).toBeInTheDocument();
    expect(screen.getByText(/OWASP recomenda pelo menos 128 bits/)).toBeInTheDocument();
  });

  it('avisa quando a chave atinge o mínimo mas fica abaixo do recomendado', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Digitar a chave' }));
    await user.type(
      screen.getByPlaceholderText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP'),
      'A'.repeat(26),
    );

    expect(
      await screen.findByText(/Esta chave tem 128 bits, o mínimo da OWASP/),
    ).toBeInTheDocument();
  });

  it('não avisa quando a chave atinge o recomendado', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Digitar a chave' }));
    await user.type(
      screen.getByPlaceholderText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP'),
      'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    );

    expect(screen.queryByText(/OWASP/)).not.toBeInTheDocument();
  });

  it('não avisa antes de haver uma chave aceita', async () => {
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

    expect(screen.queryByText(/OWASP/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Digitar a chave' }));
    await user.type(screen.getByPlaceholderText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP'), 'AA');
    expect(screen.queryByText(/OWASP/)).not.toBeInTheDocument();
  });

  it('avisa na prévia do endereço quando o segredo tem 80 bits', async () => {
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

    await user.type(
      screen.getByRole('textbox'),
      'otpauth://totp/Servico:alice?secret=JBSWY3DPEHPK3PXP&issuer=Servico',
    );

    expect(await screen.findByText(/Esta chave tem 80 bits/)).toBeInTheDocument();
  });
});
