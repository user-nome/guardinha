<div align="center">

![Guardinha](docs/assets/banner.png)

**Gratuito · Código aberto · MIT** &nbsp;·&nbsp; Electron + React + TypeScript

**Um cofre de senhas que funciona 100% no seu computador:** sem conta, sem nuvem,
sem telemetria e sem usar a internet. Suas senhas ficam cifradas no seu disco e
só abrem com o seu PIN.

**Versão atual: 2.2.1 · Linux (amd64)**

[Baixar .deb](https://github.com/user-nome/guardinha/releases/latest/download/guardinha_amd64.deb)

</div>

<b> Esses links são antigos e não funcionam, estou lidando com a hospedagem do novo site primeiro, depois arrumo esse README </b>

---

## O que é o Guardinha

O Guardinha é um aplicativo **feito para Linux** que guarda senhas e vem em um
único arquivo `.deb`, igual a qualquer programa que você instala pelo gerenciador
do sistema. Ele foi feito para quem não quer entregar as senhas de todos os sites
a uma empresa na nuvem.

É um cofre **local**: as senhas são gravadas cifradas dentro do seu próprio disco
e não são enviadas para lugar nenhum. Não existe conta para criar, servidor para
invadir nem assinatura para pagar. Quem tem o aplicativo tem as chaves; quem não
tem, não vê nada.

### Suas senhas, em um lugar só

Um cofre local que guarda o nome do site, o usuário, a senha e as suas anotações.
Nada sai da sua máquina e ninguém, nem nós, vemos o que está dentro.

- **Lista com busca.** A lista mostra seus sites e filtra enquanto você digita,
  pelo nome, pelo usuário ou pelo endereço do site.
- **Copiar com um clique.** Botões para copiar o usuário e a senha. Por segurança,
  o que foi copiado **some da área de transferência 30 segundos depois**, a menos
  que você tenha copiado outra coisa antes disso.
- **Abrir o site direto.** Um botão abre a página da conta no navegador que você já
  usa. O Guardinha **não preenche formulários** e nunca entrega sua senha a nenhum
  site: quem faz o login é o navegador, como sempre foi.

### Senhas fortes, sem complicação

A parte que mais muda a sua segurança está no mesmo aplicativo, sem depender de
navegador, extensão ou serviço online.

- **Gerador de senhas.** Você escolhe o tamanho (até 72 caracteres) e quais tipos
  de caractere entram: maiúsculas, minúsculas, números e símbolos. Dá para somar
  até cinco palavras suas ao sorteio, para uma senha que só você decifra.
- **Medidor de força.** Enquanto você digita, o aplicativo dá uma nota e
  **explica o que está fraco**: sequência, repetição, palavra comum, poucos
  caracteres diferentes ou senha curta. No cofre e no PIN, o óbvio é recusado de
  vez.

### Verificação em duas etapas no mesmo lugar

Os códigos que o site pede depois da senha, calculados dentro do seu próprio
computador: sem internet e sem aplicativo extra.

- **Códigos de uso único.** Para qualquer serviço que peça verificação em duas
  etapas, o aplicativo mostra o número de 6 dígitos e uma barra que esvazia até o
  próximo código. Sem aplicativo autenticador instalado e sem rede.
- **A chave nunca sai do cofre.** Você cola o endereço `otpauth://` (ou a chave) uma
  única vez. O Guardinha guarda esse segredo **cifrado dentro do cofre e nunca mais
  o mostra**: calcula o código e devolve só o número para a tela. Na prática, a
  chave do serviço não aparece em nenhum lugar legível.

### Backup para o pendrive

Para o dia em que o disco troca, o computador é formatado ou some.

- **Um arquivo só.** O aplicativo junta o cofre inteiro em um arquivo `.gbk` que
  você escolhe onde gravar, normalmente um pendrive. As senhas continuam
  **cifradas dentro do arquivo**: quem encontrá-lo precisa do seu PIN para abrir.
- **Restaura em máquina nova.** Formatou o computador ou trocou o disco? Instale o
  Guardinha, clique em **Restaurar de um backup** e o cofre volta como estava,
  inclusive em uma máquina recém-instalada, sem precisar criar um cofre antes.

### Proteção contra quem erra o PIN

O PIN é o ponto mais fraco do cofre, porque são só 8 dígitos. Por isso o
aplicativo torna cada tentativa errada cara e oferece formas de destruí-lo de vez.

- **Acesso com PIN de 8 dígitos.** O uso do dia a dia é só o PIN. A senha mestra de
  24 caracteres só aparece como alternativa **depois de 3 PINs errados**, e a frase
  de recuperação que você escreveu na criação serve apenas para escolher um PIN
  novo. Ela nunca abre o cofre.
- **Espera crescente e bloqueio automático.** Cada tentativa errada aumenta a
  espera (10 s, 30 s, 1 min, 1 h e depois 24 h), e essa espera fica gravada no
  cofre: fechar o aplicativo não zera nada. Além disso, o cofre **trava sozinho
  após 5 minutos sem uso** e a chave some da memória.
- **Destruição de emergência.** Para o pior cenário existem três ferramentas, todas
  irreversíveis: o botão que **destrói o cofre inteiro**, o **PIN de coação** (que
  abre um cofre vazio enquanto apaga o de verdade, para uso sob coação física) e a
  autodestruição por tentativas de senha mestra, que vem desligada e precisa ser
  ativada por você.

## O que o Guardinha não faz

Vale ser claro sobre os limites, porque um cofre de senhas que promete demais
costuma entregar menos do que parece:

- **Não é nuvem.** Nada é enviado para a internet e não existe servidor nosso (nem
  de terceiros) recebendo, guardando ou sincronizando suas senhas.
- **Não gera a sua frase de recuperação.** O aplicativo só conta as palavras. Quem
  escreve é você, e ela precisa ficar guardada fora do computador.
- **Não importa nem exporta senhas** de outros gerenciadores, e não sincroniza nada
  entre computadores.
- **Não faz login por você.** Não há biometria, preenchimento automático de
  formulários nem compartilhamento de cofre entre pessoas.
- **Não pede cadastro, e-mail ou pagamento.** Não há conta para criar e nada para
  assinar: o aplicativo é gratuito, de código aberto e não mostra anúncios.

## Como funciona o acesso

O cofre é criado uma vez só e, depois, é uma tela de PIN. O caminho tem três
partes, e vale conhecê-las antes de começar:

1. **Na criação** você escolhe uma senha mestra de exatamente 24 caracteres, um PIN
   de 8 dígitos e escreve uma frase de recuperação com pelo menos 12 palavras. A
   frase é sua e precisa ficar anotada no papel, longe do computador.
2. **No dia a dia** você abre o cofre com o PIN. Como ele é o elo mais fraco, o
   aplicativo leva alguns segundos para abrir: essa demora é o que torna um ataque
   por tentativa e erro caro.
3. **Se esquecer o PIN**, a frase de recuperação serve para definir um PIN novo. Ela
   não abre o cofre. E se você perder a senha mestra e a frase ao mesmo tempo, o
   cofre não pode ser aberto por ninguém, inclusive por nós, porque não temos cópia
   nenhuma.

## Onde as senhas ficam guardadas

O cofre fica em `/var/lib/.guardinha/.vault/`, ou seja, **fora da sua pasta
pessoal**. Isso é de propósito: ele não é apagado quando você limpa a pasta do
usuário e não entra por acaso nos backups sincronizados da nuvem. A pasta é
protegida pelo sistema e só o seu usuário consegue abrir.

Na primeira vez, o Guardinha pode pedir a senha de administrador pelo **diálogo
padrão do Linux** para criar essa pasta. A senha é digitada no sistema e **nunca
passa pelo aplicativo**. Cada senha e cada código de verificação ficam em um
arquivo cifrado próprio, dentro dessa pasta, com uma chave diferente para cada
arquivo.

O detalhamento de cada medida, incluindo as que **não** tomamos, está no
[`SECURITY.md`](SECURITY.md).

## Instalação

Baixe o `.deb` da [última versão](https://github.com/user-nome/guardinha/releases/latest)
e instale:

```bash
sudo apt install ./guardinha_amd64.deb
```

**Ou, pelo APT**, que é o caminho que recebe as atualizações futuras com um só
`sudo apt upgrade`. Em um sistema Linux compatível com APT, rode uma vez:

```bash
curl -fsSL https://github.com/user-nome/guardinha/releases/latest/download/public.key | sudo gpg --dearmor --yes -o /usr/share/keyrings/guardinha.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/guardinha.gpg] https://github.com/user-nome/guardinha/releases/latest/download ./" | sudo tee /etc/apt/sources.list.d/guardinha.list
sudo apt update && sudo apt install guardinha
```

Se você já configurou o repositório APT antes da troca da chave GPG, repita o
primeiro comando acima para atualizar o keyring e depois execute `sudo apt update`.
A linha do repositório não precisa ser alterada.

O repositório é **flat e vive na própria Release**: os índices assinados e o `.deb`
com nome estável são anexados a cada versão pelo workflow do app, e o endereço
`releases/latest/download/` redireciona sempre para a última; é isso que mantém o
`sudo apt upgrade` funcionando.

Na primeira vez o app abre o **diálogo padrão do sistema** para você digitar a senha
de administrador: é o PolicyKit criando a pasta do cofre com as permissões certas. A
senha nunca passa pelo app.

## Privacidade, em uma tela

O aplicativo não tem rede: o sistema bloqueia o acesso à internet quando o Guardinha
é instalado, então suas senhas ficam cifradas na sua máquina e não existe servidor
de terceiros envolvido. O [site do projeto](https://guardinha-delirante.vercel.app),
por sua vez, é só divulgação: usa métricas agregadas de visita e um cookie que
guarda o seu idioma. Leia a
[Política de Privacidade](https://guardinha-delirante.vercel.app/privacidade) completa
e os [Termos de Uso](https://guardinha-delirante.vercel.app/termos).

## Contato

Dúvidas sobre o aplicativo ou sobre privacidade:
[chronos.biblioteca@proton.me](mailto:chronos.biblioteca@proton.me).

## Sobre as traduções

O app está em português (Brasil), chinês simplificado, coreano, japonês e inglês. O
português é o idioma canônico do app. Se algo estiver estranho, abra uma issue no
repositório do projeto.

Quer ajudar a melhorar a tradução? As mensagens do app moram em `src/messages/`, e
as regras estão em [`docs/messages.md`](docs/messages.md).

---

## Arquitetura

Três processos com fronteiras claras: `src/main/` cuida do cofre, da criptografia e
do IPC; `src/preload/` é a única ponte (`window.api`); e `src/renderer/` é a
interface React, sem acesso a disco, rede ou Node. Os contratos ficam em
`src/types/` e todos os textos em `src/messages/`.

## Como protege

| Medida             | Como o app trata                                                     |
| ------------------ | -------------------------------------------------------------------- |
| Derivação da chave | Argon2id, custo por método de desbloqueio (o PIN é o mais caro)      |
| Cifragem           | AES-256-GCM por arquivo, com salt e IV aleatórios de 128 bits        |
| Chave do cofre     | Vive só na memória do processo principal e nunca sai por IPC         |
| Contra força bruta | Trava exponencial persistida em disco e auto-lock por ociosidade     |
| Interface          | `contextIsolation`, `sandbox`, CSP e navegação presa à página do app |
| Arquivos           | Fora de `~/`, pastas ocultas, 0700, com sobrescrita antes de apagar  |

O mapa de cada medida por arquivo está em
[`docs/seguranca.md`](docs/seguranca.md), e o texto normativo, com os riscos
aceitos e o que está fora de escopo, no [`SECURITY.md`](SECURITY.md).

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
arquitetura, cofre, credenciais, telas, contrato da API, i18n, build, testes e mapa
de segurança.

## Licença

MIT. Ver [`LICENSE`](LICENSE) e
[`THIRD-PARTY-NOTICES.txt`](THIRD-PARTY-NOTICES.txt) para os componentes
distribuídos.
