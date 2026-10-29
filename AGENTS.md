# AGENTS.md: Guardinha

Diretrizes para agentes e contribuidores deste repositório. Este arquivo manda
no código daqui. Referências humanas: `README.md` (visão completa).

## O projeto

App desktop Electron + TypeScript + React (Vite) para guardar credenciais
offline, alvo Linux Mint 22.X (Zena) e distribuição `.deb`. Versão:
`package.json` → `version` é a fonte da verdade.

Camadas:

- `src/main/`: janela e IPC (`index.ts`), cofre e ciclo de vida (`vault.ts`),
  chave em memória (`session.ts`, Singleton `VaultSessionManager`), atividade
  e auto-lock (`activity.ts`, Observer `ActivityMonitor`), desbloqueio
  (`unlock.ts`, cadeia de manipuladores), desembrulho de chaves
  (`unwrapping.ts`, registro por tipo de credencial), CRUD de credenciais
  (`entries.ts`), criptografia (`crypto.ts`), gerador de senha
  (`generator.ts`), formatos em disco (`container.ts`), scheme `guardinha://`
  e guarda de origem do IPC (`protocol.ts`), persistência (`storage.ts`,
  `entries-store.ts`, `structure.ts` e `layout.ts`) sob a fachada (`facade.ts`,
  `VaultStorageFacade`), destruição segura (`shred.ts`, `erase.ts`,
  `erasure-state.ts`), clipboard (`clipboard.ts`, `SecureClipboardProxy`), trava
  exponencial (`auth.ts`), sudo via PolicyKit (`privilege.ts`), gerador de 2FA
  (`authenticator.ts`, `auth-store.ts`, `totp.ts`), logs do Chromium
  (`logging.ts`) e idioma (`settings.ts`, `i18n.ts`).
- `src/messages/`: textos do app em pt-BR (canônico), zh-CN, ko, ja e en
  (`@zero/messages`); guia em `docs/messages.md`.
- `src/preload/`: única ponte da UI; monta e expõe `window.api` tipado.
- `src/renderer/`: React; não acessa disco, rede nem Node direto.
- `src/shared/`: regras puras compartilhadas por `main` e `renderer`
  (`@zero/shared`, ex.: avaliação de força de credencial, a Strategy
  `strengthFor`, Base32 e o formato `otpauth://`; sem Node nem DOM).
- `src/types/`: contratos compartilhados (`@zero/types`, barrel). É a camada
  que o preload e o renderer importam: o que atravessa o IPC e o estado de
  domínio que mais de um módulo do main precisa nomear (`PersistedAuthState`,
  `FailedAttemptResult`, `TempCleanupResult`). Não é depósito de todo tipo: a
  forma de um arquivo específico (o `vault.zkv`, um `.zke`) e o detalhe local de
  um componente ficam com o módulo que os usa, e ver a regra de tipagem abaixo.

## Arquitetura

- Cada arquivo do `main` responde por um domínio; o renderer só conhece o
  contrato de `window.api` (`docs/api.md`).
- Acesso ao cofre: login só com **PIN**; a **senha mestra** só é oferecida
  depois de 3 falhas de PIN; a **frase de recuperação** é escrita pelo próprio
  usuário (mínimo de 12 palavras, o app nunca gera) e serve exclusivamente para
  redefinir o PIN (`vault.resetPin`), nunca como login.
- Persistência: cofre em `/var/lib/.guardinha/.vault/` (fora de `~/`, 0700;
  **pastas ocultas por padrão**, prefixo `.`; a raiz é criada pelo `postinst`
  do `.deb`, `build/scripts/after-install.sh`) com `vault.zkv` binário (chaves
  embrulhadas + trava exponencial + manifesto cifrado),
  `.entries/<uuid>.zke` individuais e `.auth/<uuid>.zka` de 2FA; a raiz
  `.guardinha/` é
  `root:root 0711` sem listagem (navegar/excluir o topo exige sudo) e, quando
  falta permissão, `createVault` chama o helper do pacote via `pkexec`
  (ação PolicyKit `com.guardinha.keypass.setup-vault`; diálogo do sistema: a
  senha nunca passa pelo app). **Migração só explícita**: o container tem uma
  versão gravada (a 6) e a 5 só é lida pela migração oferecida no login
  (`migration.ts` e `MigrationModal`), o layout de pastas tem um nome só
  (`.entries`, `.auth`) e a extensão do payload de credencial tem uma só
  (`.zke`); os formatos anteriores foram removidos enquanto o app ainda não
  tinha usuário. Raiz
  sobrepõe com `GUARDINHA_VAR_LIB`, caminho completo com `GUARDINHA_VAULT_DIR`
  (testes; `npm run dev` usa `.dev-vault/`); configurações em
  `$XDG_CONFIG_HOME/guardinha/settings.json`.
