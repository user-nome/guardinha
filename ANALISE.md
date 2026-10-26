# Análise de segurança do Guardinha 2.0.1

Documento de trabalho do pentest. Fica fora do histórico do git (`.git/info/exclude`).
Não é documentação de usuário e não deve ser publicado.

Data: 26 de outubro de 2026.
Escopo: código em `src/main`, `src/preload`, `src/renderer`, `src/shared`,
`build/`, `SECURITY.md` e `docs/`.

## Veredito

O núcleo criptográfico é sólido: Argon2id por método, AES-256-GCM por arquivo,
HKDF com rótulos de domínio, chave só no processo main e parsing fail-closed.
O problema está na camada que decide **quando destruir**, **o que confiar no
container** e **quando renovar a sessão**.

O achado mais grave (P10) não precisa de atacante: um usuário que redefine o
PIN para o mesmo valor do PIN de pânico perde o cofre no login seguinte. O app
ainda não deveria ser o cofre principal de alguém antes de corrigir P10, P5b,
P9 e P1.

## Método

- Revisão estática dos módulos de segurança e dos fluxos de IPC.
- Suíte existente: 45 testes de segurança e 1307 testes no total, todos
  passando antes das correções.
- 14 PoCs temporários em `tests/security/pentest.local.test.ts`, todos
  passando juntos. O arquivo foi removido depois da execução; os casos
  escolhidos viram testes de regressão em `tests/security/`.
- Sem teste com o `.deb` empacotado e pendrive real. O PoC de symlink usa o
  mesmo `fs` do app, e o perfil AppArmor foi lido para confirmar a escrita.

## Quadro-resumo

| ID  | Severidade        | Achado                                                                                            | Precisa de                   | Estado               |
| --- | ----------------- | ------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------- |
| P10 | Alto              | `resetPin` aceita o PIN de pânico como PIN novo e o próximo login destrói o cofre                 | Nenhum atacante              | Corrigido            |
| P5b | Alto              | Exportar backup para pendrive hostil segue `${destino}.tmp` simbólico e sobrescreve o `vault.zkv` | Pendrive malicioso           | Corrigido            |
| P9  | Alto pelo impacto | Copiar o blob do PIN para o slot de pânico transforma o PIN normal em gatilho de destruição       | Escrita local no container   | Mitigado             |
| P1  | Alto              | Consulta automática de códigos TOTP conta como atividade e anula o auto-lock de 5 min             | Aba de 2FA aberta            | Corrigido            |
| P8  | Médio             | Remover o manifesto faz o app re-selar o diretório e aceitar exclusões silenciosas                | Escrita local no container   | Corrigido            |
| P7  | Médio             | Falha do erase é ignorada; o cofre "destruído" continua no disco                                  | Falha de I/O ou permissão    | Corrigido            |
| P4  | Médio             | Restauração apaga o cofre antes de validar o container; pacote não é autenticado                  | Ação do usuário              | Mitigado             |
| P3  | Aceito em parte   | Cabeçalho (`attempts`, `lockUntil`, `nukeLimit`, flags) não é autenticado                         | Escrita local no container   | Aceito e documentado |
| P2  | Baixo/Médio       | `setNukeLimit` e `clearPanicPin` funcionam com o cofre bloqueado; `2**32` estoura `RangeError`    | Renderer comprometido ou bug | Corrigido            |
| P6  | Baixo             | Manifesto prende nomes de arquivo, não o conteúdo; trocar A por B passa                           | Escrita local no container   | Mitigado             |
| H1  | Baixo             | Falta `setPermissionCheckHandler`; a checagem síncrona pode retornar "granted"                    | Renderer comprometido        | Corrigido            |
| H2  | Baixo             | `window.open` e `openDomain` aceitam `http://`, ao contrário do documentado                       | Clique do usuário            | Corrigido            |
| H3  | Baixo             | `unlock` concorrente não é serializado; incrementos de tentativas podem se perder                 | Renderer comprometido        | A corrigir           |
| H4  | Baixo             | `lock()` não limpa o clipboard na hora                                                            | Uso normal                   | Corrigido            |

---

## P10: `resetPin` aceita o PIN de pânico como PIN novo

