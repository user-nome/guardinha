# API interna (`window.api`)

Contrato único entre renderer e main. Definido em `src/types/api.ts`
(`ElectronApi`), montado em `src/preload/index.ts` e registrado no
`contextBridge` como `window.api`. Cada método vira um canal
`ipcRenderer.invoke` / `ipcMain.handle` homônimo em `src/main/index.ts`.

> Erros do processo main chegam ao renderer como `Error` rejeitado, com a
> mensagem **já localizada** no idioma corrente (`currentMessages()`).

Guarda de origem: todo handler IPC chama `assertAppFrame(event)` antes da
lógica de domínio, exigindo `event.senderFrame` apontando para a página
oficial do app (scheme `guardinha://` em produção ou dev server do Vite em
dev); uma mensagem de emissor desconhecido é bloqueada com erro.

Entradas são validadas no main, nunca só na tela: comprimento da senha mestra
(24), do PIN (8 dígitos) e da frase (12+ palavras), forma de usuário/domínio,
UUID de credencial e, na criação e na redefinição de PIN, a força da
credencial (`credenciais.md`).

## `window.api.vault`

| Método                | Canal                   | Payload → retorno                | Descrição                                                                                                                 |
| --------------------- | ----------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `status()`            | `vault:status`          | `→ VaultStatus`                  | `exists`, `locked`, `attempts`, `lockUntil`, `lockRemainingMs`.                                                           |
| `create(input)`       | `vault:create`          | `CreateVaultInput → VaultResult` | Cria o cofre em `/var/lib/.guardinha/.vault/` com frase **escrita pelo usuário** (≥ 12 palavras); valida formato e força. |
| `unlock(input)`       | `vault:unlock`          | `UnlockInput → VaultResult`      | Desbloqueia com `kind`: `master` \| `pin`; a **senha mestra só aparece após 3 falhas** de PIN.                            |
| `resetPin(input)`     | `vault:resetPin`        | `ResetPinInput → VaultResult`    | Único uso da frase de recuperação: valida a frase e instala um novo PIN (abre o cofre).                                   |
| `lock()`              | `vault:lock`            | `→ VaultStatus`                  | Zera a chave em memória, limpa o clipboard e bloqueia.                                                                    |
| `destroy()`           | `vault:destroy`         | `→ VaultStatus`                  | Cryptographic Erase: zera a chave da RAM e sobrescreve e apaga o cofre. A confirmação em duas etapas mora no renderer.    |
| `setPanicPin(input)`  | `vault:set-panic-pin`   | `PanicPinInput → VaultResult`    | Instala o PIN de coação (exige cofre desbloqueado). Recusa o PIN real e PIN previsível.                                   |
| `clearPanicPin()`     | `vault:clear-panic-pin` | `→ VaultStatus`                  | Remove o caminho de pânico do container (exige cofre desbloqueado).                                                       |
| `setNukeLimit(limit)` | `vault:set-nuke-limit`  | `number → VaultResult`           | Limite estrito de falhas da senha mestra que dispara o erase (exige cofre desbloqueado). `0` desliga; piso 50.            |
| `panicStatus()`       | `vault:panic-status`    | `→ PanicStatus`                  | `hasPanicPin`, `nukeLimit` e `attemptsMaster`, para a tela de Configurações. Neutro enquanto o cofre está bloqueado.      |

Os canais de autodestruição (`vault:destroy`, `vault:set-panic-pin`,
`vault:clear-panic-pin`, `vault:set-nuke-limit`) são **irreversíveis ou
permanentes**: por isso todos chamam `assertAppFrame(event)` antes de qualquer
coisa, e o `vault:destroy` ainda depende de uma confirmação no renderer. Um
canal de autodestruição aberto a um frame de fora seria o pior caso possível.

### Push do auto-lock (evento main → renderer)

| Método                   | Canal               | Payload → retorno      | Descrição                                                                                        |
| ------------------------ | ------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| `onAutoLocked(listener)` | `vault:auto-locked` | `VaultStatus` → `void` | Ouvinte do auto-lock: o main empurra o status novo quando a chave sai da memória por ociosidade. |

