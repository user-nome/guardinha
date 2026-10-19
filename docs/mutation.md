# Testes de mutação

Cobertura de linha responde "esta linha foi executada?". Teste de mutação
responde uma pergunta mais forte: "se esta linha fizesse outra coisa, a suíte
perceberia?". Cada mutante é uma troca pequena e deliberada no código de `src/`
(um `<` vira `<=`, um `&&` vira `||`, uma guarda de `if` some). O mutante é
aplicado, a suíte roda, e o veredito é binário: algum teste quebrou (o mutante
morreu) ou a suíte continua verde (o mutante sobreviveu, e existe um buraco de
teste). O **score** é a porcentagem de mutantes mortos.

Cobertura alta com score baixo é o caso comum de uma suíte que passa por cima da
lógica sem conferir as decisões. Neste repositório os dois números são
complementares: o limiar de 100% de cobertura é o piso, o score de mutação é o
que diz se esse piso significa alguma coisa.

## Como rodar

```bash
npm run test:mutation          # varredura completa
npm run test:mutation:plan     # só monta o plano e imprime, não executa
node tools/mutation/run.ts --help
```

O runner guarda os resultados em `mutation/results.json` e pula o que já foi
medido, então uma varredura interrompida continua de onde parou. Para remedir
um arquivo depois de escrever teste novo:

```bash
node tools/mutation/run.ts --file src/main/vault.ts --fresh
```

`--fresh` descarta só os resultados dos arquivos selecionados, não os da
varredura inteira.

## Escopo

Entra todo arquivo `.ts`/`.tsx` de `src/` que tenha linha alcançada por algum
teste. Ficam de fora, cada um com o motivo em `tools/mutation/scope.ts`:

- `src/types/**`: só `interface`, `type` e união. Com
  `verbatimModuleSyntax` não emitem runtime, então não existe mutante.
- `src/messages/{pt-BR,en,ja,ko,zh-CN}.ts`: traduções são dado, e a paridade
  entre bundles já é garantida por `tests/messages/parity.test.ts`.
- `src/shared/index.ts` e `src/renderer/src/attributions.ts`: barrel puro e
  texto de licença.
- `src/node.loader.ts`: roda só em processo filho, e o v8 não mede cobertura
  entre processos.

Mutante em linha que nenhum teste alcança também fica fora do denominador, e
aparece separado no relatório: esse é buraco de **cobertura**, não de teste, e
misturar os dois só faria o número cair sem dizer onde está o problema.

## Operadores

Doze operadores, escolhidos por mudarem uma decisão observável do código.
Mutante que só atrapalha leitura, ou que o TypeScript já rejeitaria, é ruído e
não entra.

| Operador            | Troca                                                 |
| ------------------- | ----------------------------------------------------- |
| `arithmetic`        | `+` ↔ `-`, `*` ↔ `/`                                  |
| `boundary`          | `<` ↔ `<=`, `>` ↔ `>=`                                |
| `equality`          | `===` ↔ `!==`                                         |
| `logical`           | `&&` ↔ `\|\|`                                         |
| `negation`          | `!x` → `x`, `-x` → `x`, `+x` → `x`                    |
| `boolean`           | `true` ↔ `false`                                      |
| `ternary-swap`      | `c ? a : b` → `c ? b : a`                             |
| `if-remove`         | `if (t) { corpo }` → `{ corpo }`                      |
| `if-swap`           | `if (t) { a } else { b }` → `if (t) { b } else { a }` |
| `numeric`           | inteiro de 0 a 1024 → `n + 1`                         |
| `string-empty`      | `'hex'` → `''`                                        |
| `optional-chaining` | `a?.b` → `a.b`                                        |

O operador `string-empty` não mexe em elemento de tabela com cinco ou mais
entradas (`LEVELS`, `COMMON_WORDS`, `OTP_ALGORITHMS`): mutar uma entrada mede se
a suíte confere item por item o conjunto que o código carrega, e não se o código
que consome o conjunto funciona.

Nem mexe em atributo de JSX de apresentação (`className`, `type`,
`autoComplete`, `inputMode`, `size`, `role`) nem em literal aninhado dentro do
valor de um desses atributos, por mais fundo que esteja (`cond ? 'a' : 'b'`,
template). A tabela de constantes entra junto quando o atributo a referencia
(`className={TRIGGER_CLASS[size]}`): o literal não está dentro do atributo, mas
a tabela só existe para alimentá-lo, e sem resolver a referência cada entrada
dela viraria sobrevivente. Uma lista de classes do Tailwind é folha de estilo,
não decisão: matar esse mutante exigiria que a suíte conferisse o texto da
classe, que é testar o CSS e medir o componente por uma coisa que ele não
decide.