**Evidência:** `src/main/vault.ts:376` (`resetPin`), `:402` (grava o novo PIN),
`:213` (`tryPanicUnlock`), `:255` (caminho de pânico no `unlock`).
`setPanicPin` faz a checagem inversa em `src/main/vault.ts:302-318`.

**Como funciona:** `setPanicPin` recusa instalar um PIN de pânico igual ao PIN
real, mas `resetPin` não recusa o contrário. Se o usuário redefine o PIN para o
valor que já é o PIN de pânico, o container fica com `methods.pin` e
`methods.panic` abrindo com a mesma credencial. No login seguinte,
`tryPanicUnlock` roda antes da cadeia normal, desembrulha o blob de pânico,
apaga o cofre e entrega a sessão decoy.

**Impacto:** perda irreversível de dados por um erro plausível de configuração,
sem atacante e sem aviso.

**Correção aplicada:** `resetPin` agora deriva com o método de pânico e recusa o
PIN que o abre, usando o mesmo helper de `setPanicPin`. A recusa acontece
**depois** de a frase de recuperação ser validada, para que uma frase errada
continue devolvendo `wrongRecovery` e a checagem não vire um oráculo que
denuncia o PIN de coação a quem ainda não provou a recuperação. A checagem
também existe no caminho de `tryPanicUnlock`: se o mesmo PIN abre o método
normal, o blob não é tratado como pânico (defesa em profundidade contra P9).
Regressão em `tests/main/vault.guardrails.test.ts`.

## P5b: pendrive hostil sobrescreve o `vault.zkv` no export

**Evidência:** `src/main/backup/backup.ts:45-58` (`writeBackupFile`),
`src/main/structure.ts:32-37` (`writeSecretFile`),
`build/apparmor-profile:117-118` (escrita livre em
`/var/lib/.guardinha/.vault/**`).

**Como funciona:** o export grava em `${destination}.tmp` com `writeFileSync`,
que segue symlink, e depois faz `renameSync(tmp, destination)`. Um pendrive com
sistema de arquivos Linux planta `guardinha-backup-2026-10-26.gbk.tmp` apontando
para `/var/lib/.guardinha/.vault/vault.zkv`. O export escreve `ZKBACKUP` por
cima do container, renomeia o symlink e deixa o cofre ilegível. O nome é
previsível porque o app usa a data como padrão (`src/main/index.ts:323`).

O mesmo padrão existe em `writeSecretFile`.

**Impacto:** perda do cofre, com o AppArmor permitindo a escrita no alvo. O
usuário vê "backup exportado" e o cofre já era.

**Correção aplicada:** temporário com nome aleatório e abertura `wx`
(`O_CREAT | O_EXCL`), que recusa symlink e arquivo pré-existente. O `rename`
continua atômico. Vale para `writeSecretFile` e `writeBackupFile`.

## P9: copiar o método do PIN para o slot de pânico

**Evidência:** `src/main/container.ts:187-206` (flags e blobs),
`src/main/unwrapping.ts:96` (todos os tipos usam o mesmo formato), `:133-135`
(`decoyKey`), `src/main/vault.ts:213-232` (`tryPanicUnlock` só verifica se o
desembrulho funcionou).

**Como funciona:** o container não autentica qual blob pertence a qual método.
Quem tem escrita no `vault.zkv` copia o blob de `methods.pin` para
`methods.panic`. O PIN normal passa a desembrulhar o blob de pânico, que contém
a chave real. `tryPanicUnlock` descarta a chave e trata o sucesso como pânico.

**Impacto:** destruição silenciosa do cofre pelo login legítimo. O `SECURITY.md`
considera fora de escopo malware rodando como o próprio usuário, então o cenário
está no limite do modelo de ameaça. O custo de corrigir é baixo e o efeito é
desproporcional.

**Mitigação aplicada:** `tryPanicUnlock` compara o blob de pânico com o do PIN.
Se forem o mesmo blob (mesmo salt, IV, tag e texto cifrado), não é pânico, é o
PIN real copiado. A cópia sem conhecer a chave ou o PIN é bloqueada. Um atacante
que saiba o PIN já pode abrir o cofre, então está fora do modelo.

**Pendência:** a correção estrutural é dar identidade ao payload (tipo dentro
do texto claro ou AAD do AES-GCM) e autenticar o conjunto de métodos com um MAC
chaveado. Isso muda o formato do container e precisa de decisão de versão.

## P1: a tela de 2FA anula o auto-lock

