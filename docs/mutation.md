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

O `if-remove` remove a **condição**, não o corpo: `if (t) { corpo }` vira
`{ corpo }` e `if (t) return;` vira `return;`. O mutante de guarda não "deixa de
proteger" o código, ele faz o corpo rodar sempre. A distinção importa na leitura
de um sobrevivente, porque as duas formas falham de jeitos bem diferentes: sem a
guarda do `if (data === null) return;`, o `initManifest` não estoura nada, ele
simplesmente para de selar o manifesto.

## Como a varredura fica barata

Uma execução da suíte inteira custa 84 s. Multiplicada por 2.403 mutantes, a
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
PR. Reprova abaixo de **65%**, com o número medido hoje em 95,7%.

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
em "O mutante precisa entrar na execução"): 2.403 mutantes em 75 arquivos de
teste. No denominador ficaram 2.335: 2.235 mortos e 100 sobreviventes. Ficaram
fora 20 `timeout` e 48 `compileError`, que não são veredito da suíte.

| Área                    | Score | Mortos | Sobreviv. | Observação                                    |
| ----------------------- | ----- | ------ | --------- | --------------------------------------------- |
| `src/messages/index.ts` | 100%  | 1      | 0         | o registro de idiomas                         |
| `src/preload/index.ts`  | 100%  | 28     | 0         | a ponte da interface                          |
| `src/main/*`            | 96,9% | 1.161  | 37        | o núcleo de segurança                         |
| `src/renderer/*`        | 97,1% | 643    | 19        | a tela é verificada por fluxo, não por estado |
| `src/shared/*`          | 90,1% | 402    | 44        | `otpauth` 96%, `strength` 86%                 |

**95,7%** no geral, contra 92,3% da varredura anterior. O que rendeu foi
sempre a mesma coisa: contar a decisão, não o resultado. O `initManifest` selo
o manifesto, o `otpauth://` sem a barra do rótulo é recusado, a régua de força
corta no oito em ponto e no sete distintos, e o gerador desconta as palavras
pessoais da cota de cada categoria.

O que sobrou (100 sobreviventes) é, na esmagadora maioria, mutante equivalente
de verdade, e a tabela da seção "A quarta leva" lista cada um com o motivo. O
grupo maior é o da régua de força: a nota final é uma escala de 0 a 4, e um
teto ou um alfabeto movido em um bit não atravessa nenhum dos cortes (28, 36,
60 e 80), então o valor bruto dos bits pode mudar sem que a régua mude.

O quadro é desigual de propósito, e vale ler assim: o `src/main/*` é a parte em
que a mutação carrega argumento, e o `src/renderer/*` é a parte em que ela
confirma o que já se sabia, que tela se prova por fluxo e não por estado. O
`src/shared/strength.ts` fica no meio porque muito sobrevivente dele é
equivalente de verdade: a régua expõe o degrau, não os bits.

Por operador, os melhores são `ternary-swap` (100%), `if-swap` (100%),
`boolean` (100%), `equality` (99,2%) e `if-remove` (99,1%): os cinco medem
decisão, que é o que a suíte costuma fixar. Os piores são `boundary` (87,9%),
`numeric` (89,7%) e `string-empty` (96%). O `numeric` é o operador que mais
sobrevive, e a razão é a mesma do `strength.ts`: a maior parte dos números que
ele mexe é teto de_bits ou de caracteres, e mexer neles não muda a saída.

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

### A quarta leva: os sobreviventes de 92,3%

A varredura completa de `src/` (2.403 mutantes, 176 sobreviventes, 92,3%) deixou
uma lista de sobreviventes que valia reler um a um. A leitura mostrou três coisas
ao mesmo tempo:

- **Buracos de verdade**, com a suíte olhando o resultado e não a decisão: o
  `initManifest` podia deixar de selar o manifesto e nada reclamava, o `otpauth://`
  sem a barra do rótulo passava, o bloqueio não voltava para o Início, e o
  manifesto do backup aceitava um `path` que era lista.
- **Equivalentes de verdade**, que a tabela mais abaixo lista com o motivo.
- **Uma leitura errada da ferramenta**, que valeu mais que os dois grupos
  juntos: o operador `if-remove` não remove o corpo do `if`, remove a
  **condição**. `if (t) { corpo }` vira `{ corpo }`, e `if (t) return;` vira
  `return;`. Ou seja, o mutante de guarda não "deixa de proteger", ele deixa o
  corpo rodar sempre. Isso muda a leitura de dois sobreviventes que pareciam
  óbvios: o `if (data === null) return;` do `initManifest` não estourava
  `TypeError` com o cofre ausente, ele só impedia o selo de acontecer, e era
  isso que a suíte não conferia.

