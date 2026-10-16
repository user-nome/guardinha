# Backup do cofre no pendrive

O backup integral é a cópia do cofre inteiro num arquivo único cifrado (`.gbk`)
para levar num pendrive. Ele existe para o pior dia: a máquina formatada, o
disco trocado, o computador perdido. Depois de reinstalar o Guardinha, a
restauração devolve o cofre como ele estava, e ele volta a abrir com o mesmo PIN
ou senha mestra.

O caso de uso principal é a **máquina recém-formatada**, onde ainda não existe
cofre nenhum e nenhuma sessão está desbloqueada. Por isso a restauração não
exige a chave do cofre: o que o app copia de um lado para o outro são bytes que
já estavam cifrados.

## O que entra no pacote

- O `vault.zkv` (blobs da chave embrulhados, trava exponencial e manifesto
  cifrado).
- Cada credencial, em `.entries/<uuid>.zke`.
- Cada token de 2FA, em `.auth/<uuid>.zka`.

Ficam de fora os temporários `.tmp` e a destruição segura. O conteúdo é
**exatamente o que já está no disco**: `backup.ts` não tem a chave e não decifra
nada, então nenhuma senha, PIN, frase ou segredo TOTP aparece em claro. Quem
achar o pendrive precisa da mesma credencial que abriria o cofre, porque o que
protege os bytes continua sendo o Argon2id do `vault.zkv`.

## Formato do `.gbk`

O pacote é um bloco binário único, sem compressão e sem dependência nova, em
`src/main/backup/backup-container.ts`:

```
magic(8) "ZKBACKUP" | version(4) | manifestLen(4) | manifesto JSON
| payload (os arquivos, concatenados) | sha256(32)
```

O manifesto é `{ app, version, createdAt, files }`, e cada arquivo traz
`{ path, size, sha256 }`. O `path` é validado por uma lista fechada de propósito:

```
vault.zkv | .entries/<uuid>.zke | .auth/<uuid>.zka
```

O nome nunca é montado a partir do conteúdo lido, então nem `../` nem caminho
absoluto entram. O SHA-256 do fim cobre **tudo** o que vem antes dele, manifesto
incluído: um byte trocado em qualquer ponto derruba a leitura antes de o disco
ser tocado.

O container tem uma versão só (a `1`), como o resto do projeto: não há migração
de formato de backup. Uma versão desconhecida é recusada com `backupUnsupportedVersion`.

## Exportação

1. `collectSegments()` lê o `vault.zkv`, os `.zke` e os `.zka` (pelos ids do
   manifesto, o que já ignora `.tmp`).
2. `packBackup()` monta manifesto e digest.
3. `writeBackupFile()` grava num `.tmp` com `0600` e renomeia por cima do
   destino (escrita atômica). Em mídia removível (FAT/exFAT) o `chmod` pode ser
   recusado e é ignorado, porque o conteúdo continua cifrado.

O destino vem do diálogo nativo de salvar, nunca do renderer, e o retorno para a
tela é só `{ path, files, bytes }`.

## Restauração

`restoreBackup()` valida o pacote **inteiro** (magic, versão, digest global e o
SHA-256 de cada arquivo) antes de qualquer escrita, e exige que exista um
`vault.zkv` no pacote. Um arquivo corrompido derruba a restauração com o cofre
atual intacto.

Validado o pacote:

1. `ensureStructure()` garante as pastas do cofre (com o helper do PolicyKit via
   `pkexec` quando falta permissão).
2. `vaultSession().wipe()` e `vaultStorage.erase()` apagam o cofre atual pelo
   mesmo Cryptographic Erase dos outros caminhos.
3. `clearDestroyedFlag()` devolve a escrita do container: sem isso, o
   `writeVaultContainer` recusaria selar o cofre restaurado.
4. As credenciais e os tokens são gravados, e o **container por último**. Um
   crash no meio deixa um cofre sem chave (a tela pede para criar), nunca um
   cofre aberto pela metade.

Depois disso o main empurra `vault:auto-locked` para o renderer e o cofre novo só
abre com as credenciais do backup.

## Como restaurar depois de formatar

1. Instale o Guardinha (`guardinha_<versão>_amd64.deb`).
2. Plugue o pendrive com o `.gbk`.
3. Na tela de criação do cofre, clique em **Restaurar de um backup** (o botão
   existe ali justamente para não obrigar a criar um cofre vazio só para
   trocá-lo).
4. Escolha o arquivo no diálogo e confirme. O app substitui o cofre atual pelo
   do pacote.
5. Desbloqueie com o PIN ou a senha mestra do backup.

## Segurança

- **Sem segredo em claro.** O pacote é cópia de bytes opacos.
- **Caminho sempre do diálogo nativo.** O renderer não manda caminho; o main só
  reusa o que o diálogo devolveu.
- **AppArmor.** O perfil em `build/apparmor-profile` libera leitura e escrita em
  `/media/$USER` e `/run/media/$USER`, os pontos de montagem de pendrive. O app
  só toca o que o usuário é dono.
- **Erros.** Pacote malformado ou sem container: `backupInvalid`. Byte trocado:
  `backupCorrupted`. Versão desconhecida: `backupUnsupportedVersion`. Falha de
  escrita: `backupWriteFailed`. Autorização do PolicyKit cancelada:
  `vaultAuthCancelled`.

## Onde mora no código

| Arquivo                                  | Papel                                                    |
| ---------------------------------------- | -------------------------------------------------------- |
| `src/main/backup/backup-container.ts`    | O formato `.gbk`: empacota, abre e confere a integridade |
| `src/main/backup/backup.ts`              | `exportBackup` e `restoreBackup` (toque em `fs`)         |
| `src/types/backup.ts`                    | `BackupResult`, `RestoreResult` e os cancelamentos       |
| `src/main/index.ts`                      | Canais `backup:export` e `backup:restore` e os diálogos  |
| `src/renderer/src/components/Backup.tsx` | A aba Backup                                             |
| `tests/main/backup.test.ts`              | Ida e volta, pacote adulterado e restauração             |
| `tests/main/backup-container.test.ts`    | Formato, manifesto e digest                              |
