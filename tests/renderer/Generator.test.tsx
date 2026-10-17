import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '@zero/renderer/i18n';
import { Generator } from '@zero/renderer/components/Generator';
import { installApi } from '../mocks/api.ts';

/**
 * O gerador de senha é a tela que mais depende do main (a entropia sai do
 * `crypto.randomBytes` do Node, não do `Math.random` do renderer). Os testes
 * conferem o contrato com o cofre: o que a tela pede e o que ela faz com a
 * resposta.
 */

function open(): ReturnType<typeof vi.fn> {
  const onToast = vi.fn<(message: string) => void>();
  render(
    <MessagesProvider language="pt-BR">
      <Generator onToast={onToast} />
    </MessagesProvider>,
  );
  return onToast;
}

describe('Generator', () => {
  it('abre com o tamanho padrão e as quatro categorias ligadas', () => {
    open();
    expect(screen.getByText('24 caracteres')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Tamanho da Senha' })).toHaveAttribute(
      'aria-valuenow',
      '24',
    );
    for (const label of ['Maiúsculas', 'Minúsculas', 'Números', 'Símbolos']) {
      expect(screen.getByRole('checkbox', { name: label })).toBeChecked();
    }
  });

  it('gera a senha pedindo ao processo main, não no renderer', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const generate = vi.fn().mockResolvedValue('Senha-Forte-123!');
    api.generator.generate = generate;
    open();

    await user.click(screen.getByRole('button', { name: /Gerar Senha Criptográfica/ }));

    expect(generate).toHaveBeenCalledWith({
      length: 24,
      useLower: true,
      countLower: 0,
      useUpper: true,
      countUpper: 0,
      useNumbers: true,
      countNumbers: 0,
      useSymbols: true,
      countSymbols: 0,
      customEntropyWords: ['', '', '', '', ''],
      includeCustomEntropyWords: false,
    });
    expect(await screen.findByText('Senha-Forte-123!')).toBeInTheDocument();
  });

  it('não chama o processo main quando o tamanho é zero', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const generate = vi.fn().mockResolvedValue('x');
    api.generator.generate = generate;
    const onToast = open();

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Tamanho da Senha' }), { key: 'Home' });
    await user.click(screen.getByRole('button', { name: /Gerar Senha Criptográfica/ }));

    expect(onToast).toHaveBeenCalledWith('Escolha um tamanho maior que 0.');
    expect(generate).not.toHaveBeenCalled();
  });

  it('recusa palavras pessoais maiores que o tamanho escolhido', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const generate = vi.fn().mockResolvedValue('x');
    api.generator.generate = generate;
    const onToast = open();

    const wordCount = screen.getByRole('textbox', {
      name: 'Quantidade de palavras pessoais (0 a 5)',
    });
    await user.clear(wordCount);
    await user.type(wordCount, '1');
    await user.type(screen.getByPlaceholderText('Objeto'), 'x'.repeat(25));
    await user.click(
      screen.getByRole('checkbox', { name: 'Incluir as palavras literalmente na senha' }),
    );
    await user.click(screen.getByRole('button', { name: /Gerar Senha Criptográfica/ }));

    expect(onToast).toHaveBeenCalledWith('As palavras pessoais excedem o tamanho total da senha.');
    expect(generate).not.toHaveBeenCalled();
  });

  it('limita os caracteres manuais e sinaliza quando palavras excedem a cota', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const generate = vi.fn().mockResolvedValue('x');
    api.generator.generate = generate;
    const onToast = open();

    const countLower = screen.getByRole('textbox', { name: 'Minúsculas: Quantidade' });
    await user.clear(countLower);
    await user.type(countLower, '9');
    const wordCount = screen.getByRole('textbox', {
      name: 'Quantidade de palavras pessoais (0 a 5)',
    });
    await user.clear(wordCount);
    await user.type(wordCount, '1');
    await user.type(screen.getByPlaceholderText('Objeto'), 'x');
    await user.click(
      screen.getByRole('checkbox', { name: 'Incluir as palavras literalmente na senha' }),
    );

    expect(
      screen.getByText('Caracteres definidos: 10 de 9 disponíveis (limite de 40%).'),
    ).toHaveClass('text-red-300');
    await user.click(screen.getByRole('button', { name: /Gerar Senha Criptográfica/ }));

    expect(onToast).toHaveBeenCalledWith(
      'As opções pessoais excedem o limite de 40% do tamanho da senha.',
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it('transforma uma contagem que excede Number em zero', () => {
    open();
    const countLower = screen.getByRole('textbox', { name: 'Minúsculas: Quantidade' });

    fireEvent.change(countLower, { target: { value: '9'.repeat(400) } });

    expect(countLower).toHaveValue('0');
  });

  it('transforma uma quantidade de palavras que excede Number em zero', () => {
    open();
    const wordCount = screen.getByRole('textbox', {
      name: 'Quantidade de palavras pessoais (0 a 5)',
    });

    fireEvent.change(wordCount, { target: { value: '9'.repeat(400) } });

    expect(wordCount).toHaveValue('0');
    expect(screen.queryByPlaceholderText('Objeto')).not.toBeInTheDocument();
  });

  it('zera a contagem ao desligar uma categoria e preserva a última ligada', async () => {
    const user = userEvent.setup();
    open();
    const countLower = screen.getByRole('textbox', { name: 'Minúsculas: Quantidade' });
    await user.clear(countLower);
    await user.type(countLower, '2');
    await user.click(screen.getByRole('checkbox', { name: 'Minúsculas' }));
    expect(countLower).toHaveValue('0');

    for (const label of ['Maiúsculas', 'Números', 'Símbolos']) {
      await user.click(screen.getByRole('checkbox', { name: label }));
    }
    expect(screen.getByRole('checkbox', { name: 'Símbolos' })).toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'Minúsculas' }));
    expect(screen.getByRole('checkbox', { name: 'Minúsculas' })).toBeChecked();
  });

  it('manda as categorias desligadas e os cinco gostos digitados', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const generate = vi.fn().mockResolvedValue('x');
    api.generator.generate = generate;
    open();

    await user.click(screen.getByRole('checkbox', { name: 'Símbolos' }));
    await user.type(screen.getByPlaceholderText('Objeto'), 'fone');
    await user.type(screen.getByPlaceholderText('Número'), '2001');

    await user.click(screen.getByRole('button', { name: /Gerar Senha Criptográfica/ }));

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        useSymbols: false,
        customEntropyWords: ['fone', '2001', '', '', ''],
      }),
    );
  });

  it('envia quantidades por classe e só as palavras pessoais escolhidas', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const generate = vi.fn().mockResolvedValue('x');
    api.generator.generate = generate;
    open();

    const lowercaseCount = screen.getByRole('textbox', {
      name: 'Minúsculas: Quantidade',
    });
    await user.clear(lowercaseCount);
    await user.type(lowercaseCount, '2');

    const wordCount = screen.getByRole('textbox', {
      name: 'Quantidade de palavras pessoais (0 a 5)',
    });
    await user.clear(wordCount);
    await user.type(wordCount, '2');
    await user.type(screen.getByPlaceholderText('Objeto'), 'lago');
    await user.type(screen.getByPlaceholderText('Número'), '42');
    await user.click(
      screen.getByRole('checkbox', { name: 'Incluir as palavras literalmente na senha' }),
    );
    const symbolCount = screen.getByRole('textbox', { name: 'Símbolos: Quantidade' });
    await user.clear(symbolCount);
    await user.type(symbolCount, '4');
    expect(symbolCount).toHaveValue('1');
    await user.click(screen.getByRole('button', { name: /Gerar Senha Criptográfica/ }));

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        countLower: 2,
        countSymbols: 1,
        customEntropyWords: ['lago', '42'],
        includeCustomEntropyWords: true,
      }),
    );
  });

  it('exige palavras preenchidas antes de incluí-las literalmente', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const generate = vi.fn().mockResolvedValue('x');
    api.generator.generate = generate;
    const onToast = open();

    await user.click(
      screen.getByRole('checkbox', { name: 'Incluir as palavras literalmente na senha' }),
    );
    await user.click(screen.getByRole('button', { name: /Gerar Senha Criptográfica/ }));

    expect(generate).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(
      'Preencha todas as palavras selecionadas ou desative a inclusão literal.',
    );
  });

  it('só com maiúsculas marcadas pede senha sem as outras categorias', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const generate = vi.fn().mockResolvedValue('X');
    api.generator.generate = generate;
    open();

    await user.click(screen.getByRole('checkbox', { name: 'Minúsculas' }));
    await user.click(screen.getByRole('checkbox', { name: 'Números' }));
    await user.click(screen.getByRole('checkbox', { name: 'Símbolos' }));
    await user.click(screen.getByRole('button', { name: /Gerar Senha Criptográfica/ }));

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        useUpper: true,
        useLower: false,
        useNumbers: false,
        useSymbols: false,
      }),
    );
  });

  it('não deixa desligar a última categoria, que deixaria o gerador sem conjunto', async () => {
    const user = userEvent.setup();
    open();

    for (const label of ['Minúsculas', 'Números', 'Símbolos']) {
      await user.click(screen.getByRole('checkbox', { name: label }));
    }

    // só "Maiúsculas" sobrou, e ela continua ligada: sem conjunto não há senha
    expect(screen.getByRole('checkbox', { name: 'Maiúsculas' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Maiúsculas' }));
    expect(screen.getByRole('checkbox', { name: 'Maiúsculas' })).toBeChecked();
  });

  it('muda o tamanho pelo slider', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const generate = vi.fn().mockResolvedValue('x');
    api.generator.generate = generate;
    open();

    const slider = screen.getByRole('slider', { name: 'Tamanho da Senha' });
    slider.focus();
    await user.keyboard('{ArrowRight}');

    await user.click(screen.getByRole('button', { name: /Gerar Senha Criptográfica/ }));

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ length: 25 }));
  });

  it('recusa tamanho zero, sem chamar o cofre', async () => {
    const user = userEvent.setup();
    const api = installApi();
    const generate = vi.fn().mockResolvedValue('x');
    api.generator.generate = generate;
    const onToast = open();

    const slider = screen.getByRole('slider', { name: 'Tamanho da Senha' });
    slider.focus();
    await user.keyboard('{Home}'); // vai para o mínimo, que é 0

    await user.click(screen.getByRole('button', { name: /Gerar Senha Criptográfica/ }));

    expect(generate).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith('Escolha um tamanho maior que 0.');
  });

  it('mede a força da senha gerada', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.generator.generate = vi.fn().mockResolvedValue('aaaa');
    open();

    await user.click(screen.getByRole('button', { name: /Gerar Senha Criptográfica/ }));

    expect(await screen.findByText('Muito fraca')).toBeInTheDocument();
  });

  it('copia a senha gerada e avisa', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.generator.generate = vi.fn().mockResolvedValue('Senha-Copiada');
    const copy = vi.fn().mockResolvedValue(undefined);
    api.clipboard.copy = copy;
    const onToast = open();

    await user.click(screen.getByRole('button', { name: /Gerar Senha Criptográfica/ }));
    await user.click(await screen.findByTitle('Copiar senha gerada'));

    expect(copy).toHaveBeenCalledWith('Senha-Copiada');
    expect(onToast).toHaveBeenCalledWith('Senha copiada.');
  });

  it('mostra o erro do cofre quando a geração falha', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.generator.generate = vi.fn().mockRejectedValue(new Error('Parâmetros inválidos.'));
    const onToast = open();

    await user.click(screen.getByRole('button', { name: /Gerar Senha Criptográfica/ }));

    expect(onToast).toHaveBeenCalledWith('Parâmetros inválidos.');
  });

  it('usa a mensagem padrão quando a falha não traz texto', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.generator.generate = vi.fn().mockRejectedValue(new Error(''));
    const onToast = open();

    await user.click(screen.getByRole('button', { name: /Gerar Senha Criptográfica/ }));

    expect(onToast).toHaveBeenCalledWith('Parâmetros inválidos para o gerador de senhas.');
  });

  it('avisa quando a cópia falha', async () => {
    const user = userEvent.setup();
    const api = installApi();
    api.generator.generate = vi.fn().mockResolvedValue('Senha-Copiada');
    api.clipboard.copy = vi.fn().mockRejectedValue(new Error('sem área de transferência'));
    const onToast = open();

    await user.click(screen.getByRole('button', { name: /Gerar Senha Criptográfica/ }));
    await user.click(await screen.findByTitle('Copiar senha gerada'));

    expect(onToast).toHaveBeenCalledWith('sem área de transferência');
  });

  it('não mostra senha nem botão de copiar antes de gerar', () => {
    open();
    expect(screen.queryByTitle('Copiar senha gerada')).not.toBeInTheDocument();
  });
});

describe('os limites do slider', () => {
  it('vai de 0 a 72, que é o teto que o main aceita', () => {
    // `assertGeneratorOptions` recusa acima de 72: se o slider deixasse passar
    // 73, o app geraria a senha e a gravação seria recusada pelo main, com o
    // usuário olhando para uma senha que não salva.
    open();
    expect(screen.getByRole('slider', { name: 'Tamanho da Senha' })).toHaveAttribute(
      'aria-valuemax',
      '72',
    );
  });

  it('tamanho 1 avisa que o tamanho está vazio em vez de gerar', async () => {
    // A guarda é `length <= 0`: em 1 o gerador tem o que sortear, e avisar
    // "tamanho vazio" seria mentira.
    const user = userEvent.setup();
    installApi();
    const onToast = open();
    const slider = screen.getByRole('slider', { name: 'Tamanho da Senha' });
    slider.focus();
    for (let i = 0; i < 24; i++) await user.keyboard('{ArrowLeft}');

    expect(slider).toHaveAttribute('aria-valuenow', '0');
    await user.click(screen.getByRole('button', { name: /Gerar/i }));

    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('0'));
  });
});