O que os testes novos fecharam, por área:

- `storage.ts`: o `initManifest` sela o manifesto de verdade quando o cofre ainda
  não tem linha de base. O teste antigo só conferia que selar sem cofre não
  estourava, o que é a mesma coisa que não selar nada; e o `writeAuthState` sem
  cofre não recria o `vault.zkv`.
- `backup-container.ts`: o manifesto lido do disco é campo a campo, e o `path` em
  lista engana o `test` da expressão regular (o `||` virando `&&` deixaria a
  lista passar). O `size` nulo e o `sha256` em lista continuam recusados, mas por
  outra guarda: o tamanho fracionário cai na conferência do fim do pacote, e o
  `sha256` em lista cai na comparação estrita do digest, que compara string com
  objeto e nunca dá igual.
- `otpauth.ts`: um `otpauth://` sem a barra que separa o tipo do rótulo é
  recusado. Com o corte trocado, o `totpx` passava por `totp` e o token inteiro
  nascia de uma URI que ninguém emitiu.
- `strength.ts`: as bordas da régua. Oito em ponto já é sequência (e trava), seis
  caracteres já são senha de uma categoria só, sete caracteres distintos ainda
  não são variedade baixa, e o dia e o mês de uma data saem das duplas certas.
  Com a régua coberta pelos cortes, o resto vira equivalente: a nota é uma
  escala de 0 a 4, e um teto ou um alfabeto movido em um bit não atravessa
  nenhum corte.
- `generator.ts`: o embaralhamento final troca mesmo os últimos dois caracteres,
  com o `randomInt` fixado para devolver `0` no limite de dois; a cota de uma
  categoria desconta as palavras pessoais, e a própria categoria também; e
  mudar a quantidade de palavras não revoga o consentimento de incluí-las.
- `SensitivitySlider.tsx`: na faixa de uma unidade, o passo é a largura
  inteira. O piso de `Math.max(1, max - min)` existe para a faixa degenerada, e
  um piso maior mudaria o passo de uma faixa de duas posições.
- `AuthModal.tsx`: o ícone do botão de desbloquear troca com o método (a chave
  na senha mestra, o hash no PIN), e a caixa da frase de recuperação do passo de
  redefinição tem as mesmas três linhas das outras.
- `App.tsx`: o bloqueio devolve a tela para o Início, e não para a aba em que o
  usuário estava.

O teste de remoção idempotente em `entries-store.ts` não mata mutante, e o
motivo está na tabela: a guarda de existência é equivalente de verdade, porque o
`shredFile` engole o `ENOENT` e devolve `false`, e o `deleteEntry` não olha o
retorno. O teste fica porque apagar duas vezes a mesma credencial é contrato da
tela, não só detalhe de implementação.

Os equivalentes, e por que a suíte não os separa:

