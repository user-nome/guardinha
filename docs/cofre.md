# O cofre

O cofre é o conjunto de arquivos onde vivem as chaves embrulhadas e as
credenciais cifradas. Ele fica em `/var/lib/.guardinha/`, fora de `~/`, para
sobreviver à limpeza da pasta do usuário e não cair em caminho trivial de
backup sincronizado.

## Caminhos e permissões

| Caminho                                    | Dono / modo      | Conteúdo                                        |
| ------------------------------------------ | ---------------- | ----------------------------------------------- |
| `/var/lib/.guardinha/`                     | `root:root 0711` | Raiz sem listagem: navegar ou apagar exige sudo |
| `/var/lib/.guardinha/.vault/`              | usuário, `0700`  | Diretório do cofre                              |
| `.vault/vault.zkv`                         | do usuário       | Container: chaves embrulhadas, trava, manifesto |
| `.vault/.entries/<uuid>.zke`               | do usuário       | Uma credencial salva, cifrada por arquivo       |
| `.vault/.auth/<uuid>.zka`                  | do usuário       | Um token TOTP, cifrado por arquivo              |
| `$XDG_CONFIG_HOME/guardinha/settings.json` | do usuário       | Preferências (idioma)                           |

O `npm run dev` não usa `/var/lib`: ele aponta o cofre para `.dev-vault/` na
raiz do projeto por meio de `GUARDINHA_VAULT_DIR`.

### Quem cria a pasta

1. O `postinst` do `.deb` (`build/scripts/after-install.sh`) cria a raiz com
   `root:root 0711` e, quando identifica o usuário instalador, `.vault` com
   `0700` e propriedade dele.
2. Se faltar permissão no primeiro uso, o app chama `pkexec` com o helper
   `guardinha-setup` (ação PolicyKit `com.guardinha.keypass.setup-vault`). A
   senha é digitada no diálogo do sistema e nunca passa pelo app.
3. Com `GUARDINHA_VAULT_DIR` ou `GUARDINHA_VAR_LIB` definidas (testes e dev),
   o `pkexec` não é disparado.

## Formato do `vault.zkv`

Arquivo binário com magic `ZKVAULT1`, escrito e lido apenas em
`src/main/container.ts`. Toda leitura é fail-closed: forma inválida,
truncamento, parâmetro fora da faixa, flag desconhecida ou byte a mais no fim
são recusados como adulteração; uma versão fora de `5` e `6` recebe um erro
específico de formato incompatível. Nunca é devolvido conteúdo em claro.

Cabeçalho de **41 bytes**, versão 6 (valores em big endian):

| Offset | Tamanho | Campo                                      |
| ------ | ------- | ------------------------------------------ |
| 0      | 8       | Magic `ZKVAULT1`                           |
| 8      | 4       | Versão (`6`)                               |
| 12     | 8       | `createdAt` (epoch em ms)                  |
| 20     | 4       | Tentativas da trava exponencial            |
| 24     | 8       | `lockUntil` (epoch em ms; `0` = sem trava) |
| 32     | 1       | Máscara de flags do que vem a seguir       |
| 33     | 4       | `attemptsMaster` (só senha mestra)         |
| 37     | 4       | `nukeLimit` (0 = desligado)                |

O cabeçalho é único e fixo. A v4 tinha no meio um tripo de KDF global que era só
informativo desde a v3 (cada método já carrega o custo do seu Argon2id, e o PIN
precisa ser mais caro que a senha mestra, então um campo só não representava os
dois); a v5 o removeu e ficou com 41 bytes. A v6 não mudou o cabeçalho: passou a
dar identidade autenticada a cada método e a prender o conteúdo de cada arquivo
no manifesto. A v5 e a v6 compartilham o mesmo layout, então a leitura da v5 é o
que alimenta a migração descrita abaixo. Qualquer versão fora de `5` e `6` é
recusada como formato incompatível (fail-closed), em vez de ser classificada
como arquivo adulterado.