O operador `numeric` também pula número em posição de tipo
(`Parameters<typeof f>[0]`), que some na compilação como o literal de tipo que o
`string-empty` já pula.

## Como a varredura fica barata

Uma execução da suíte inteira custa 84 s. Multiplicada por 2.557 mutantes, a
varredura seria de dias. O que reduz isso:

- **Seleção por linha.** Uma matriz arquivo de teste → linhas de `src/`
  (`tools/mutation/matrix.ts`) diz quais testes passam pela linha mutada. Sem
  ela a seleção é por arquivo inteiro e `src/main/auth.ts` puxa 16 arquivos de
  teste; com ela a média cai de 15 para 7. A matriz é montada com uma execução
  da suíte por arquivo de teste (cerca de 5 min) e fica em cache, invalidada
  por uma impressão digital de `src/` e `tests/`.
- **Barreiras nos barrels.** O grafo de módulos (`tools/mutation/graph.ts`)
  segue o nome importado até o arquivo que define a função. Quase todo mundo
  importa de `@zero/shared`, então um grafo que para no barrel diria que
  `base32.ts` é alcançado pelos 45 arquivos de teste.
- **`--bail=1` e ordem.** A execução para no primeiro teste que falha, e os
  testes saem na ordem do mais barato para o mais caro. O mutante morre no
  primeiro ou no segundo teste, não no último.
- **Doppelgänger do Argon2id.** A suíte de cofre deriva chaves com os perfis de
  produção (128 MiB e 256 MiB), e `unlock.test.ts`, `panic.test.ts` e
  `vault.test.ts` passam de dois minutos cada. Na config de mutação
  (`vitest.mutation.config.mts`), `hash-wasm` aponta para
  `tools/mutation/hash-wasm-stub.ts`, que troca a derivação por uma cadeia de
  HMAC: continua determinística e sensível à senha, ao salt e aos parâmetros, que
  é tudo que `tests/main/crypto.test.ts` verifica, e some em microssegundos. O
  stub só existe na varredura; o `npm test` continua usando o Argon2id de
  verdade, e nenhum teste compara a saída com um vetor do Argon2id.
- **O doppelgänger não pode ser mais permissivo que a biblioteca.** O `hash-wasm`
  de verdade lança `Insupported output type` para qualquer `outputType` fora de
  `hex`, `binary` e `encoded`, e o stub faz o mesmo. Sem essa fidelidade, o
  `outputType: 'hex'` de `deriveKey` sobrevivia à varredura inteiro: o mutante
  trocado por `''` não mudava nada no doppelgänger, e a suíte via verde com um
  `crypto.ts` que a biblioteca real rejeitaria. É o mesmo princípio do teste
  de baseline, aplicado à fronteira de um módulo: um substituto mais tolerante
  esconde o mutante.
- **O `optional-chaining` só mexe no `?.` de verdade.** Em `a?.b.c` o Babel
  aninha um segundo `OptionalMemberExpression` para o `.c`, com `optional:
false`. Sem a checagem, esse nó gerava um mutante que troca `.` por `.`, que é
  o mesmo texto: um sobrevivente que não é buraco de teste, é ruído.

## Garantias

Duas, e as duas importam:

- **Baseline verde.** Antes de medir qualquer coisa, o runner roda a suíte sem
  mutante e aborta se ela ficar vermelha. Com o doppelgänger no lugar, um teste
  que passasse com a derivação real e falhasse com a de mentira não pode
  contaminar o placar. Use `--skip-baseline` só para depurar.
- **Cobertura da linha de base nova.** O passo zero do runner é `vitest run
--coverage`. Medir contra um `coverage/coverage-final.json` velho é medir
  errado, porque a linha pode ter saído do alcance de qualquer teste. Use
  `--skip-coverage` para reaproveitar o arquivo existente.