**Evidência:** `src/main/authenticator.ts:157-175` (`currentCodes` chama
`touch()` em `:173`), `src/renderer/src/components/Authenticator.tsx:82-98`
(tique de 1 s e `loadCodes` quando um código vence), `src/main/session.ts:75-79`
e `src/main/activity.ts`.

**Como funciona:** `currentCodes` é leitura passiva, mas chama `touch()`, que
rearma o temporizador de 5 minutos. A aba de 2FA consulta os códigos a cada 30
segundos enquanto algum código expira. Enquanto a aba estiver aberta, o
temporizador nunca chega ao fim. O PoC avançou 20 minutos e o cofre continuou
desbloqueado.

**Impacto:** o auto-lock deixa de existir na prática para quem deixa a aba de
2FA aberta e se afasta. A chave permanece na RAM.

**Correção aplicada:** `currentCodes` não renova mais a sessão. Só ação
explícita do usuário renova.

## P8: remover o manifesto re-sela o diretório

**Evidência:** `src/main/storage.ts:113-121` (`initManifest` re-sela quando
`manifest === null`), `:137-139` (`verifyManifest` chama `initManifest`),
`src/main/vault.ts:284` e `:411` (`unlock` e `resetPin` chamam `initManifest`).

**Como funciona:** o manifesto é cifrado, mas o campo é opcional. Quem tem
escrita no arquivo remove o manifesto sem a chave. Na listagem seguinte,
`verifyManifest` chama `initManifest`, que sela o diretório atual. Uma
credencial apagada de fora passa a ser aceita como estado legítimo.

**Impacto:** perda silenciosa de credenciais e tokens de 2FA, sem o erro de
adulteração que o manifesto existe para dar. Enfraquece a garantia fail-closed.

**Correção aplicada:** `verifyManifest` lança quando o manifesto é `null`.
`createVault` sela o manifesto vazio antes de gravar o container. `unlock` e
`resetPin` não selam mais nada. `initManifest` foi removido.

## P7: falha do erase é ignorada

**Evidência:** `src/main/erase.ts:38-61` (marca destruído em `:59`
independentemente de `failed`), `src/main/vault.ts:69-75` (`panicDestroy`
ignora o `EraseResult`), `:255-262` (caminho de pânico).

**Como funciona:** se o `vault.zkv` não puder ser sobrescrito (modo `000`, erro
de I/O, atributo imutável), `shredFile` devolve `false`, `eraseVault` incrementa
`failed` e mesmo assim chama `markVaultDestroyed()`. A sessão é zerada, o
renderer mostra "cofre destruído", mas o container continua no disco. Na mesma
execução, `writeVaultContainer` passa a recusar escrita. Depois de reiniciar, o
PIN antigo abre o cofre.

**Impacto:** o usuário acredita que o cofre foi destruído quando a chave ainda
está no disco, e o cofre fica somente leitura até reiniciar.

**Correção aplicada:** `eraseVault` só marca destruído quando o `vault.zkv`
deixou de existir, que é a condição criptográfica real. `panicDestroy` registra
aviso quando sobrou arquivo. O `EraseResult` continua disponível para quem
quiser tratar a falha.

## P4: restauração apaga antes de validar

**Evidência:** `src/main/backup/backup.ts:120-143` (`restoreBackup`),
`src/main/index.ts:330-337` (handler), `src/main/backup/backup-container.ts:115`
(`packBackup`).

**Como funciona:** `restoreBackup` valida o pacote (magic, versão, SHA-256
global e por arquivo), mas não valida o `vault.zkv` restaurado. Em seguida chama
`vaultStorage.erase()` e só depois grava os arquivos. Um pacote autofabricado,
com SHA-256 coerente e um `vault.zkv` que não é container, apaga o cofre atual e
grava o inválido.

O pacote também não é autenticado. Qualquer um pode montar um `.gbk` com um
cofre conhecido e convencer o usuário a restaurar, substituindo o cofre por
outro com PIN que o atacante sabe. A restauração funciona bloqueada, então não
pede a credencial atual.

**Impacto:** perda de dados e substituição de cofre. Exige ação do usuário, mas
o app deveria validar antes de apagar.

**Mitigação aplicada:** o container do pacote é validado com
`unpackVaultContainer` antes do erase. Pacote com container inválido não toca no
cofre atual.

