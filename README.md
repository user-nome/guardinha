<div align="center">

![Guardinha](docs/assets/banner.png)

**Cofre de credenciais 100% offline para Linux Mint.** Suas senhas ficam
cifradas na sua máquina: sem conta, sem nuvem, sem telemetria.

**Gratuito · Código aberto · MIT** &nbsp;·&nbsp; Electron + React + TypeScript

</div>

---

## Instalação

Baixe o `.deb` da [última versão](https://github.com/chronos-atalante/guardinha/releases/latest)
e instale:

```bash
sudo apt install ./guardinha_<versão>_amd64.deb
```

<b>Ou</b>

```bash
curl -fsSL https://github.com/chronos-atalante/guardinha/releases/latest/download/public.key | sudo gpg --dearmor --yes -o /usr/share/keyrings/guardinha.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/guardinha.gpg] https://github.com/chronos-atalante/guardinha/releases/latest/download ./" | sudo tee /etc/apt/sources.list.d/guardinha.list
sudo apt update && sudo apt install guardinha
```

Na primeira vez o app abre o **diálogo padrão do sistema** para você digitar a
senha de administrador: é o PolicyKit criando a pasta do cofre com as
permissões certas. A senha nunca passa pelo app.

## Recursos

- **Cofre cifrado em disco.** Cada credencial é um arquivo próprio, cifrado com
  AES-256-GCM; a chave do cofre é embrulhada por credencial com Argon2id.
- **Acesso com PIN.** Login só com PIN de 8 dígitos. A senha mestra só é
  oferecida depois de 3 falhas, e a frase de recuperação **não é forma de
  login**: existe para redefinir o PIN esquecido.
- **Medidor de força.** Nota, segmentos e motivos ao vivo nas credenciais do
  cofre, no gerador e nos dados de criação e recuperação; credenciais
  previsíveis são recusadas ao criar o cofre ou redefinir o PIN.
- **Verificador 2FA.** Tokens TOTP (RFC 6238) calculados no próprio aparelho,
  com contagem regressiva e expiração visível.
- **Backup no pendrive.** O cofre inteiro, já cifrado, vira um arquivo `.gbk`
  com manifesto e SHA-256; a restauração devolve tudo, inclusive numa máquina
  recém-formatada, sem nunca decifrar nada para copiar.
- **Gerador de senhas.** Tamanho ajustável, conjunto de caracteres escolhido
  (maiúsculas, minúsculas, números, símbolos) e injeção de palavras pessoais
  para aumentar a entropia.
- **Destruição segura.** PIN de coação que abre um cofre vazio enquanto apaga o
  de verdade, autodestruição por contagem de erros (desligada por padrão) e
  Cryptographic Erase, que torna os dados irrecuperáveis ao apagar a chave.
- **Integridade.** Um manifesto cifrado lista o que existe; arquivo removido ou
  injetado de fora do app faz o acesso falhar fechado.
- **Clipboard com prazo.** Credencial copiada some da área de transferência 30
  segundos depois.
- **Idioma.** Português (Brasil), chinês simplificado, coreano, japonês e
  inglês.

## Como protege

|                    |                                                                      |
| ------------------ | -------------------------------------------------------------------- |
| Derivação da chave | Argon2id, custo por método de desbloqueio (o PIN é o mais caro)      |
| Cifragem           | AES-256-GCM por arquivo, com salt e IV aleatórios de 128 bits        |
| Chave do cofre     | Vive só na memória do processo principal e nunca sai por IPC         |
| Contra força bruta | Trava exponencial persistida em disco e auto-lock por ociosidade     |
| Interface          | `contextIsolation`, `sandbox`, CSP e navegação presa à página do app |
| Arquivos           | Fora de `~/`, pastas ocultas, 0700, com sobrescrita antes de apagar  |

O detalhamento, incluindo as medidas que **não** tomamos, está em
[`SECURITY.md`](SECURITY.md).

## Arquitetura

Três processos com fronteiras claras: `src/main/` cuida do cofre, da
criptografia e do IPC; `src/preload/` é a única ponte (`window.api`); e
`src/renderer/` é a interface React, sem acesso a disco, rede ou Node. Os
contratos ficam em `src/types/` e todos os textos em `src/messages/`.

## Desenvolvimento

| Comando            | O que faz                                                    |
| ------------------ | ------------------------------------------------------------ |
| `npm run dev`      | Sobe o app em desenvolvimento                                |
| `npm run check`    | typecheck + lint + formatação + auditoria OSV + shellcheck   |
| `npm test`         | Suíte Vitest                                                 |
| `npm run test:e2e` | E2E (Playwright) sobre o app compilado e o payload do `.deb` |
| `npm run dist`     | Gera o `.deb` com electron-builder                           |

As demais tarefas e as regras do repositório estão em
[`CONTRIBUTING.md`](CONTRIBUTING.md) e [`AGENTS.md`](AGENTS.md).

## Documentação

[`docs/README.md`](docs/README.md) é o índice do material técnico: visão geral,
arquitetura, cofre, credenciais, telas, contrato da API, i18n, build, testes e
mapa de segurança.

## Licença

MIT. Ver [`LICENSE`](LICENSE) e
[`THIRD-PARTY-NOTICES.txt`](THIRD-PARTY-NOTICES.txt) para os componentes
distribuídos.