| Mutante                                                                              | Por que é equivalente                                                                                                                                       |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backup-constants.ts`, `backup-container.ts`, `container-format.ts` `'ascii'` → `''` | `Buffer.from` sem `encoding` usa `utf8`, e `ZKBACKUP`, `ZKVAULT1` e `ZENTRY01` são ASCII: os mesmos bytes                                                   |
| `backup-container.ts` `'utf8'` → `''`                                                | `Buffer.from(string)` já é `utf8`                                                                                                                           |
| `backup-container.ts` `createdAt` `\|\|` → `&&`                                      | o JSON não transporta `NaN` nem `Infinity`: o único valor não finito que chega é `null`, que o `typeof` já recusa                                           |
| `backup-container.ts` `size` `\|\|` → `&&`                                           | o tamanho fracionário passa pela guarda, mas a conferência do fim do pacote (`offset !== body.length`) recusa                                               |
| `backup-container.ts` `sha256` `\|\|` → `&&`                                         | o `sha256` em lista cai na comparação estrita do digest, que compara string com objeto e nunca dá igual                                                     |
| `backup-container.ts` `manifestLength === 0` → `=== 1`                               | com o manifesto vazio o `JSON.parse` falha, e o pacote é recusado com o mesmo erro                                                                          |
| `backup-container.ts` `\|\|` → `&&` na borda do manifesto                            | quando o comprimento declarado passa do corpo, o `JSON.parse` ou a conferência dos arquivos recusa com o mesmo erro                                         |
| `container.ts` `'hex'` → `''` no tamanho do blob                                     | o tamanho só dimensiona o buffer; o conteúdo gravado é o mesmo e o buffer é aparado no fim                                                                  |
| `container.ts` `offset + BLOB_SALT_OFFSET` → `offset - BLOB_SALT_OFFSET`             | `BLOB_SALT_OFFSET` é `0`: somar e subtrair dão o mesmo endereço                                                                                             |
| `container.ts` `>` → `>=` na borda do KDF                                            | no limite exato a leitura do blob seguinte recusa o container do mesmo jeito                                                                                |
| `container.ts` guarda do `SALT_BYTES` (`+`→`-` e `>`→`>=`)                           | a guarda é redundante com a checagem do próprio blob, que recusa o container truncado                                                                       |
| `container.ts` `&&` → `\|\|` na escrita dos métodos                                  | a flag só é ligada quando o método existe, então os dois operandos concordam sempre                                                                         |
| `container.ts` `<` → `<=` no cabeçalho                                               | com o cabeçalho inteiro e sem magic, o arquivo é recusado pelo magic                                                                                        |
| `crypto-constants.ts` `KEY_HEX_LENGTH`, `SHA256_BYTES`, `SHA256_HEX_LENGTH`          | constantes sem uso em `src/`: o número não muda nenhuma decisão                                                                                             |
| `crypto.ts` `'utf8'`/`'hex'`                                                         | `update` sem codificação de entrada e `final` sem codificação de saída caem no mesmo par de sempre                                                          |
| `entries-store.ts` guarda de existência                                              | o `shredFile` engole o `ENOENT` e devolve `false`, e o `deleteEntry` não olha o retorno                                                                     |
| `generator.ts` `count > MAX_GENERATOR_LENGTH` → `>=`                                 | uma categoria com 72 caracteres passa do teto de 40% do comprimento, que é recusado adiante                                                                 |
| `generator.ts` `i > 0` → `i >= 0` no embaralhamento                                  | a volta extra troca o índice `0` com ele mesmo                                                                                                              |
| `protocol.ts` `frame === undefined`/`=== null` → `!==`                               | `senderFrame` ausente ou nulo leva ao mesmo erro de origem                                                                                                  |
| `protocol.ts` `\|\|` → `&&` na guarda de frame                                       | o `&&` recusa tudo, inclusive o frame legítimo do app                                                                                                       |
| `settings.ts` `0o700` → `0o701`                                                      | o `chmodSync` logo depois fixa o modo da pasta                                                                                                              |
| `settings.ts` `&&` → `\|\|` no leitor de preferências                                | espalhar um primitivo em objeto não produz `language`, então o idioma padrão é o mesmo                                                                      |
| `totp.ts` `Math.max(0, remainder)` → `Math.max(1, …)`                                | o resto de um período é sempre maior que zero, então o piso não alcança                                                                                     |
| `unwrapping.ts` `'master'` → `''`                                                    | o `kdfProfileFor` só distingue `'pin'`; qualquer outro nome cai no perfil da senha mestra                                                                   |
| `vault.ts` `'pin'` → `''` em `registerFailedAttempt`                                 | só o método `'master'` tem contador próprio; o PIN não soma no `attemptsMaster` de qualquer jeito                                                           |
| `base32.ts` `let buffer = 0` → `1`                                                   | o bit extra entra acima do byte, e o `& 0xff` o descarta                                                                                                    |
| `base32.ts` `bits >= 5` → `> 5` e `5` → `6`                                          | sobrar 5 bits é exatamente o resto que sai em um caractere                                                                                                  |
| `otpauth.ts` `split === -1` → `1` e `-1` → `-2`                                      | o `indexOf` devolve `-1` ou um índice não negativo, e o primeiro `?` nunca cai na posição `1`                                                               |
| `strength.ts` os tetos de bits (10, 30, 40, 45, 25, 16, 60) → `+1`                   | a régua é uma escala de 0 a 4 com cortes em 28, 36, 60 e 80, e o valor bruto dos bits não aparece em lugar nenhum: um teto movido em um não atravessa corte |
| `strength.ts` `bits = 0` → `1` (senha e PIN)                                         | zero e um bit caem no mesmo degrau                                                                                                                          |
| `strength.ts` `bits = 4`/`8` do PIN → `5`/`9`                                        | o PIN tem três degraus, com cortes em 16 e 24 bits                                                                                                          |
| `strength.ts` `Math.max(distinct, 1)` → `Math.max(distinct, 2)`                      | o ramo só roda com três dígitos distintos ou mais, e aí o máximo já é o próprio número                                                                      |
| `strength.ts` `distinct <= 4` do PIN → `< 4` e `5`                                   | o teto de 16 bits nunca aperta: com quatro dígitos distintos a conta já dá 16                                                                               |
| `strength.ts` `distinct <= 2` do PIN (nos bits) → `< 2` e `3`                        | 4, 8 e 12 bits caem no mesmo degrau do PIN                                                                                                                  |
| `strength.ts` `words.length === 0` → `1`                                             | uma frase de uma palavra não tem motivo nenhum, e a nota é a mesma da frase vazia                                                                           |
| `strength.ts` `Math.max(0, …)` → `Math.max(1, …)`                                    | zero e um bit caem no mesmo degrau                                                                                                                          |
| `strength.ts` `Math.max(size, 2)` → `3`                                              | o tamanho do alfabeto só é zero quando o texto é vazio, e o texto vazio sai antes                                                                           |
| `strength.ts` `size += 10` e `size += 33` → `11` e `34`                              | o número de bits muda em uma fração, mas o degrau não: um bit de alfabeto não atravessa corte                                                               |
| `strength.ts` `text.length / size` → `text.length * size`                            | a repetição é a mesma string depois do corte no tamanho do texto                                                                                            |
| `strength.ts` `return 0` → `return 1` (bloco repetido)                               | o valor só é usado em comparação com 2, e 1 e 0 dão a mesma resposta                                                                                        |
| `strength.ts` `digits.slice(6, 9)` → `digits.slice(6, 8)`                            | a data tem oito dígitos: o corte maior pega os mesmos dois                                                                                                  |
| `strength.ts` `digits.slice(4, 9)` → `digits.slice(4, 8)`                            | idem, no outro formato                                                                                                                                      |
| `strength.ts` `let size = 2` → `3` no laço do bloco                                  | o tamanho do bloco não aparece em lugar nenhum, só o motivo, e um bloco de dois sempre tem um múltiplo que preenche o texto                                 |
| `strength.ts` `text.length > 0` → `>= 0` e `0` → `1` (igualdade)                     | o texto vazio sai antes da conta, e um caractere só é igual a si mesmo nos dois                                                                             |
| `strength.ts` `if (text.length < 2)` → `<= 2` e `2` → `3`                            | com dois caracteres a sequência é o próprio texto, e com três a diferença é de um, abaixo do corte de quatro                                                |
| `strength.ts` `let best = 1` → `2`                                                   | o melhor trecho só é comparado com 4 e com 8                                                                                                                |
| `strength.ts` `for (let i = 1; i < text.length; i++)` → `<=`                         | a volta extra lê um caractere fora do texto, e a diferença não chega a ser um passo                                                                         |
| `App.tsx` `useState<TabType>('home')` → `''`                                         | o `status` começa nulo, e o efeito do primeiro desenho já devolve a tela para o Início                                                                      |
| `App.tsx` `setActiveTab('home')` → `''` no `handleDestroyed`                         | depois do PIN de pânico não sobra cofre, e a tela é o `AuthModal`: a aba não é desenhada                                                                    |
| `AuthModal.tsx` `mode === tab.key` → `!==`                                           | a classe da aba ativa é folha de estilo                                                                                                                     |
| `AuthModal.tsx` `value - 1000` → `value - 1001`                                      | o contador de trava perde um milissegundo por tique, e a tela mostra segundos                                                                               |
| `AuthModal.tsx` `setStep('recovery')` → `''`                                         | o passo só separa "criar credenciais" do resto, e qualquer valor fora dele mostra a mesma tela de frase                                                     |
| `Generator.tsx` `if (!checked) setCount(0)`                                          | a quantidade de uma categoria desmarcada já é zero, então zerar também na hora de marcar não muda nada                                                      |
| `Generator.tsx` `pattern="[0-9]*"` → `''` (2×)                                       | o `pattern` só fala com o validador do navegador, e o campo não está dentro de um formulário                                                                |
| `Credits.tsx` `'a'`/`'b'` → `''`                                                     | o sufixo só entra na `key` de cada metade, e as duas metades são listas separadas                                                                           |
| `SelectField.tsx` `useState(0)` → `useState(1)`                                      | o efeito de abertura reescreve o índice antes de qualquer tecla                                                                                             |
| `SelectField.tsx` `triggerRef.current?.focus()` (2×)                                 | a referência é de um botão sempre montado nas duas chamadas                                                                                                 |
| `i18n.tsx` o contador das `key` do texto rico (2×)                                   | as chaves só precisam ser únicas entre si, e o contador continua único                                                                                      |
| `i18n.tsx` `if (index > cursor)` → `>=`                                              | o pedaço vazio que entra no lugar não vira texto na tela                                                                                                    |

Um detalhe do motor que vale registrar, porque ele muda como se lê um
sobrevivente: o `if-remove` remove a condição, não o corpo. O `if (t) { corpo }`
vira `{ corpo }`, e o `if (t) return;` vira `return;`. O mutante de guarda
"deixa de proteger" o código, ele faz o corpo rodar sempre. Por isso o
`initManifest` sem a guarda não era o `TypeError` que a leitura esperava: era o
manifesto que nunca era selado, que é uma falha mais silenciosa e por isso
precisa de teste próprio.