- **O mutante precisa entrar na execução.** Um veredito só significa alguma coisa
  se o texto mutado tiver rodado. O `fsModuleCache` do Vitest (ligado por
  padrão) quebrava essa garantia: ele guarda o módulo transformado em
  `node_modules/.vitest-cache`, indexado pelo id do arquivo, e essa chave não
  conhece o mutante injetado pelo plugin. O cache do mutante anterior era
  revalidado como válido, o mutante atual não entrava, a suíte passava rodando
  contra o texto errado e o veredito saía `survived`. Como só o primeiro mutante
  de cada arquivo era medido de verdade, o score caía sozinho conforme a
  varredura avançava: `src/main/unlock.ts` marcava 18% e, com o cache desligado,
  78%, sem nenhuma alteração no código sob teste. Por isso
  `fsModuleCache: false` está em `tools/mutation/vitest-options.ts` (e na flag
  do runner), e `tests/tools/mutation-runner.test.ts` trava a garantia.

## No CI

A varredura roda no `quality.yml`, no job **Testes de mutação**, em outro ritmo
do resto do workflow:

| Quando dispara               | Por quê                                   |
| ---------------------------- | ----------------------------------------- |
| push na `developer`          | a `developer` é onde o código se move     |
| dia 1 de cada mês, 04:17 UTC | rede de segurança quando ninguém fez push |
| disparo manual               | remediar um arquivo sem esperar o mês     |

Ela **não** roda em pull request nem em push para a `main`. A varredura leva
horas e o número que ela mede só muda quando alguém escreve teste novo; a única
coisa que ela faz por um PR é mudar de verde para vermelho sem dizer nada sobre o
PR. Reprova abaixo de **65%**, com o número medido hoje em 69,4%.

| Input           | Efeito                                                      |
| --------------- | ----------------------------------------------------------- |
| `min_score`     | piso de reprovação (padrão `65`, o que o job usa sem input) |
| `mutation_file` | mede só esses arquivos de `src/`, separados por vírgula     |

O gating é um `if:` no **job**, não no `on:` do workflow, porque "Verificar
qualidade" e "Testes e cobertura" continuam no ritmo normal de push e PR. Job
pulado aparece como _Skipped_ na aba de checks, que é o esperado aqui.

A folga entre o piso e o número medido é de propósito. O score depende da
máquina: mutante que estoura os 240 s vira `timeout` e sai do denominador, e o
runner do CI tem menos núcleo que a máquina onde a varredura foi escrita. Um
piso colado no número medido daria build vermelho por causa do runner, não do
código.

O job **não é status check obrigatório** (as regras de proteção exigem só
"Verificar qualidade" e "Testes e cobertura"). Ele informa e reprova sozinho,
mas não segura o merge: prender todo PR a uma varredura de horas, para punir uma
queda de duas décimas, não serve para ninguém.

Ele também tem **grupo de concorrência próprio** (`mutacao-...`), separado do
`qualidade-...` do workflow. No grupo do workflow, todo push cancela a execução
anterior, o que mataria uma varredura de horas no meio sem ninguém ter tocado em
nada.

## Arquivos

| Arquivo                            | O que é                                                         |
| ---------------------------------- | --------------------------------------------------------------- |
| `tools/mutation/run.ts`            | Runner: plano, paralelismo, veredito e relatório.               |
| `tools/mutation/vitest-options.ts` | Opções de Vitest da varredura, com o `fsModuleCache` desligado. |
| `tools/mutation/operators.ts`      | Os doze operadores, em cima da AST do Babel.                    |
| `tools/mutation/mutants.ts`        | Enumeração estável e aplicação por splicing de texto.           |
| `tools/mutation/ast.ts`            | Parser e percurso com pai, que é o que separa dado de valor.    |
| `tools/mutation/graph.ts`          | Grafo de módulos sensível a nomes, para escolher testes.        |
| `tools/mutation/matrix.ts`         | Matriz de linhas por arquivo de teste, com cache.               |
| `tools/mutation/coverage.ts`       | Leitura do relatório do v8 e filtro de linha alcançada.         |
| `tools/mutation/plugin.ts`         | Plugin do Vite que injeta o mutante no módulo alvo.             |
| `tools/mutation/scope.ts`          | O que entra e o que sai, com o motivo de cada exclusão.         |
| `tools/mutation/types.ts`          | O veredito do mutante e o formato do resultado gravado.         |
| `tools/mutation/hash-wasm-stub.ts` | Doppelgänger barato do Argon2id para a varredura.               |
| `vitest.mutation.config.mts`       | Config de Vitest da varredura.                                  |

