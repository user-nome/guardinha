# Mensagens e idiomas (i18n)

Todo texto fixo da interface (e das mensagens de erro do processo main) vive em
`src/messages/`, nunca espalhado pelo código. O app nasce em **português
(Brasil)** e também fala **chinês simplificado**, **coreano**, **japonês** e
**inglês**; o idioma é escolhido na Sidebar e persistido em `settings.json`
(`AppSettings.language`).

## O contrato

- `src/messages/pt-BR.ts` é o **canônico**: exporta `ptBR` e
  `export type Messages = typeof ptBR`. Toda chave e assinatura nasce aqui.
- `src/messages/zh-CN.ts`, `ko.ts`, `ja.ts` e `en.ts` exportam cada um o seu
  bundle como `Messages`; o TypeScript aponta qualquer chave ou parâmetro
  faltando (ou sobrando) na tradução.
- `src/messages/index.ts` é o barrel: `LANGUAGES` (a ordem de exibição é
  `'pt-BR' | 'zh-CN' | 'ko' | 'ja' | 'en'`, com o português canônico primeiro e
  o inglês por último), `LANGUAGE_LABELS` (nome nativo do idioma, que **não** se
  traduz), `messages()` e os bundles.

Regras das strings:

- Strings com parâmetro são **funções** (`lockout: (time: string) => ...`).
- Marcadores ricos, usados **só na UI**: `**negrito**` vira `<strong>` e
  `` `código` `` vira `<code>`; renderize com `richText()` (em
  `src/renderer/src/i18n.tsx`), que monta nós React sem `dangerouslySetInnerHTML`.
- Elipses são `…` (U+2026), não `...`.
- Os textos da checagem de força ficam no bloco `strength` (nível, motivos e
  dicas) e a recusa do `main` em `errors.trivialMaster`, `errors.trivialPin` e
  `errors.trivialPhrase` (`credenciais.md`).

## Como cada camada lê

| Camada   | Como obtém o idioma                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Renderer | Contexto React em `src/renderer/src/i18n.tsx`: `MessagesProvider` (montado pelo `App`), hooks `useMessages()` / `useLanguage()` e `richText()`. Fora do provider o padrão é `pt-BR`. |
| Main     | `currentMessages()` (`src/main/i18n.ts`) lê `loadSettings().language` a cada chamada e devolve o bundle; os erros IPC saem já no idioma vigente.                                     |

`App` lê `settings.get()` na carga e troca o provider ao trocar o idioma na
Sidebar (`settings.set`).

## O que NÃO se traduz

- **Dados por dependência**: `DEPENDENCIES[].role/nome`
  (`src/renderer/src/attributions.ts`).
- **Nomes de marca**: `Guardinha`, `Linux Mint`, `Electron`, `Tailwind CSS`…
  (título da janela, nomes de pacotes).
- **Logs** (`console.error`): diagnóstico, não UI.
- **Chaves internas**: nomes de canal IPC, ids de arquivo, regex.
- **Frases de status do protocolo**: os corpos de resposta do servidor de
  assets `guardinha://` (`Forbidden`, `Not Found`, `Internal Error`, em
  `protocol.ts`). É transporte, não interface: quem chega ali é o carregador de
  asset, e localizá-lo seria ler o `settings.json` a cada requisição.

Pelo resto não há exceção: todo `Error` lançado pelo processo main tira a
frase do bundle, inclusive as invariantes internas (`containerCorrupted`,
`invalidManifest`, `invalidKdfParams`, `unknownUnlockMethod`,
`truncatedDigest`, `shortPhrase`). O caminho normal converte quase todas em
`vaultTampered` ou `wrongPin` antes de a tela ver qualquer coisa, mas o texto
mora no bundle para que a regra da `AGENTS.md` não precise de lista de
exceções para continuar verdadeira.

## Adicionando uma string

1. Crie a chave em `src/messages/pt-BR.ts` (com parâmetro, se variar).
2. Traduza em `zh-CN.ts`, `ko.ts`, `ja.ts` e `en.ts`; o typecheck reclama se
   faltar em qualquer um.
3. Use via `useMessages()` (renderer) ou `currentMessages()` (main).
4. `npm run check` + `npm test` (o `tests/messages/parity.test.ts` confere
   paridade de chaves e aridade).

## Adicionando um idioma

1. Adicione o código ao tipo `Language` (`src/types/settings.ts`).
2. Novo bundle `src/messages/<código>.ts` tipado como `Messages` + registro em
   `BUNDLES`, `LANGUAGES` e `LANGUAGE_LABELS` (`src/messages/index.ts`).
3. A normalização em `src/main/settings.ts` (`normalizeLanguage`) passa a
   aceitar o novo valor sem mudar: ela valida contra `LANGUAGES`.
4. Estenda a lista `TRADUCOES` em `tests/messages/parity.test.ts`.

## Fontes CJK

`zh-CN`, `ko` e `ja` só aparecem com hanzi e hangul. Numa instalação sem fonte
CJK (o `fonts-noto-cjk` não vem por padrão em toda distro) esses caracteres
sairiam como quadradinhos. Por isso `globals.css` declara `--font-cjk` e a
aplica depois do `system-ui`, que resolve sozinho quando existe fonte instalada.
A pilha é só plano B: Noto, Source Han, as fontes do sistema e `sans-serif` no
fim, para nunca ficar sem nada legível.