**Pendência:** autenticidade do pacote (MAC chaveado ou assinatura) e pedir a
credencial atual antes de substituir um cofre existente.

## P3: cabeçalho do container sem autenticação

**Evidência:** `src/main/container-format.ts:50-56` (offsets),
`src/main/container.ts:187-206` (pack), `src/main/auth.ts:41-46`
(`getLockRemainingMs`).

**Como funciona:** `attempts`, `lockUntil`, `attemptsMaster`, `nukeLimit` e as
flags ficam em texto claro, fora do GCM. Zerar esses campos não invalida o
container: `unpack` devolve `ok: true` e `getStatus` mostra a trava vencida.

**Impacto:** quem tem escrita no arquivo contorna a trava exponencial e desliga
o limite de autodestruição. O `SECURITY.md` já aceita a parte de `attempts`
(força bruta offline), mas não documenta `nukeLimit` nem as flags.

**Decisão:** risco aceito e documentado, porque a força bruta offline já é
aceita e o atacante com escrita no arquivo tem o mesmo nível de acesso do
usuário. A correção estrutural (MAC do cabeçalho dentro do manifesto) fica para
a mesma mudança de formato de P9.

## P2: configurações de pânico sem sessão e sem teto

**Evidência:** `src/main/vault.ts:326-334` (`clearPanicPin`), `:342-349`
(`panicStatus`), `:358-369` (`setNukeLimit`), `src/main/index.ts:241-252`.

**Como funciona:** `setPanicPin` exige sessão desbloqueada, mas `clearPanicPin`
e `setNukeLimit` não exigem nada. Com o cofre bloqueado, o PoC apagou o PIN de
pânico, mudou o limite e leu `hasPanicPin`. `setNukeLimit(2**32)` passa pelas
validações, chega em `writeUInt32BE` e lança `RangeError`.

**Impacto:** renderer comprometido ou bug de UI desliga a proteção de pânico sem
credencial; `panicStatus` revela a existência do segundo caminho; o `RangeError`
é erro não tratado.

**Correção aplicada:** `clearPanicPin` e `setNukeLimit` exigem sessão
desbloqueada. `setNukeLimit` limita a `0xFFFFFFFF`. `panicStatus` devolve estado
neutro enquanto bloqueado. `docs/api.md` atualizado.

## P6: manifesto prende nomes, não conteúdo

**Evidência:** `src/main/storage.ts:137-160` (compara conjuntos de ids),
`src/main/facade.ts:206-215` (`readRecord` não confere `record.id === id`),
`src/main/entries.ts:14-22`.

**Como funciona:** o manifesto lista os ids dos arquivos. Copiar
`.entries/<A>.zke` sobre `.entries/<B>.zke` mantém o conjunto de ids, então
`verifyManifest` passa. `readRecord(B)` decifra o registro de A e devolve A. A
lista mostra A duas vezes. A injeção de um `.zke` novo é detectada.

**Impacto:** um atacante com escrita no cofre faz uma credencial exibir os dados
de outra, o que serve para phishing ou confusão. Não compromete a chave.

**Mitigação aplicada:** `readRecord` e `readAuthSecret` conferem o id do
registro decifrado com o id do arquivo. A troca entre arquivos existentes passa
a falhar.

**Pendência:** hash de conteúdo por arquivo no manifesto, para pegar também
rollback de versões antigas. Entra na mudança de formato.

## H1: falta `setPermissionCheckHandler`

**Evidência:** `src/main/index.ts:151-155` registra só
`setPermissionRequestHandler`.

**Como funciona:** no Electron, a checagem síncrona de permissão retorna
"granted" quando não há `setPermissionCheckHandler`. O handler de request nega
os diálogos, mas APIs que consultam permissão sem pedir podem receber
"granted". O `SECURITY.md:124` afirma que toda permissão web é negada.

**Impacto:** defesa em profundidade incompleta. Com o renderer atual, a
exploração é limitada, mas a invariante documentada não vale.

**Correção aplicada:** `setPermissionCheckHandler(() => false)` e
`setDevicePermissionHandler(() => false)`.

## H2: `http://` permitido

**Evidência:** `src/main/index.ts:130-137` (`setWindowOpenHandler`),
`:254-258` (`shell:open-domain`), `src/main/auth.ts:102-107` (`openableUrl`).

