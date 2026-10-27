# Mapa de segurança

O `SECURITY.md` da raiz é o texto normativo: proteções já existentes, riscos
aceitos, fora de escopo e como reportar uma falha. Aqui fica o **mapa**, para
quem precisa mexer no código saber onde cada medida mora e o que ela protege.

## Onde cada medida vive

| Medida                                                   | Arquivo principal                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| Recusa de credencial previsível na criação e no reset    | `src/shared/strength.ts`, `src/shared/strategy.ts`, `src/main/vault.ts`     |
| Argon2id com custo por método (256 MiB para o PIN)       | `src/main/crypto.ts`, `src/main/unwrapping.ts`                              |
| Formato do `vault.zkv` e faixa de leitura do KDF         | `src/main/container.ts`                                                     |
| Chave só em memória, lock e auto-lock de 5 min           | `src/main/session.ts` (`VaultSessionManager`), `src/main/activity.ts`       |
| Cadeia de desbloqueio (trava, formato, KDF, integridade) | `src/main/unlock.ts`, `src/main/vault.ts`                                   |
| Trava exponencial (10 s até 24 h) persistida no cofre    | `src/main/auth.ts`, `src/main/storage.ts`                                   |
| AES-256-GCM por registro e HKDF-SHA512 por arquivo       | `src/main/crypto.ts`                                                        |
| Fachada única de persistência (fs, cifra, manifesto)     | `src/main/facade.ts`                                                        |
| Manifesto cifrado e falha fechada na adulteração         | `src/main/container.ts`, `src/main/storage.ts`                              |
| Papel autenticado de cada método (HKDF e AAD por tipo)   | `src/main/crypto-constants.ts`, `src/main/unwrapping.ts`                    |
| Restauração sobre cofre existente exige sessão aberta    | `src/main/backup/backup.ts`                                                 |
| Operações do cofre serializadas (sem lost update)        | `src/main/vault.ts` (`exclusive`)                                           |
| Credenciais validadas antes de gravar                    | `src/main/entries.ts`, `src/main/auth.ts`                                   |
| Segredo de 2FA cifrado e fora do renderer                | `src/main/authenticator.ts`, `src/main/auth-store.ts`                       |
| Algoritmo de 2FA conforme a RFC (serviço manda, não nós) | `src/main/totp.ts`, `src/shared/otpauth.ts`                                 |
| Domínio de chave separado entre credencial e 2FA         | `src/main/crypto.ts` (`deriveAuthKey`, `KEY_INFO_AUTH`)                     |
| Id de arquivo seguro (path traversal, CVE-2026-21589)    | `src/main/entries-store.ts` (`assertSafeEntryId`), `src/main/auth-store.ts` |
| Sobrescrita antes do `unlink` (`O_NOFOLLOW`, fsync)      | `src/main/shred.ts`                                                         |
| Cryptographic Erase (apagar a chave embrulhada)          | `src/main/erase.ts`, `src/main/erasure-state.ts`                            |
| Guarda de "erase não recria container"                   | `src/main/erasure-state.ts`, `src/main/storage.ts` (`writeVaultContainer`)  |
| PIN de coação e sessão decoy                             | `src/main/vault.ts`, `src/main/unwrapping.ts`, `src/main/session.ts`        |
| Limite estrito da senha mestra                           | `src/main/auth.ts`, `src/main/vault.ts`, `src/main/container.ts`            |
| Temporários órfãos varridos na inicialização             | `src/main/entries-store.ts`, `src/main/index.ts`                            |
| Raiz `/var/lib/.guardinha` com `root:root 0711`          | `build/scripts/after-install.sh`                                            |
| Senha de administrador fora do app (PolicyKit)           | `src/main/privilege.ts`, `build/scripts/guardinha-setup`                    |
| Confinamento AppArmor do processo instalado              | `build/apparmor-profile`, `build/scripts/after-install.sh`                  |
| Declaração do perfil no empacotamento                    | `package.json` (bloco `build.deb.appArmorProfile`)                          |
| Guarda de origem em todo canal IPC                       | `src/main/index.ts` (`assertAppFrame`)                                      |
| Navegação presa, `window.open`, permissões web negadas   | `src/main/index.ts`                                                         |
| Renderer servido por `guardinha://`                      | `src/main/protocol.ts` (`registerAppProtocol`)                              |
| Fuses do Electron                                        | `package.json` (bloco `build.electronFuses`)                                |
| CSP e preload com `contextIsolation`/`sandbox`           | `src/renderer/index.html`, `src/preload/index.ts`                           |
| Limpeza do clipboard em 30 s, e na hora ao sair          | `src/main/clipboard.ts` (`SecureClipboardProxy`)                            |
| Erros do cofre sem eco de senha, PIN ou frase            | `src/main/vault.ts`, `src/main/entries.ts`, `src/messages/`                 |
| Backup só do que já está cifrado, com digest e caminhos  | `src/main/backup/backup.ts`, `src/main/backup/backup-container.ts`          |
| Auditoria de dependências e de scripts                   | `.osv-scanner.toml`, `npm run lint:shell`, `.github/workflows/codeql.yml`   |

## Fluxo de confiança

```
Página do app → assertAppFrame → regra de domínio → fachada → arquivo cifrado
                     ^                                     ^
                     |                                     |
             só o frame oficial                   validações e manifesto
```

Nenhuma entrada do renderer passa direto para o disco: o id precisa ser UUID
conhecido, o domínio aberto no navegador precisa começar por `https` e
a chave do cofre é exigida pelas funções de domínio (`requireSessionKey`).
`vault.ts`, `entries.ts` e `authenticator.ts` não tocam `fs` nem cifra: passam
pela `VaultStorageFacade` (`src/main/facade.ts`). O desbloqueio passa pela cadeia
`unlock.ts` (trava exponencial antes do Argon2id; PIN malformado não paga a
derivação) e o desembrulho da chave sai do mapa `unwrapping.ts`.