Artefatos em `mutation/` (fora do git): `results.json` com o veredito de cada
mutante, `matrix.json` com a matriz de linhas, `cov/` com os relatórios
individuais e `report.md` com o resumo e a lista de sobreviventes.

## Limites conhecidos

- Mutante que não compila é contado como `compileError` e fica fora do score.
  São raros, porque a troca é só de texto.
- Mutante que estoura o tempo (240 s por padrão) fica `timeout`, também fora do
  score. Vale subir com `--timeout` antes de culpar a suíte.
- O operador `optional-chaining` gera mutante que estoura em `TypeError` quando
  o valor realmente é nulo. A suíte mata, e a mutação está certa, mas é um sinal
  mais fraco que os outros.
- O grafo de módulos é estático e segue `import()` só quando o especificador é
  literal (montado em tempo de execução, não há caminho estático). Cuidado com
  esse trecho: ele já esteve quebrado sem dar erro. `tests/main/preload.test.ts`
  alcança o preload por `await import('@zero/preload/index')`, e quando o Babel 8
  passou a emitir `ImportExpression` no lugar de `CallExpression` com `callee` do
  tipo `Import`, `src/preload/index.ts` saiu do grafo inteiro e deixou de ser
  medido, e a varredura seguiu como se estivesse tudo bem. Um motor que compara
  **nome de nó** falha em silêncio quando o nome muda, então
  `tests/tools/mutation-runner.test.ts` fixa os nomes de que o motor depende.

## Números da varredura

Medidos em `src/` inteiro depois da correção do `fsModuleCache` (ver a garantia
em "O mutante precisa entrar na execução"): 2.557 mutantes em 820 testes. No
denominador ficaram 2.320: 1.609 mortos e 711 sobreviventes. Ficaram fora 143
`timeout` e 94 `compileError`, que não são veredito da suíte.

| Área                    | Score | Mortos | Sobreviv. | Observação                                    |
| ----------------------- | ----- | ------ | --------- | --------------------------------------------- |
| `src/messages/index.ts` | 100%  | 1      | 0         | o registro de idiomas                         |
| `src/preload/index.ts`  | 96,3% | 26     | 1         | a ponte da interface; o resto é equivalente   |
| `src/main/*`            | 89,6% | 941    | 109       | o núcleo de segurança                         |
| `src/shared/*`          | 69,8% | 217    | 94        | `otpauth` 86%, `strength` 56%                 |
| `src/renderer/*`        | 45,5% | 424    | 507       | a tela é verificada por fluxo, não por estado |

**69,4%** no geral depois da primeira leva de testes novos (era 67,8% na leitura
bruta). O que rendeu: `src/main/shred.ts` foi de 43% para 95%, e `clipboard.ts`,
`activity.ts` e `format.ts` chegaram a 100%. `src/preload/index.ts` voltou a ser
medido depois do conserto do grafo, e os 27 mutantes dele entram neste total. O padrão que matou mais foi contar
coisas em vez de só conferir o resultado: o número de passadas da sobrescrita, o
tamanho e a posição de cada escrita, e se `clearTimeout` foi chamado com um
temporizador de verdade. O que sobrou em `shred.ts` são mutantes equivalentes de
verdade: o `&&` do laço de diretório não muda o resultado porque o `rmdir` falha
de qualquer jeito quando sobrou arquivo.

O quadro é desigual de propósito, e vale ler assim: o `src/main/*` é a parte em
que a mutação carrega argumento, e o `src/renderer/*` é a parte em que ela
confirma o que já se sabia, que tela se prova por fluxo e não por estado. O
`src/shared/strength.ts` fica no meio porque muito sobrevivente dele é constante
de tabela: a suíte fixa o comportamento e não cada palavra da tabela.

Por operador, os melhores são `ternary-swap` (100%, mas com um único mutante),
`negation` (95%), `equality` (94%) e `if-remove` (89%): os quatro medem decisão,
que é o que a suíte costuma fixar. Os piores são `string-empty` (44%), que mede
se a suíte trava cada constante do código, `boundary` (59%), `numeric` (64%) e
`optional-chaining` (53%). Os três primeiros têm a mesma origem, que é a mesma do
primeiro: buracos de verdade, mas de baixo risco quando o valor só muda de 3
para 4; a exceção é quando a constante é de segurança, e aí o teste tem que fixar
o número (foi o que passou nos perfis de Argon2id, no período ocioso e no número
de passadas do shred).