- IPC via `ipcRenderer.invoke` e `ipcMain.handle`; canal novo só com tipo em
  `src/types/` e entrada em `docs/api.md`.
- Destruição do cofre: `shred.ts` sobrescreve o arquivo antes do `unlink`
  (`O_NOFOLLOW`, blocos de 64 KiB alternando aleatório e zero, `fsync` antes de
  fechar e `fsync` do diretório pai) e `erase.ts` orquestra o Cryptographic
  Erase apagando o `vault.zkv` (único lugar com a chave embrulhada), o `.tmp`
  dele, todas as entradas, todos os tokens de 2FA e as pastas `.entries` e
  `.auth`. `erasure-state.ts` guarda o
  estado de destruição: depois de um erase, `writeVaultContainer` recusa
  escrever, para que nenhum read-modify-write recrie o container pela metade.
  `panicDestroy` (`vault.ts`) zera a chave da RAM **antes** de tocar no disco.
- Gerador de 2FA (TOTP, RFC 6238): os tokens vivem em `.vault/.auth/<uuid>.zka`,
  um arquivo cifrado por token em AES-256-GCM, com rótulo de domínio HKDF
  próprio (`guardinha-vault-auth-v1`). **O segredo nunca sai do processo main**
  (`authenticator.ts`): `window.api.authenticator` devolve metadados e o código
  já calculado, nunca a chave, e `AuthToken` não tem o campo `secret`. O
  algoritmo vem do serviço (SHA1 por padrão), não do app. Ver
  `docs/autenticador.md`.
- A chave do cofre vive em memória no main, dentro do Singleton
  `VaultSessionManager` (`session.ts`); ele zera o Buffer no lock, no auto-lock
  de 5 minutos e no encerramento do app. O temporizador de ociosidade mora no
  `ActivityMonitor` (`activity.ts`): no evento de idle o Singleton zera a chave
  e o entrypoint empurra `vault:auto-locked` para o renderer (o polling de
  15 s em `App.tsx` fica como rede de segurança). O desbloqueio passa pela
  cadeia `unlock.ts` (trava exponencial, formato, Argon2id, integridade) e o
  desembrulho da chave vem do mapa em `unwrapping.ts`. `vault.ts` e
  `entries.ts` não tocam `fs` nem cifra: passam pela fachada
  `VaultStorageFacade` (`facade.ts`).

## Design patterns

- Singleton: `VaultSessionManager` (`src/main/session.ts`) é a única detentora
  da chave do cofre (construtor privado, atalho `vaultSession()`).
- Fachada: `VaultStorageFacade` (`src/main/facade.ts`) concentra `fs-extra`,
  AES-256-GCM e o manifesto; `vault.ts` e `entries.ts` pedem operações de alto
  nível, inclusive o `erase`. `src/preload/index.ts` também é fachada (monta
  `window.api`).
- Proxy: `SecureClipboardProxy` (`src/main/clipboard.ts`) envolve o clipboard
  nativo com expiração em 30 s. É proxy no sentido do GoF, isto é, substituto
  do assunto (`electron.clipboard`), e não `new Proxy`: o objeto nativo não
  tem contrato para implementar e o wrapper acrescenta `dispose`.
- Chain of Responsibility: `unlock.ts` encadeia trava exponencial, formato,
  derivação Argon2id e integridade; `vault.ts` só chama `runUnlockChain`. Na
  cadeia, `null` significa "passe adiante", `undefined` significa "pare sem
  resposta" (o corte da autodestruição) e o resto encerra o desbloqueio.
- Strategy: `src/shared/strategy.ts` (`strengthFor(kind)`) escolhe a régua de
  força por tipo de credencial; as funções puras continuam em `strength.ts`.
  `src/main/unwrapping.ts` (`keyUnwrapperFor(kind)`) faz o mesmo pelo custo do
  Argon2id: um embrulhador só, parametrizado pelo tipo, num registro.
- Observer: `activity.ts` (`ActivityMonitor`) notifica o Singleton e o
  entrypoint na ociosidade; `subscribe()` devolve o cancelador, para que quem
  assina possa se desinscrever (no app, o monitor é singleton de processo e
  ninguém precisa cancelar).