## Onde cada arquivo toca o disco

O acesso ao disco é concentrado, e a divisão é por domínio, não por arquivo:

| Arquivo                     | O que ele toca                                           |
| --------------------------- | -------------------------------------------------------- |
| `src/main/layout.ts`        | Nada: só resolve caminhos, sem `fs` e sem Electron       |
| `src/main/structure.ts`     | Pastas, permissões e a escrita atômica em 0600           |
| `src/main/storage.ts`       | O `vault.zkv`; aceita somente o formato v6               |
| `src/main/entries-store.ts` | Os arquivos `.zke` de cada credencial                    |
| `src/main/auth-store.ts`    | Os arquivos `.zka` de cada token de 2FA                  |
| `src/main/shred.ts`         | Sobrescrita e remoção; recebe sempre caminho já validado |
| `src/main/erase.ts`         | Orquestra o erase, compondo os dois últimos              |
| `src/main/backup/backup.ts` | O pacote `.gbk`: lê o cofre cifrado e grava no destino   |
| `src/main/settings.ts`      | O `settings.json` (que só tem idioma, sem segredo)       |

`shred.ts` é uma primitiva de baixo nível: recebe um caminho montado e validado
pelo módulo que compõe a operação e não conhece o cofre. `settings.ts` também
faz I/O, mas somente para as preferências não sensíveis em
`$XDG_CONFIG_HOME/guardinha/settings.json`.

## O que não enfraquecer

- `assertAppFrame` em todo canal novo; sem ele o domínio fica aberto a frame
  de fora. Isso vale **ainda mais** para os canais de autodestruição.
- CSP do `index.html` e os fuses do `electron-builder`.
- Validação de força no `main`: o medidor do renderer é só aviso.
- Parâmetros do Argon2id dentro de `KDF_LIMITS` (escrita e leitura).
- Manifesto antes de listar, salvar ou remover credencial.
- Clipboard só pelo canal `clipboard:copy` (`SecureClipboardProxy` no main);
  voltar a pedir permissão de clipboard no renderer é abrir de novo a permissão
  que a política da sessão nega.
- A chave do cofre só existe dentro do `VaultSessionManager` (Singleton):
  nenhuma cópia em variável de módulo ou em Buffer que escape do `adopt`/`wipe`.
  A sessão decoy do PIN de coação **não** guarda chave alguma.
- **A ordem do `panicDestroy`**: `wipe()` da sessão antes de qualquer I/O. Se o
  disco falhar, a memória já está limpa, que é o lado que o atacante com o
  mesmo usuário alcança mais fácil.
- **`writeVaultContainer` continua recusando depois de um erase**
  (`erasure-state.ts`). Sem essa guarda, um `writeAuthState` (que é
  read-modify-write) ou um `initManifest` disparado por engano recriam o
  `vault.zkv` pela metade, sem chave, e o usuário vê "cofre adulterado" onde o
  certo é "cofre destruído". Só `createVault` libera.
- **A restauração só libera o `writeVaultContainer` depois de validar o pacote
  inteiro.** `restoreBackup` chama `clearDestroyedFlag()` apenas quando
  `unpackBackup` já conferiu magic, versão, digest global e cada SHA-256; liberar
  antes deixaria um pacote corrompido apagar o cofre bom.
- **As operações do cofre são serializadas** (`exclusive`, em `vault.ts`):
  desbloqueio, redefinição de PIN e mutações do container fazem read-modify-write
  com Argon2id no meio, e duas em paralelo perdem uma tentativa contada ou uma
  troca de PIN. Operação nova que grava o container entra na fila; os helpers
  internos não entram, para não travar em deadlock.
- **O `O_NOFOLLOW` do `shredFile`**: sem ele, um symlink no lugar do arquivo
  faria a sobrescrita happen no alvo, que é exatamente o oposto do que se quer.
- **O PIN de pânico não conta tentativa**: se contasse, o aumento do contador
  denunciaria a existência de um segundo caminho justamente para quem está
  testando o app sob coação.
- `build/apparmor-profile` não pode voltar a `flags=(unconfined)`: o perfil só
  vale alguma coisa se for restritivo, e cada regra nova ali precisa de teste
  em `enforce` (negação legítima em `/var/log/kern.log` é sinal de que faltou
  regra, não de que a regra deva ser removida). O socket do método de entrada
  (`owner @{HOME}/.cache/ibus/dbus-* rw`) é o custo de esquecer uma regra: sem
  ele o teclado não escreve em campo de texto nenhum sob `GTK_IM_MODULE=ibus`,
  e o defeito não aparece em teste nem em `complain`.
- **O perfil do AppArmor é instalado em dois estágios, e o segundo pode desfazer
  o primeiro** (`build/scripts/after-install.sh`): dry run com
  `--skip-kernel-load -K` para saber se a versão instalada aceita o perfil,
  cópia atômica para `/etc/apparmor.d` e, se o carregamento no kernel falhar,
  remoção do arquivo. Instalar e apagar o mesmo arquivo parece desperdício, mas
  deixar lá um perfil que o kernel recusa faz o `apparmor.service` falhar no
  boot seguinte, e aí o sistema perde a política inteira, não só a deste app.
- Nenhum `console` com senha, PIN ou frase; nenhum log de payload IPC.

Qualquer mudança nesses pontos muda também o `SECURITY.md` e costuma pedir
teste novo em `tests/main/`.
