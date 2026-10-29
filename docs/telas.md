# Telas e componentes

O estado fica no topo (`App.tsx`) e as telas são controladas: o app escolhe uma
da Sidebar ou mostra o `AuthModal` quando não há cofre ou ele está bloqueado.
Todo texto vem do contexto de idioma (`useMessages()`), nunca embutido no JSX.

## Componentes (`src/renderer/src/`)

| Componente          | Papel                                                                   |
| ------------------- | ----------------------------------------------------------------------- |
| `App.tsx`           | Carrega idioma e status, decide entre `AuthModal` ou as abas            |
| `Page`              | Coluna de conteúdo das abas: largura por tela, cabeçalho e respiro      |
| `Sidebar`           | Navegação, seletor de idioma, bloqueio, autodestruição e status "local" |
| `LanguageSelect`    | Troca o idioma e persiste em `settings.json`                            |
| `Home`              | Lista de credenciais com busca e ações                                  |
| `EntryModal`        | Criar/editar credencial, com excluir quando é edição                    |
| `AuthModal`         | Criação do cofre, desbloqueio e redefinição de PIN                      |
| `MigrationModal`    | Aviso de atualização: pede as credenciais e migra o cofre de uma vez    |
| `Generator`         | Senha aleatória com comprimento, gostos e entropia pessoal              |
| `Authenticator`     | Códigos de 2FA dos tokens, com contagem e cópia                         |
| `AuthTokenModal`    | Criar/editar token pelo endereço `otpauth://` ou pela chave Base32      |
| `SensitivitySlider` | Slider acessível do comprimento no Gerador (arraste, teclado, `aria`)   |
| `StrengthMeter`     | Barra de força com nível, motivos e dica                                |
| `Credits`           | Pós-créditos de cinema com as dependências em rolagem                   |
| `Settings`          | PIN de pânico e autodestruição por tentativas da senha mestra           |
| `Backup`            | Salva e restaura o cofre inteiro cifrado no pendrive (pacote `.gbk`)    |
| `DestroyModal`      | Confirmação em duas etapas da autodestruição (digitar a palavra)        |
| `Toast`             | Aviso curto de cópia e de sucesso                                       |
| `i18n.tsx`          | `MessagesProvider`, `useMessages()`, `useLanguage()`, `richText()`      |
| `card-grid.ts`      | Colunas das grades de cartão, pela largura da janela                    |
| `clipboard.ts`      | Encerra a cópia no canal `clipboard:copy` (limpeza no main)             |
| `formatters.ts`     | Contagem de palavras, contagem regressiva e erro legível                |

## Abas da Sidebar

| Aba               | Componente      | Conteúdo                                                    |
| ----------------- | --------------- | ----------------------------------------------------------- |
| Início (Senhas)   | `Home`          | Busca, contagem, lista e botão de nova credencial           |
| Gerador de Senhas | `Generator`     | Slider de comprimento, quatro categorias e entropia pessoal |
| Verificador 2FA   | `Authenticator` | Lista de tokens com código, contagem e cópia                |
| Backup            | `Backup`        | Salva o cofre cifrado no pendrive e restaura de um `.gbk`   |
| Atribuições       | `Credits`       | Créditos em rolagem, com pausa no hover                     |
| Configurações     | `Settings`      | PIN de pânico e autodestruição por tentativas               |

O rodapé da Sidebar mostra que os dados estão locais. O botão de bloqueio chama
`vault.lock()` e volta para a aba Início.

Logo abaixo do bloqueio fica o botão de **autodestruição**. Ele não apaga nada
sozinho: abre o `DestroyModal`, que exige digitar a palavra `DESTRUIR`
(`DESTROY` em inglês) antes de liberar o botão de ação. Destruir o cofre é
irreversível e o botão mora a um clique do bloqueio, então a confirmação em duas
etapas é o que separa um toque acidental de uma decisão. Depois do clique, o
app volta para a tela de criação de cofre, como se aquele cofre nunca tivesse
existido, e mostra um aviso de "cofre destruído" (não um erro, porque não foi
erro).

## Responsividade

A janela é redimensionável (de 400 px a tela cheia), então nenhuma tela pode
supor uma largura fixa. O desenho tem três partes, cada uma atacando um dos
dois defeitos que a tela larga e a tela pequena provocam: conteúdo grudado no
canto e cartão espremido.