- Barrel exports: `index.ts` só re-exporta. Exceções: os entrypoints
  `src/main/index.ts` e `src/preload/index.ts`, e `src/messages/index.ts`, que
  é o registro de idiomas e a fábrica do bundle.
- Tipagem de domínio por interfaces/uniões fechadas, nunca strings soltas.
  Onde o tipo mora depende de quantos módulos precisam nomeá-lo: contrato que
  atravessa o IPC, ou estado que o main reparte, vai para `src/types/`
  (`UnlockKind`, `VaultStatus`, `PersistedAuthState`); a forma de um arquivo
  específico ou de um componente isolado fica com o módulo dono
  (`container.ts` para o `vault.zkv`, `SelectField.tsx` para as opções do
  seletor). E nunca duas cópias: se um tipo já existe, importa-se.
- UI composicional: estado no topo (`App.tsx`), telas e modais controlados
  (`Home`, `EntryModal`, `AuthModal`).

## Código: regras duras

- Imports dentro de `src/` só pelos aliases ESM `@zero/*` (nenhum caminho
  relativo entre pastas). O mapa é declarado em `tsconfig.base.json` e
  espelhado em `electron.vite.config.mts`, `vitest.config.mts` e
  `src/node.loader.ts`; mudar um alias vale nos quatro.
- Arquivos no teto de ~500 linhas; passou disso, extraia módulos.
- `fs` no main fica em `storage.ts` (`vault.zkv`), `entries-store.ts` (`.zke`),
  `auth-store.ts` (`.zka`), `structure.ts` (pastas e a escrita atômica
  `writeSecretFile`, que os quatro Bridgeto usam), `settings.ts`
  (preferências não sensíveis em `settings.json`), `shred.ts`, `erase.ts`
  (a checagem do que sobrou), `protocol.ts` (o servidor de assets do scheme) e
  `backup/backup.ts` (o pacote `.gbk` do pendrive, com o formato binário em
  `backup/backup-container.ts`).
  `shred.ts` é uma primitiva de baixo nível: recebe um caminho validado por
  quem o compôs e não conhece o cofre. `layout.ts` não toca `fs`, só resolve
  caminhos, e `container.ts` não toca `fs` nem caminho, só `Buffer`.
- Type safety: `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitReturns` e `verbatimModuleSyntax`
  (import de tipo sempre `import type`). Sem `any`, sem cast gratuito.
- Estilo: Prettier com 100 colunas, aspas simples e ponto e vírgula. Não
  desligue regra de lint para passar, corrija o código.
- `console` só `warn`/`error` (regra do ESLint); nenhum `debugger`/`alert`.
- Textos fixos de UI e mensagens de erro **só em `src/messages/`** (pt-BR é o
  canônico; todos os outros bundles devem fechar com `Messages`): no renderer
  use `useMessages()`/`richText()` (`src/renderer/src/i18n.tsx`), no main
  `currentMessages()` (`src/main/i18n.ts`). Marcadores ricos `**negrito**` e
  `` `código` `` só em string exibida. Dados por dependência
  (`attributions.ts`) e logs ficam fora dos bundles (`docs/messages.md`).

## Comandos

- `npm run check`: typecheck + lint + format + `security:audit` (osv-scanner
  sobre o lockfile, com os filtros de `.osv-scanner.toml` e as bandeiras de
  `--all-vulns`, `--experimental-flag-deprecated-packages` e a allowlist
  `--licenses`, todas em `package.json`) + `lint:shell` (shellcheck nos
  scripts de `build/scripts/`). Obrigatório antes de concluir qualquer
  mudança. As duas ferramentas ficam em `bin/` e não entram no git:
  `bin/osv-scanner` (copiar de `user-nome/Biblioteca/bin/`) e `bin/shellcheck`
  (release `koalaman/shellcheck` no GitHub). O lint também guarda as fronteiras
  que este arquivo descreve: a lista de módulos autorizados a tocar `fs` e a
  proibição de `fs`/`child_process` no renderer e no preload estão em
  `no-restricted-imports`, no `eslint.config.mjs`.
- Endurecer as ferramentas: uma regra nova só entra depois de rodar contra o
  repositório inteiro e passar limpa. Regras que só produzem alarme falso aqui
  ficam de fora, com o motivo escrito ao lado do bloco no `eslint.config.mjs`
  (`no-nested-ternary`, `no-await-in-loop`, `no-shadow` fora de `src/`). Não
  desligar regra para o código passar: ou a regra entra e o código se ajusta,
  ou ela não entra e o motivo fica escrito.