**Como funciona:** o comentário e o `SECURITY.md` dizem "só https", mas o regex
é `/^https?:\/\//i`. Um domínio `http://...` guardado numa credencial abre em
claro.

**Impacto:** não afeta o cofre, mas expõe o usuário a atacante de rede.

**Correção aplicada:** só `https://` nos dois caminhos. `http://` é recusado
como domínio inválido.

## H3: `unlock` concorrente

**Evidência:** `src/main/vault.ts:241` (`unlock`), `src/main/unlock.ts` (cadeia),
`src/main/auth.ts` (incremento de tentativas).

**Como funciona:** `unlock` tem vários `await` (Argon2id) antes de gravar a
falha. Duas chamadas concorrentes podem passar pela trava antes de qualquer
incremento e perder o read-modify-write de `attempts` e `attemptsMaster`.

**Impacto:** com renderer comprometido, dá para acelerar a força bruta e evitar
o contador. Mesmo nível de ameaça que o `SECURITY.md` já considera fora de
escopo, mas a serialização é barata.

**Pendência:** fila de promessas em volta de `unlock`, `resetPin` e das
mutações do container.

## H4: clipboard no lock manual

**Evidência:** `src/main/vault.ts:57-60` (`lock`), `src/main/clipboard.ts:35-42`
(`dispose`).

**Como funciona:** `panicDestroy` e o encerramento chamam
`secureClipboard.dispose()`, mas `lock()` não. Uma senha copiada continua no
clipboard por até 30 segundos depois de o usuário bloquear o cofre.

**Correção aplicada:** `lock()` limpa o clipboard na hora.

---

## Verificação final

- `npm run check` passa inteiro (typecheck dos quatro projetos, ESLint,
  Prettier, `osv-scanner` sem vulnerabilidade conhecida e `shellcheck`).
- `npm test`: 78 arquivos e 1318 testes passando, contra 1307 antes das
  correções.
- Regressões permanentes acrescentadas: P1 em `tests/main/authenticator.test.ts`;
  P2 em `tests/main/vault.guardrails.test.ts`; P4 em `tests/main/backup.test.ts`;
  P5b em `tests/main/structure.test.ts` e `tests/main/backup.test.ts`; P6 e P9
  em `tests/security/vault.attacks.test.ts`; P7 em `tests/main/erase.test.ts`;
  P8 em `tests/main/storage.test.ts`; P10 em
  `tests/main/vault.guardrails.test.ts`; H1 em `tests/main/window.test.ts`;
  H2 em `tests/main/entrypoint.test.ts`; H4 em `tests/main/vault.test.ts`.
- P3, P4 (autenticidade do pacote), P6 (hash de conteúdo no manifesto),
  P9 (identidade autenticada do método) e H3 continuam abertos no nível de
  formato ou de serialização descrito em cada seção.

---

## Riscos já aceitos que o teste confirmou

- Força bruta offline contra o PIN e contra a senha mestra.
- `attempts` e `lockUntil` adulteráveis no arquivo.
- Chave do cofre em RAM, sem `mlock`.
- Oráculo de tempo do PIN de pânico.
- Limites do shred em SSD.
- `xdg-open` e overrides de ambiente.
- Credenciais decifradas no renderer.
- Malware rodando como o próprio usuário fora de escopo.

P3 encosta nessa lista, mas `nukeLimit` e as flags não estavam documentados.
P9 também é "mesmo usuário", porém o efeito é destruição do cofre, não leitura.

## O que está bem construído

- Argon2id com custo por método, AES-256-GCM por arquivo, HKDF com rótulos de
  domínio, salt e IV por blob, KDF dentro do container e validação de faixa.
- Chave só no main, `VaultSessionManager` Singleton, `AuthToken` sem `secret`,
  TOTP calculado no main.
- `shredFile` com `O_NOFOLLOW`, `lstat`, passes alternadas, `fsync` do arquivo e
  do diretório.
- `assertAppFrame` em todos os handlers IPC, scheme `guardinha://`, CSP estrita,
  sandbox, `contextIsolation`, DevTools desligado no pacote.
- AppArmor restritivo e helper PolicyKit com caminhos fixos e recusa de symlink.
- Parsing fail-closed do container e dos blobs.
- Documentação honesta dos riscos aceitos e boa cobertura de testes.