**Ler esse número antes do anterior importa:** a varredura anterior media o
mutante errado a partir do segundo mutante de cada arquivo, então os placares
antigos estavam subindo sozinhos conforme a varredura avançava. Os números de
`src/main/unlock.ts` exemplifiesem: 18% na leitura errada, 78% agora, sem nenhuma
mudança no código sob teste.

## O que a varredura encontrou

Lista do que os testes novos fecharam depois da primeira passada, porque são os
achados que valem registro:

- `erasure-state.ts` marca o Cryptographic Erase com um `destroyed = true` que
  nenhum teste lia. Um `false` ali deixaria o `writeVaultContainer` recriando o
  `vault.zkv` pela metade depois da destruição.
- `container.ts` devolvia `{ ok: false }` para buffer truncado sem nenhum teste
  de truncamento; um `{ ok: true }` ali abriria um cofre pela metade.
- `facade.ts` confere a forma do registro campo a campo com `||`, e o teste
  antigo só quebrava o `title`. Com o `&&` no primeiro operando, o registro
  continuava passando.
- Os perfis de Argon2id eram comparados com eles mesmos, então baixar o custo do
  PIN de 256 MiB para 128 MiB passava a suíte inteira.
- `crypto.ts` derivava entrada e token de 2FA com rótulos de domínio cuja
  colisão ninguém checava: dois registros com a mesma senha e o mesmo salt, em
  domínios diferentes, podiam sair com a mesma chave.
- `authenticator.ts` aceitava emissor e conta vazios juntos por causa de um
  `&&` que virava `||`, e aceitatea segredo um byte abaixo do mínimo.
- `structure.ts` criava as pastas com 0700 sem teste que conferisse o modo, e
  `settings.ts` gravava `settings.json` com 0600 pelo mesmo motivo.
- `entries.ts` ordenava a lista por `b.updatedAt - a.updatedAt`, e a suíte só
  conferia que as ids estavam na lista, nunca a ordem.
- `shred.ts` sobrescrevia com 3 passadas sem teste que conferisse o número.

### A segunda leva: `crypto.ts` e `unlock.ts`

Depois de mover a política de credencial para `@zero/shared`, `src/main/crypto.ts`
subiu de 83,9% para 91% e `src/main/unlock.ts` de 77,8% para 92,6%. O que a
varredura pegou:

- **O `fill(0)` da chave derivada não tinha teste nenhum.** Em `crypto.ts` e em
  `unlock.ts`, um `fill(1)` é mutante que sobrevivia porque a suíte só conferia
  o resultado da chamada, e o resultado é idêntico com a chave zerada ou com a
  chave `0x01` no lugar. Agora o Buffer é capturado por referência no
  `createCipheriv` e conferido depois do retorno.
- **Os rótulos de domínio do HKDF eram testados, mas não o valor.** O teste
  antigo fixava que entrada e token de 2FA não dividem chave, e isso continua
  valendo com um dos rótulos vazio, porque os dois lados ainda divergem. O que
  se perdia era o contrato com o disco: trocar o rótulo invalida todo `.zke` e
  todo `.zka` que o usuário já tinha. O teste novo refaz o HKDF à mão, com o
  rótulo escrito por extenso.
- **O validador de formato do PIN não provava que a derivação não rodava.** O
  teste existia, mas media só a resposta, e a resposta é a mesma com o validador
  removido, só que um Argon2id mais caro. E medir o tempo não fecha o buraco,
  porque o doppelgänger da varredura deriva em microssegundos. O que separa as
  duas coisas é a chamada que não aconteceu: agora o teste afirma que `derive`
  não foi invocado para um PIN malformado.

Ficou um sobrevivente em `unlock.ts` que é **equivalente de verdade**, no mesmo
sentido dos de `shred.ts`: o `||` do manipulador de integridade virando `&&` não
muda nada porque o manipulador de KDF, que vem antes na cadeia, garante que os
dois operandos existem quando ele roda. É defesa inalcançável, não buraco.

A leitura anterior registrava um segundo equivalente ali, o `if (remaining <= 0)`
relaxado para `<= 1`. Não é: com `remaining === 1` (um milissegundo de trava
restante) a versão relaxada deixaria a cadeia seguir, e o teste que exercita esse
único milissegundo mata a troca. Era buraco, não equivalência, e o mesmo vale para
a trava de `resetPin` em `vault.ts`, que tinha a mesma forma.