`onAutoLocked` registra um ouvinte de evento (não é `invoke`/`handle`) e
devolve a função que cancela a assinatura; o App chama
`unsubscribe()` no cleanup do `useEffect`. O renderer ainda consulta
`vault.status()` a cada 15 s como rede de segurança, mas a volta à tela de
autenticação no auto-lock é imediata.

O mesmo evento também é emitido, com um status novo, **quando uma operação que
precisa da chave descobre que a sessão já foi zerada** (`withSessionNotice`, em
`src/main/index.ts`). A chave pode sumir entre o status que o renderer recebeu e
a chamada de dados que ele fez em seguida: é o auto-lock disparando com a tela
montada, e é também o restart do processo main em `npm run dev`, que recria o
`VaultSessionManager` vazio e deixa o renderer com a tela antiga. Sem o aviso, o
renderer ficaria chamando um cofre que não existe mais. A resposta continua
sendo **erro** (devolver lista vazia faria o app parecer um cofre vazio), e o
renderer reconsulta o status e volta para a autenticação.

## `window.api.openDomain`

| Método               | Canal               | Payload → retorno | Descrição                                                                                   |
| -------------------- | ------------------- | ----------------- | ------------------------------------------------------------------------------------------- |
| `openDomain(domain)` | `shell:open-domain` | `string → void`   | Abre o domínio da credencial no navegador padrão (`shell.openExternal`; só `http`/`https`). |

## `window.api.clipboard`

| Método        | Canal            | Payload → retorno | Descrição                                                                                                                  |
| ------------- | ---------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `copy(value)` | `clipboard:copy` | `string → void`   | Copia no clipboard nativo e limpa sozinho 30 s depois (`SecureClipboardProxy`, no main; salvo cópia posterior do usuário). |

A cópia mora no processo main: o renderer não pede permissão de clipboard ao
sistema e o temporizador sobrevive a uma recarga da página. O canal só aceita
texto (o handler recusa outro tipo de payload).

## `window.api.entries`

| Método        | Canal            | Payload → retorno                | Descrição                                                   |
| ------------- | ---------------- | -------------------------------- | ----------------------------------------------------------- |
| `list()`      | `entries:list`   | `→ Credential[]`                 | Decifra todos os arquivos (precisa desbloqueado).           |
| `save(entry)` | `entries:save`   | `CredentialInput → Credential[]` | Cria (sem `id`) ou atualiza; valida título/usuário/domínio. |
| `remove(id)`  | `entries:delete` | `string → Credential[]`          | Apaga o arquivo cifrado.                                    |

## `window.api.authenticator`

| Método         | Canal                    | Payload → retorno              | Descrição                                                   |
| -------------- | ------------------------ | ------------------------------ | ----------------------------------------------------------- |
| `list()`       | `authenticator:list`     | `→ AuthToken[]`                | Metadados dos tokens (precisa desbloqueado). Sem o segredo. |
| `saveUri(uri)` | `authenticator:save-uri` | `string → AuthToken[]`         | Salva a URI `otpauth://` que o serviço exibiu.              |
| `save(token)`  | `authenticator:save`     | `AuthTokenDraft → AuthToken[]` | Salva com a chave digitada à mão (id ausente cria um novo). |
| `remove(id)`   | `authenticator:delete`   | `string → AuthToken[]`         | Apaga o arquivo cifrado do token.                           |
| `codes()`      | `authenticator:codes`    | `→ AuthCode[]`                 | `{ id, code, remainingMs }` de todos os tokens, agora.      |

**O segredo TOTP não é retorno de nenhum método.** `AuthToken` não tem o campo
`secret` e `AuthCode` traz o código já calculado: quem pede o número nunca vê a
chave, e o processo do renderer nunca a tem em memória. É por isso que
`codes()` é o canal mais sensível do grupo e por isso ele também chama
`assertAppFrame` e `withSessionNotice` (`src/main/totp.ts`, `src/shared/otpauth.ts`,
`src/main/authenticator.ts`; detalhes em `docs/autenticador.md`).