Depois do cabeçalho vêm os blocos indicados pelas flags, nesta ordem: chave
embrulhada da senha mestra, do PIN, da frase de recuperação, do **PIN de
coação** e o manifesto. Cada bloco traz
`salt(16) + iv(16) + tag(16) + tamanho(4) + texto cifrado`. Nas versões 5 e 6,
cada método também traz os próprios 12 bytes de parâmetros Argon2id e um salt
de KDF de 16 bytes antes do bloco cifrado. Na v6 o embrulho de cada método usa
`info` de HKDF e AAD do AES-256-GCM próprios (`guardinha-method-<tipo>-v1`),
então um blob copiado para o slot de outro método não decifra; na v5 os dois
eram o rótulo padrão, sem AAD.

## Custo do Argon2id por método

O custo é escolhido na criação e fica gravado no arquivo, por método
(`src/main/crypto.ts`):

| Método                  | Perfil            | Por quê                                           |
| ----------------------- | ----------------- | ------------------------------------------------- |
| PIN (8 dígitos)         | 256 MiB, t=4, p=4 | 10^8 candidatas: é o elo fraco, então o mais caro |
| Senha mestra (24 chars) | 128 MiB, t=3, p=4 | Segredo longo: a entropia já ajuda                |
| Frase (12+ palavras)    | 128 MiB, t=3, p=4 | Segredo longo, escrito pelo usuário               |

A leitura só aceita parâmetros dentro de uma faixa fixa (memória de 16 MiB a
1 GiB, 1 a 8 iterações e 1 a 8 threads). Fora disso o arquivo é tratado como
adulterado: a faixa existe para um `vault.zkv` adulterado não conseguir exigir
memória ou CPU ilimitadas, não como garantia mínima de segurança.

Um método gravado com um perfil mais barato é reembrulhado com o perfil atual
**no desbloqueio em que a própria credencial dele é usada**, desde que o cofre
já esteja na versão atual. Só quem tem a credencial consegue fazer isso, e o
custo sobe sem nunca derrubar o desbloqueio (`refreshMethodKdf`, em
`migration.ts`; best-effort quando falta permissão de escrita). Cofre de formato
antigo não passa por aqui: o login só avisa e a migração explícita reembrulha
todos os métodos de uma vez, com o custo atual.

## Destruição do cofre

O cofre inteiro morre quando os **blobs de chave embrulhada** morrem, porque
eles vivem no `vault.zkv`. Depois disso os `.zke` viram ruído matemático
irrecuperável. É essa a ideia do Cryptographic Erase: não é preciso sobrescrever
gigabytes, é preciso apagar a chave.

`eraseVault` (`src/main/erase.ts`) apaga, nesta ordem e sem desvios:

1. `vault.zkv` e o `vault.zkv.tmp` (o `.tmp` **contém os mesmos blobs de
   chave**; um órfão de crash seria uma cópia completa do embrulho);
2. todo arquivo de `.entries/` (`.zke`, `.zke.tmp`);
3. todo arquivo de `.auth/` (`.zka`, `.zka.tmp`);
4. as pastas `.entries` e `.auth` em si.

Nunca `vaultDir()` nem `.guardinha/`: a raiz é do sistema (`root:root 0711`,
criada no `postinst`) e o app não é dona dela.

Cada arquivo passa por `shredFile` (`src/main/shred.ts`): sobrescrita em blocos
de 64 KiB alternando bytes aleatórios e zeros, terminada em zeros, com
`fsync` antes de fechar, `unlink` e `fsync` do diretório pai. O arquivo é
aberto com `O_NOFOLLOW` e `lstat` recusa symlink e diretório. Falha de shred
**não** impede a autodestruição: quem apaga o arquivo e o diretório conta o
que caiu e o que resistiu, e segue.

Depois do erase, `writeVaultContainer` recusa escrever (`erasure-state.ts`):
sem essa guarda, um `writeAuthState`, um `initManifest` ou um
`VaultContainerData` ainda em memória recriariam um `vault.zkv` pela metade, sem
chave, e o usuário veria "cofre adulterado" onde o certo é "cofre destruído".
Só `createVault` libera a guarda, porque só o usuário cria um cofre novo.

### PIN de coação