O padrão é sempre o mesmo: o teste antigo cobria o caminho feliz e o código tem
ramas de borda que ninguém exercita. É o que a mutação enxerga e a cobertura de
linha, sozinha, não.

### A terceira leva: os sobreviventes da varredura anterior

A varredura de 69,4% deixou 183 mutantes vivos. Reler cada um mostrou que o número
não era todo buraco de teste:

- **103 ainda eram gerados** pelo motor atual. Medidos um a um pelo id do mutante,
  **85 morreram** com testes novos e **16 são equivalentes** (a tabela abaixo).
  Nenhum desses testes foi escrito para "matar mutante": cada um fixa uma decisão
  que a suíte não conferia.
- **80 não existem mais**: a maioria era literal de apresentação que o escopo
  passou a excluir (classe do Tailwind, metadado de formulário e a tabela de
  constantes que os alimenta), e o resto já tinha morrido na correção do
  `fsModuleCache`.

Esse passo não recalcula o score global: mede por id, para não pagar a varredura
inteira de horas a cada arquivo de teste novo.

Os 16 equivalentes, e por que a suíte não os separa:

| Mutante                                              | Por que é equivalente                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `container.ts` `'ascii'` → `''`                      | `Buffer.from` sem `encoding` usa `utf8`, e `ZKVAULT1` dá os mesmos bytes nos dois                      |
| `crypto.ts` `'utf8'`/`'hex'`                         | `update` sem input encoding e `final` sem output encoding caem no mesmo par de sempre (`utf8` → `hex`) |
| `generator.ts` `?? 0` → `?? 1`                       | `i % length` nunca sai do intervalo do digest, então o fallback é inalcançável                         |
| `unlock.ts` `\|\|` → `&&`                            | o manipulador de KDF, anterior na cadeia, garante os dois operandos definidos                          |
| `Authenticator.tsx` `period > 0` → `period > 1`      | `period` é 0 ou dezenas de segundos; nenhum período cai em `1`                                         |
| `Authenticator.tsx` `if (shown !== undefined)`       | o botão de copiar já está `disabled` quando `shown` é indefinido                                       |
| `Credits.tsx` sufixo `'a'`/`'b'` → `''`              | o sufixo só entra na `key` de cada metade, e as duas metades são listas separadas                      |
| `DestroyModal.tsx` `!matches \|\| busy` → `&&`       | o botão de destruir já está `disabled` quando `!matches`                                               |
| `SelectField.tsx` `useState(0)` → `useState(1)`      | o efeito de abertura reescreve o índice antes de qualquer tecla                                        |
| `SelectField.tsx` `triggerRef.current?.focus()` (2×) | a referência é de um botão sempre montado nas duas chamadas                                            |
| `Settings.tsx` `?? 0` → `?? 1`                       | `nukeLimit` é `number` e esse ramo só roda com ele definido; o fallback não dispara                    |

O que os testes novos fecharam, por área:

- `structure.ts`: as pastas nascem com o modo fixado na chamada que as cria (o
  `chmod` logo depois escondia um `0701` na janela entre os dois).
- `generator.ts`: os 32 bytes de entropia do sistema e a guarda `length <= 0`, que
  evita acionar o sorteio para um pedido vazio.
- `shred.ts`: a agregação do laço de sobrescrita, com o `rmdir` neutralizado para
  que o valor devolvido meça o `&&` e não o erro do diretório não vazio.
- `vault.ts`: o reembrulho do método só acontece com o custo defasado, a trava de
  `resetPin` vale no último milissegundo e a frase de recuperação curta é recusada
  **antes** do Argon2id.
- `entrypoint.test.ts`: `window-all-closed` encerra o app fora do macOS e preserva
  o processo no macOS.
- No renderer: o estado de ocupado de cada botão perigoso (PIN de coação, limite,
  destruição, salvar credencial), o limiar de 5 s do código 2FA, a fração da barra
  de progresso, a recarga que falha no `Home` e a lista que encolhe com o menu
  aberto no `SelectField`.

O limiar de 5 s do `Authenticator` é o único caso em que o teste olha a classe:
não há `aria` nem texto que carregue a decisão `seconds <= 5`, então a classe é o
que a tela realmente decide. Não é testar a folha de estilo, é observar a única
saída da decisão.