O arquivo de cada token é `.vault/.auth/<uuid>.zka`, cifrado em AES-256-GCM com
a chave do cofre e com rótulo de domínio HKDF próprio
(`guardinha-vault-auth-v1`), separado do das credenciais.

## `window.api.generator`

| Método              | Canal                | Payload → retorno           | Descrição                                                                                                                                                                                                   |
| ------------------- | -------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate(options)` | `generator:generate` | `GeneratorOptions → string` | Senha de 0 a 72 caracteres. As quantidades reservadas por classe e as palavras pessoais literais compartilham um limite de 40% do comprimento; o main valida essas opções e gera o restante aleatoriamente. |

## `window.api.backup`

| Método      | Canal            | Payload → retorno  | Descrição                                                                         |
| ----------- | ---------------- | ------------------ | --------------------------------------------------------------------------------- |
| `export()`  | `backup:export`  | `→ BackupOutcome`  | Empacota o cofre cifrado (`.gbk`) e grava no destino escolhido no diálogo nativo. |
| `restore()` | `backup:restore` | `→ RestoreOutcome` | Valida e restaura o pacote `.gbk`, substituindo o cofre atual.                    |

O pacote é cópia de bytes **já cifrados** (o `vault.zkv`, os `.zke` e os `.zka`)
com manifesto e SHA-256: nenhuma senha ou segredo em claro, e por isso o canal
não decifra nada. O destino e a origem vêm sempre do diálogo nativo, nunca da
página, e o retorno traz só contagem e caminho. Substituir um cofre existente
exige a sessão aberta; numa máquina sem cofre a restauração é livre. Depois
da restauração o main empurra `vault:auto-locked` e o renderer volta para a
autenticação. O formato mora em `docs/backup.md`.

## `window.api.settings`

| Método          | Canal          | Payload → retorno           | Descrição                                                                   |
| --------------- | -------------- | --------------------------- | --------------------------------------------------------------------------- |
| `get()`         | `settings:get` | `→ AppSettings`             | `language` (`'pt-BR' \| 'zh-CN' \| 'ko' \| 'ja' \| 'en'`), default `pt-BR`. |
| `set(settings)` | `settings:set` | `AppSettings → AppSettings` | Normaliza e grava em `$XDG_CONFIG_HOME/guardinha/settings.json`.            |

## Tipos (`src/types/`)

- `VaultStatus`: `{ exists, locked, attempts, lockUntil, lockRemainingMs }`
- `CreateVaultInput`: `{ masterPassword, pin, recoveryPhrase }` (senha de 24 chars; PIN de 8 dígitos; frase ≥ 12 palavras escrita pelo usuário)
- `UnlockInput`: `{ credential, kind: 'master' | 'pin' }`
- `ResetPinInput`: `{ phrase, newPin }` (frase de recuperação + novo PIN)
- `Credential` / `CredentialInput`: registro da credencial (senha cifrada por arquivo)
- `AuthToken`: `{ id, issuer, account, algorithm, digits, period, createdAt, updatedAt }` (sem o segredo)
- `AuthTokenDraft`: o mesmo mais `secret` em Base32 com pelo menos 80 bits
  (10 bytes), só na entrada do `save`; a tela avisa abaixo de 128 bits (mínimo
  da OWASP) e de 160 bits (recomendado)
- `AuthCode`: `{ id, code, remainingMs }`
- `GeneratorOptions`: `{ length, useLower, useUpper, useNumbers, useSymbols, customEntropyWords }`
- `AppSettings`: `{ language }`
- `BackupResult`: `{ path, files, bytes }` e `RestoreResult`: `{ path, files }`
- `BackupCancelled`: `{ canceled: true }`; `BackupOutcome` e `RestoreOutcome` são
  cada um o seu resultado ou o cancelamento
