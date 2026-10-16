# Documentação técnica

O [`README.md`](../README.md) da raiz é a porta de entrada do projeto: o que
o app é, como instalar e por que ele existe. Aqui fica o material técnico, para
quem vai mexer no código.

Leia nesta ordem na primeira vez:

1. [Visão geral](visao-geral.md): o que o app faz, o que ele não faz, as
   dependências e o glossário.
2. [Arquitetura](arquitetura.md): camadas, módulos do processo main, os
   aliases `@zero/*`, o fluxo de IPC e o ciclo de vida da sessão.
3. [O cofre](cofre.md): onde os arquivos moram, o formato do `vault.zkv`, o
   custo do Argon2id por método e como o cofre é destruído.

Depois, pelo assunto:

| Documento                                      | Assunto                                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| [Credenciais, gerador e força](credenciais.md) | O registro de credencial, o gerador de senhas, a checagem de força e o clipboard |
| [Telas e componentes](telas.md)                | Os componentes do renderer, as abas da Sidebar e o fluxo de autenticação         |
| [Verificador de 2FA](autenticador.md)          | TOTP (RFC 6238), o formato `otpauth://` e onde o segredo mora                    |
| [Backup no pendrive](backup.md)                | O pacote `.gbk`, o manifesto e a restauração depois de formatar a máquina        |
| [API interna](api.md)                          | O contrato `window.api`, canal por canal, e os tipos em `src/types/`             |
| [Mensagens e idiomas](messages.md)             | O i18n: onde cada texto vive, o que não se traduz e como adicionar um idioma     |
| [Build, pacote e distribuição](build.md)       | Os comandos, o que vai dentro do `.deb` e o que roda no CI                       |
| [Testes](testes.md)                            | A suíte Vitest, os arquivos de teste e as convenções                             |
| [Testes ponta a ponta](e2e.md)                 | O Playwright sobre o app compilado e o payload do `.deb`, e o job do CI          |
| [Testes de mutação](mutation.md)               | O runner próprio, os operadores e o placar da varredura                          |
| [Mapa de segurança](seguranca.md)              | Onde cada medida mora no código e o que não pode ser enfraquecido                |

O texto normativo de segurança é o [`SECURITY.md`](../SECURITY.md) da raiz:
versões suportadas, proteções, riscos aceitos, fora de escopo e como reportar
uma falha. O mapa é o mapa: as mesmas medidas apontadas por arquivo, para quem
precisa editar.

As regras do repositório para agentes e contribuidores estão em
[`AGENTS.md`](../AGENTS.md), e o fluxo de contribuição e publicação em
[`CONTRIBUTING.md`](../CONTRIBUTING.md).

Documentação nova entra nesta pasta **com a linha correspondente aqui**, e toda
mudança de comportamento, fluxo, configuração, mensagem ou dependência atualiza
a documentação na mesma alteração, nunca depois.