- `npm test` (ou `test:coverage`): Vitest em `tests/**`. Todo trabalho de
  teste fecha em **100%** de comandos, ramos, funções e linhas: o limiar já é
  obrigatório em `vitest.config.mts`, e um ramo que o código não alcança de
  jeito nenhum ganha `/* v8 ignore next */` com o motivo escrito ao lado, nunca
  um limiar menor. Quem escreve ou mexe em teste roda `npm run test:coverage`
  antes de concluir.
- `npm run test:e2e` (ou `test:e2e:bundled` / `test:e2e:packaged`): E2E com
  Playwright em `e2e/**`; sobe o app compilado (`out/`) e o payload do `.deb`.
  Precisa de `npm run build` (ou `dist:dir`) antes; é lento e não entra no
  `check`. Ver `docs/e2e.md`.
- `npm run test:mutation` (ou `test:mutation:plan`): teste de mutação em
  `tools/mutation/`; ver `docs/mutation.md`. É lento (cerca de 90 min) e não
  entra no `check`. No CI é o job "Testes de mutação" do `quality.yml`, em ritmo
  próprio: push na `developer`, uma vez por mês no agendamento e no disparo
  manual, **não** em pull request nem em push para a `main`. Reprova abaixo de
  65% e não é status check obrigatório.
- `npm run dev` / `build` / `dist`: desenvolvimento, build, `.deb`.
- `python3 build/make-icon.py`: regenera `build/icon.png` (PIL); é o `icon`
  do electron-builder e da janela.
- `node --import ./src/node.loader.ts <arquivo.ts>`: roda `.ts` direto com os
  aliases `@zero/*`.
- Capture o exit do próprio npm (`npm run check; echo $?`), não o código de
  saída de um `tail`/`grep` no fim do pipe.

## Segurança

- Nada de credencial no repositório; erros do cofre não podem ecoar senha,
  PIN ou frase.
- Renderer com CSP e preload sandboxed (por isso ele é CommonJS); não
  enfraquecer `contextIsolation` nem inserir HTML dinâmico.
- Janela e sessão contidas (`src/main/index.ts`): navegação presa à página do
  app (`will-navigate`), `window.open` só repassa `https:` para o navegador do
  sistema, toda permissão web da sessão é negada (a cópia passa pelo canal
  `clipboard:copy`) e DevTools (`devTools: !app.isPackaged`) fica desligado no
  empacotado; não afrouxar.
- Credencial copiada some do clipboard 30 s depois (`SecureClipboardProxy`, em
  `src/main/clipboard.ts`), salvo o usuário copiar outra coisa antes; o
  renderer não usa `navigator.clipboard`.
- Na produção a SPA é servida por `guardinha://` via
  `registerAppProtocol` (substitui `file://`); todo handler IPC valida
  `event.senderFrame` com `assertAppFrame`. Fuses de segurança no electron-
  builder via chave `electronFuses`.
- Argon2id com custo por método de desbloqueio (PIN de 8 dígitos e PIN de
  pânico: 256 MB / t=4 / p=4; senha mestra e frase de recuperação: 128 MB /
  t=3 / p=4) e AES-256-GCM por arquivo: mudar parâmetros **não** exige migrar o
  `vault.zkv` (hoje versão `6`, com o KDF de cada método dentro do container),
  porque cada método é reembrulhado com o custo atual no próprio desbloqueio, e
  isso só é possível para quem tem a credencial. As chaves derivadas por HKDF
  usam rótulo de domínio com sufixo `-v1`: trocar o rótulo invalida os arquivos
  já gravados.
- PIN de pânico: abre um cofre vazio enquanto aciona o Cryptographic Erase. É
  verificado **antes** da trava exponencial (quem está sob coação não espera
  24 h), não conta tentativa (para não denunciar o segundo caminho) e paga o
  mesmo Argon2id de um PIN comum (para não ser medido). A sessão decoy não
  guarda chave alguma. Autodestruição por tentativas (`nukeLimit`) só conta
  senha mestra, nasce **desligada** e tem piso 50.
- `.deb` e `out/` nunca entram no git.

## Documentação

- Documentação nova vai em `docs/`; o índice é `docs/README.md` e o
  `README.md` da raiz é a porta de entrada.
- Mapa: `docs/api.md` (contrato `window.api`), `docs/messages.md` (i18n e
  regras de tradução), `docs/seguranca.md` (onde cada medida mora no código).
- Convenção dos textos: português do Brasil, com pontuação adequada (vírgulas,
  dois-pontos, ponto e vírgula, parênteses e ponto final) e **sem travessões**.