**A coluna de conteúdo (`Page`).** Toda aba que não é `Credits` abre com o
`Page`, que centraliza a coluna, dá a ela uma largura máxima por tipo de tela e
põe o respiro (`px-4` a `px-8`, `py-5` a `py-8`). Numa tela larga o conteúdo
para de crescer e fica no meio; numa tela estreita o respiro encolhe para a
coluna útil continuar aparecendo.

| Largura do `Page`      | Telas                                             |
| ---------------------- | ------------------------------------------------- |
| `narrow` (`max-w-2xl`) | Gerador, Configurações: formulários de uma coluna |
| `medium` (`max-w-4xl`) | Backup                                            |
| `wide` (`max-w-6xl`)   | Início, Verificador 2FA: grades de cartões        |

**A barra lateral em duas formas.** Acima de `lg` a Sidebar é a coluna de 256 px
com rótulos; abaixo disso vira um trilho de ícones de 112 px, porque 256 px
fixos deixariam a área de conteúdo espremida na janela mínima. Os rótulos somem
do desenho, nunca da árvore de acessibilidade: cada botão mantém `aria-label` e
`title`, e a aba ativa ganha `aria-current`. O seletor de idioma acompanha: com
`compact` o gatilho mostra o código (`pt-BR`) no trilho e o nome completo na
barra larga e no menu, e a `Sidebar` rolável evita corte em janela baixa.

**Os cartões contam a largura da janela.** As grades de Início e do Verificador
2FA seguem os pontos de virada do Tailwind (`md` em 768 px, `xl` em 1280 px e
`2xl` em 1536 px), e a regra está em um lugar só (`src/renderer/src/card-grid.ts`)
porque os dois cartões não são iguais: o cartão de credencial aceita a terceira
coluna em 1280 px, e o de token só em 1536 px, já que o código de 6 dígitos, a
contagem e o botão de cópia dividem a mesma linha.

| Largura da janela | Credencial (Início) | Token (Verificador 2FA) |
| ----------------- | ------------------- | ----------------------- |
| até 767 px        | uma coluna          | uma coluna              |
| 768 a 1279 px     | duas colunas        | duas colunas            |
| 1280 a 1535 px    | três colunas        | duas colunas            |
| 1536 px ou mais   | três colunas        | três colunas            |

A janela mais estreita possível é 400 px (`minWidth` em `src/main/index.ts`):
nessa largura a grade já é uma coluna e a Sidebar já é o trilho de ícones, então
qualquer estreitamento a mais só corta texto. Acima de 1536 px o número de
colunas não muda mais, e a coluna de conteúdo (`max-w-6xl`) é quem impede os
cartões de esticarem sem parar.

Os modais seguem a mesma regra de altura: o cartão é `my-auto` dentro de uma
caixa que rola, então ele fica centralizado quando cabe e encostado no topo,
rolável, quando não cabe numa janela baixa.

## Tela de Configurações

Duas seções, ambas exigindo cofre desbloqueado (o main exige a chave para
gravar no container):

- **PIN de pânico**: define ou remove um PIN de 8 dígitos que abre um cofre
  vazio e apaga o de verdade. O botão só habilita com 8 dígitos, e o main
  recusa PIN previsível e o próprio PIN do cofre.
- **Autodestruição por tentativas**: liga ou desliga o limite de falhas da
  senha mestra. O padrão é desligado, e o piso é 50. Ativar mostra um texto de
  aviso antes do campo de confirmação, porque a frase de recuperação não salva
  nessa situação.

## Tela de Backup

Salva e restaura o cofre inteiro cifrado no pendrive, pelo canal
`window.api.backup` (`docs/backup.md`). A tela não exige senha nenhuma: o pacote
`.gbk` é cópia de bytes já cifrados.

- **Salvar backup em um pendrive**: o main empacota o `vault.zkv`, os `.zke` e os
  `.zka` e abre o diálogo nativo para escolher o destino.
- **Restaurar de um backup**: pede confirmação, porque substitui o cofre atual.
  O arquivo vem do diálogo nativo e o main valida o pacote antes de encostar no
  disco.

A restauração é o caminho de quem formatou a máquina: o botão **Restaurar de um
backup** também aparece na tela de criação do cofre, para não obrigar a criar um
cofre vazio só para depois trocá-lo.