O método `panic` do container embrulha uma chave **decoy** de 32 bytes
aleatórios (`decoyKey`, em `unwrapping.ts`), sem relação com a chave real.
Desembrulhar esse método só prova que quem digitou conhece o PIN de pânico; a
chave que sai nunca descriptografou um `.zke`.

Quando o desbloqueio recebe um PIN e o container tem o método `panic`, o app
tenta desembrulhá-lo **antes** de qualquer outra coisa e **sem respeitar a trava
exponencial** (quem está sob coação não tem como esperar 24 h). Se der certo:
a chave da sessão é zerada, o erase roda, e a sessão passa a ser uma sessão
decoy, sem chave nenhuma, em que a lista é vazia e o cofre aparece como
existindo. Se der errado, o fluxo segue como se nada tivesse sido tentado e
**nenhuma tentativa é contada**, para não gerar lockout nem denunciar o
segundo caminho.

O custo do Argon2id do método `panic` é o mesmo do PIN (256 MiB, t=4, p=4):
um desbloqueio por ele custa exatamente o mesmo que um legítimo.

### Autodestruição por tentativas

`attemptsMaster` conta só as falhas da **senha mestra**; falha de PIN e falha
de frase de recuperação não somam nele. Ao cruzar `nukeLimit`, o app chama
`panicDestroy` e o cofre é destruído. `nukeLimit = 0` significa desligado, que
é o padrão, e o piso para ligar é 50. Ver a justificativa em `SECURITY.md`.

### SSD e wear leveling

O Cryptographic Erase é a estratégia primária em SSD porque invalida o acesso
pela chave, não importa para qual bloco físico o controlador moveu a escrita. A
sobrescrita (`shred`) **não é garantia** em SSD: com wear leveling e
over-provisioning a escrita pode ir para outro bloco e o original sobrar no
espaço gerenciado pelo controlador. Sem a chave, o `.zke` é ruído de qualquer
jeito, e é isso que fecha o caso.

O app **não** roda `fstrim`, `fallocate` nem `sfill`: o perfil AppArmor
autoriza escrita apenas dentro de `.vault/**` e nega rede, então essas chamadas
seriam negadas em `enforce`. TRIM é responsabilidade do sistema
(`fstrim.timer` do systemd no Mint), e o Cryptographic Erase não depende dele.

## Credencial salva (`<uuid>.zke`)

Arquivo binário com magic `ZENTRY01`: cabeçalho de 8 bytes (magic) e, em
seguida, `salt(16) + iv(16) + tag(16) + tamanho(4) + JSON cifrado`. A chave de
arquivo é derivada da chave do cofre com HKDF-SHA512 (`deriveEntryKey`), e o
JSON guarda `id`, `title`, `username`, `password`, `domain`, `notes`,
`createdAt` e `updatedAt`.

## Manifesto de integridade

O `vault.zkv` guarda também uma lista cifrada dos ids de credenciais (`ids`) e
de tokens de 2FA (`authIds`) no manifesto, junto do SHA-256 dos bytes de cada
`.zke` e `.zka`. Ao listar, o main compara o manifesto com os diretórios
`.entries` e `.auth`: arquivo removido, injetado ou com conteúdo trocado de
lugar vira um único erro de adulteração, sem detalhes, e nada é carregado
(`src/main/storage.ts`, `verifyManifest`). Trocar o conteúdo de A pelo de B
mantém a lista de nomes, mas muda o digest e é recusado antes da leitura.

## Trava exponencial e auto-lock

- Falhas de desbloqueio somam no campo `attempts` do próprio `vault.zkv`
  (atualizado junto com `lockUntil`), então a trava sobrevive a reinício.
- Atrasos, em ordem: 10 s, 30 s, 1 min, 1 h e depois sempre 24 h
  (`src/main/auth.ts`).
- Sucesso zera as tentativas; o contador também pode ser zerado por teste ou
  pela redefinição de PIN.
- Sem atividade por 5 minutos a chave é zerada e o cofre bloqueia
  (`IDLE_LOCK_MS` em `src/main/activity.ts`). O main notifica o renderer pelo
  evento `vault:auto-locked`; a consulta de status a cada 15 s é apenas uma
  rede de segurança.

## Migração de formato (v5 para v6)