## Fluxo de criação do cofre

Quando `status.exists` é falso, o `AuthModal` abre em modo de criação, em dois
passos:

1. **Credenciais**: senha mestra (24 caracteres), confirmação e PIN (8 dígitos),
   cada campo com medidor de força. A tela valida comprimento, confirmação e
   recusa credencial previsível antes de seguir.
2. **Frase de recuperação**: frase e confirmação, com contagem de palavras
   (mínimo de 12) e medidor. A frase é normalizada em minúsculas com espaços
   simples para a comparação.

Ao concluir, o cofre é criado já desbloqueado e o app entra na Home.

## Fluxo de desbloqueio

- **Aba PIN** (padrão): um campo numérico; o contador de trava aparece com
  contagem regressiva de segundo em segundo quando o cofre está em espera.
- **Aba senha mestra**: só aparece após **3 falhas** de PIN, com aviso âmbar.
  Se as falhas zerarem, a aba some sozinha.
- **Esqueci o PIN**: modo de redefinição, com a frase de recuperação, o PIN novo
  e a confirmação; é o único lugar onde a frase é usada.

## Aviso de migração

Depois de um desbloqueio, o App consulta `vault.migrationStatus()`. Se o cofre
está num formato anterior, o `MigrationModal` abre por cima da Home e mostra a
versão de origem, a de destino e a contagem do que será reescrito. Ele pede a
senha mestra, o PIN e a frase de recuperação que existirem no container, sem
medidor de força: aqui a credencial é prova de posse, não uma escolha nova. O
botão de ação fica desabilitado até todos os campos estarem preenchidos.

**Depois** fecha o aviso e deixa o cofre no formato antigo, ainda funcional; o
aviso volta no próximo login. Credencial recusada mostra a mensagem daquele
método sem dizer qual dos outros está certa, e nada é gravado. No sucesso, o
App atualiza o status, fecha o modal e mostra o toast de migração concluída. O
PIN de coação não aparece no formulário.

## Home

- Busca instantânea por título, usuário ou domínio, com contagem de itens.
- Cada linha traz editar, copiar usuário, copiar senha e abrir o site no
  navegador do sistema (canal `shell:open-domain`, só `http`/`https`).
- Estados vazios distintos: sem credenciais, e sem resultado para a busca.
- Erro de adulteração vindo do main aparece no lugar da lista (fail-closed).

## EntryModal

Formulário com título, usuário, senha (com olho para mostrar e ocultar),
domínio e observações. A senha carrega o medidor de força informativo. Em modo
de edição aparece o botão de excluir, que pede confirmação dentro do próprio
modal.

## Generator

Slider de comprimento (0 a 72, padrão 24), chaves de maiúsculas, minúsculas,
números e símbolos e cinco campos de entropia pessoal. A senha sai só com as
categorias marcadas, e a última chave ligada não desliga. O botão gera no main,
mostra a senha com medidor e copia com limpeza em 30 s.

## Authenticator

Cada token vira um cartão com serviço, conta, o código em monoespaçado e uma
barra que esvazia ao longo do período. O código é sempre o que o main calculou:
o renderer nunca tem o segredo, e quando o período vira ele pede o próximo em
vez de recalcular (`authenticator:codes`). A contagem é um tique de 1 s.

O botão de adicionar abre o `AuthTokenModal`, que aceita duas entradas para o
mesmo segredo: o endereço `otpauth://` que o serviço mostra quando o usuário
escolhe "não posso escanear agora", com prévia do que ele resolve antes de
salvar; ou a chave Base32 digitada à mão, com emissor, conta, algoritmo,
dígitos e período. Editar abre direto na segunda aba, com os metadados
preenchidos. O campo do segredo começa vazio, pois a chave nunca é devolvida ao
renderer; para salvar uma edição, é necessário digitá-la novamente.

Excluir pede confirmação dentro da própria tela. Detalhes do formato e do
armazenamento em `docs/autenticador.md`.

## Erros e avisos

Erro de operação vira texto na própria tela do `AuthModal` ou no modal afetado;
sucesso de cópia vira `Toast`. As mensagens chegam localizadas do processo main,
então o idioma escolhido na Sidebar vale também para os erros do cofre.