A v5 e a v6 têm o mesmo layout binário; o que mudou foi o **embrulho de cada
método** (HKDF e AAD com o papel do método, `guardinha-method-<tipo>-v1`) e o
**manifesto** (v2, só ids; v3, ids e SHA-256 de cada arquivo). Reembrulhar um
método exige a credencial que o protege, e uma sessão aberta só tem uma. Por
isso a migração é **explícita**: o desbloqueio de um cofre v5 abre normalmente,
sem tocar no formato, e o renderer mostra o `MigrationModal` logo depois.

O aviso nasce de `vault:migration-status` (`getMigrationStatus`, em `vault.ts`):
`needed` é verdadeiro quando a versão lida é menor que a atual (`6`) ou quando a
sessão carrega a marca de migração pendente. A marca é só de memória e cobre o
cofre que o fluxo incremental antigo deixou na v6 com método ou manifesto ainda
no formato velho (`hasLegacyFormat`, em `migration.ts`).

A tela pede a **senha mestra, o PIN e a frase de recuperação** presentes no
container; o PIN de coação fica de fora de propósito, porque a chave dele é
decoy e o cofre não precisa dele para migrar. Quem clica em **Depois** fecha o
aviso e continua no formato antigo; o aviso volta no próximo desbloqueio.

Ao confirmar, `buildMigratedContainer` monta tudo em memória e só depois uma
única gravação substitui o `vault.zkv`:

1. confere o manifesto contra `.entries` e `.auth` (`verifyManifestData`);
2. verifica cada credencial: a chave desembrulhada precisa ser **a mesma** que
   está na sessão, então uma credencial de outro cofre não passa;
3. reembrulha todos os métodos com o custo atual de Argon2id;
4. reescreve cada `.zke` e `.zka` com a chave derivada do cofre e o rótulo de
   HKDF atual (`reencryptRecords`, na fachada);
5. re-sela o manifesto na v3 com os hashes do diretório e marca o container
   como v6.

A migração é **tudo ou nada** para os métodos: credencial errada, manifesto que
não confere ou arquivo adulterado lançam antes de qualquer gravação, o
`vault.zkv` antigo permanece intacto e a sessão continua aberta. Falha de disco
no meio da regravação dos registros também não troca o container, e o que já foi
regravado continua legível com a mesma chave. Depois de uma migração bem-sucedida
a marca pendente é limpa e o toast confirma o fim. A gravação única passa por
`writeVaultContainer`, então o erase continua barrando um cofre destruído.

O snapshot de downgrade (`vault.zkv.v<versão>.bak`) e o caminho incremental
foram removidos: não há mais como abrir um cofre migrado com o app antigo, e a
atualização passa a ser uma decisão do usuário, com as credenciais em mãos, em
vez de uma promoção silenciosa no meio do login.

### Formatos anteriores à v5

Não há caminho de leitura para eles. O que existiu antes (`~/.guardinha-vault`
em JSON, o intermediário em `$XDG_DATA_HOME`, o layout visível `entries/`, o
payload `.enc` e o container v2/v3) foi removido de vez, porque o app ainda não
tinha usuário para proteger.

## Custo do Argon2id

O **custo do Argon2id por método** sobe sozinho: um método gravado com perfil
mais barato é reembrulhado no próximo desbloqueio feito com essa credencial,
porque só quem tem a credencial consegue reembrulhar. A migração explícita de
formato reembrulha todos os métodos de uma vez, então subir o custo e migrar o
embrulho acontecem na mesma passagem, com um Argon2id por método.

## Variáveis de ambiente

| Variável              | Efeito                                                  |
| --------------------- | ------------------------------------------------------- |
| `GUARDINHA_VAULT_DIR` | Caminho completo do diretório do cofre (testes)         |
| `GUARDINHA_VAR_LIB`   | Troca só a base `/var/lib`                              |
| `XDG_CONFIG_HOME`     | Onde fica `guardinha/settings.json` (senão `~/.config`) |

Com qualquer uma das duas do cofre, a criação nunca chama `pkexec`. Os
detalhes de ameaça assumida estão em `SECURITY.md`.
