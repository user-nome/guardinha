# Política de segurança

## Versões suportadas

| Versão | Suporte             |
| ------ | ------------------- |
| 1.6.x  | ✅ Correções ativas |
| 1.5.x  | ✅ Correções ativas |
| 1.4.x  | ✅ Correções ativas |
| 1.3.x  | ✅ Correções ativas |
| 1.2.x  | ✅ Correções ativas |
| 1.1.x  | ✅ Correções ativas |

Versões anteriores ao 1.0.0 não recebem correções; atualize pelo `.deb` mais
recente da Release correspondente (`npm run dist` gera em `release/`).

## Como reportar uma vulnerabilidade

**Não abra issue pública.** Descreva a falha em sigilo para quem mantém o
projeto (ver `author` em `package.json`), incluindo se possível:

- o que acontece e o impacto estimado;
- passo a passo para reproduzir;
- versão do app (campo `version` em `package.json`) e do sistema.

Nos comprometemos a confirmar o recebimento, investigar e, confirmado o
problema, publicar a correção com crédito a quem reportou (salvo pedido em
contrário).

## Proteções já existentes

- **Segredo de 2FA fora do renderer**: o segredo TOTP de um token não é retorno
  de nenhum canal de IPC. O renderer pede o código já calculado
  (`authenticator:codes`) e recebe `{ id, code, remainingMs }`, de modo que a
  chave nunca existe no processo que tem DOM e executa o JavaScript da página.
  O tipo `AuthToken` não tem o campo `secret` justamente para o contrato
  impedir o descuido. O segredo fica em `.vault/.auth/<uuid>.zka`, cifrado em
  AES-256-GCM com um rótulo de domínio HKDF próprio, separado do das
  credenciais.
- **Comprimento mínimo do segredo 2FA**: o cadastro exige pelo menos 128 bits
  (16 bytes) de segredo Base32, o mínimo obrigatório da RFC 4226. A validação
  ocorre no parser compartilhado e novamente no processo main, inclusive para
  entradas enviadas diretamente por IPC. O algoritmo HMAC (SHA-1, SHA-256 ou
  SHA-512) continua definido pelo serviço e não substitui esse requisito.
- **Manifesto cobre os tokens de 2FA**: a versão 2 do manifesto lista também os
  ids de `.auth/`, então apagar um `.zka` ou plantar o próprio derruba a listagem
  com o erro único de adulteração, como já acontecia com as credenciais.
- **Cryptographic Erase (autodestruição do cofre)**: apagar o `vault.zkv` é o
  que destrói o cofre, porque ele é o único lugar onde existe a chave do cofre
  embrulhada. Sem a chave, cada `.zke` vira ruído matemático e o AES-256-GCM
  não tem caminho de volta. O botão de autodestruição na barra lateral, o PIN de
  coação e o limite de tentativas da senha mestra chamam o mesmo caminho
  (`panicDestroy`, em `src/main/vault.ts`), que **zera a chave da RAM antes de
  tocar no disco**: se o disco falhar, a memória já está limpa.
- **Sobrescrita antes do `unlink`**: todo arquivo apagado pelo app (container,
  `.zke`, `.zka` e temporários) passa por `shredFile` (`src/main/shred.ts`),
  que sobrescreve em blocos de 64 KiB alternando bytes aleatórios e zeros,
  termina com a passada de zeros, faz `fsync` antes de fechar (sem isso a
  sobrescrita pode ficar só no cache de página), apaga o nome e sincroniza o
  diretório pai. O arquivo é aberto com `O_NOFOLLOW` e `lstat` recusa symlink e
  diretório, então a sobrescrita nunca é dirigida ao lugar errado.
- **PIN de coação**: um segundo PIN que abre um **cofre vazio** enquanto aciona
  o Cryptographic Erase (`src/main/vault.ts`). Ele embrulha uma chave _decoy_ de
  32 bytes aleatórios, sem relação com a chave real, então nada do que sobrou
  na tela pode ser decifrado. O desbloqueio por ele devolve `ok: true` com lista
  vazia, e não um erro, porque um erro denunciaria o mecanismo a quem está sob
  coação.
- **Login em camadas**: só PIN; a senha mestra só é oferecida após 3 falhas de
  PIN; a frase de recuperação (≥ 12 palavras, escrita pelo próprio usuário)
  serve só para redefinir o PIN; nunca loga. Tentativas erradas disparam
  trava exponencial (10 s → 24 h) persistida em disco.
- **Credencial previsível recusada**: a criação do cofre e a redefinição do
  PIN validam a força da credencial **dentro do processo main** (módulo puro
  `src/shared/strength.ts`; o renderer só repete o mesmo código para o medidor
  ao vivo, nunca é a fronteira): dígito repetido (`00000000`), sequência de
  ponta a ponta (`12345678`), mesmo bloco repetido (`12121212`) e frase com
  quatro palavras distintas ou menos são bloqueados. O resto, como data de
  nascimento, palavra comum e PIN fraco, é orientação no medidor da UI e não
  barra a criação.
- **Chave sempre protegida**: as chaves passam por Argon2id com custo por
  método de desbloqueio, sendo **PIN de 8 dígitos com 256 MB, t=4, p=4** (é o segredo
  fraco, com 10^8 candidatas, então o mais caro) e **senha mestra / frase de
  recuperação com 128 MB, t=3, p=4**. Elas vivem só na memória do processo
  main, dentro do `VaultSessionManager` (Singleton, `src/main/session.ts`),
  que zera o Buffer no lock, no auto-lock de 5 minutos (temporizador do
  `ActivityMonitor`, em `src/main/activity.ts`) e no encerramento do
  app; nunca passam por IPC e nunca aparecem em log. Erros do cofre não ecoam
  senha, PIN ou frase, e o desbloqueio é uma cadeia (`src/main/unlock.ts`) em
  que a trava exponencial corta antes da derivação Argon2id.
- **AES-256-GCM por registro**: cada arquivo usa um salt e um IV aleatórios de
  128 bits, gerados por `crypto.randomBytes` do Node.js. A chave de cada arquivo
  é derivada via HKDF-SHA512; `vault.zkv` (versão 5) guarda cada chave
  embrulhada com o custo do Argon2id daquele método, a trava exponencial, o
  contador de tentativas da senha mestra, o limite de autodestruição e o
  manifesto cifrado. O container aceita somente v5; versões anteriores são
  recusadas como formato incompatível. O custo por método pode ser atualizado
  no desbloqueio em que a credencial correspondente é usada.
- **Integridade fail-closed**: o manifesto cifrado lista os registros; arquivo
  removido ou injetado de fora do app vira um único erro de adulteração, sem
  detalhes: nada é carregado.
- **Cofre fora de `~/`**: `/var/lib/.guardinha/` é `root:root 0711` sem
  listagem (navegar/excluir o topo exige sudo) e o cofre é 0700 com dono
  usuário, sobrevive à limpeza da pasta do usuário e não fica em caminhos
  triviais de backup sincronizado.
- **Senha de administrador fora do app**: a criação da estrutura usa
  PolicyKit (`pkexec` + helper `guardinha-setup` do pacote, ação
  `com.guardinha.keypass.setup-vault`); o diálogo é do sistema e a senha
  nunca passa pelo app nem por IPC.
- **Renderer isolado**: CSP estrita no `index.html`, preload sandboxed
  (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`), sem
  HTML dinâmico; o renderer não acessa disco, rede nem Node; só
  `ipcRenderer.invoke` com contrato tipado (`docs/api.md`).
- **Fronteiras validadas**: ids de registro na IPC precisam de UUID e passam
  por `assertSafeEntryId` (rejeita `/`, `\` e `\0`; defesa em profundidade
  inspirada no CVE-2026-21589); navegação externa só pelos canais
  `shell:open-domain` e o tratador de `window.open`, que recusam protocolo fora
  de `http:`/`https:`.
- **Janela e sessão contidas**: a navegação do renderer fica presa na página do
  app (`will-navigate` recusa salto para outra URL), `window.open` não cria
  janela dentro do app, toda permissão web da sessão é negada no renderer
  (a cópia de credenciais passa pelo canal `clipboard:copy` e usa o clipboard
  nativo no processo main, sem pedir permissão), DevTools está desligado no app
  empacotado e o conteúdo copiado expira sozinho do clipboard após 30 s (salvo
  cópia posterior do usuário).
- **IPC fechado por origem**: todo handler confere `event.senderFrame` contra a
  página oficial do app (scheme `guardinha://` em produção ou dev server do
  Vite), bloqueando a mensagem antes do domínio tocar.
- **Sem `file://` em produção**: o renderer é servido por `guardinha://`
  (handler em `protocol.handle` com path-traversal rejeitado), e o
  `grantFileProtocolExtraPrivileges` está desligado via fuse.
- **Fuses do Electron**: `runAsNode: false`, `NODE_OPTIONS` e inspetor de
  `--inspect` desligados, `enableCookieEncryption: true`,
  `onlyLoadAppFromAsar: true`
  no `electron-builder`.
- **Auditoria contínua**: `npm run security:audit` (OSV Scanner sobre o
  lockfile, filtro em `.osv-scanner.toml`) roda em todo `npm run check`;
  `npm run lint:shell` varre os scripts de empacotamento; o CodeQL roda no CI
  (push/PR para `main` e semanalmente).
- **Publicação sob gate de qualidade**: o workflow que gera e publica o `.deb`
  tem um job **Verificar qualidade** (`npm run check` + `npm test`) e o job de
  publicação só roda se ele passar. Erro de tipo, lint, formato, auditoria OSV,
  shellcheck ou teste reprovado interrompe a Release, então nada quebrado chega
  ao `.deb` que o usuário instala.
- **Sem servidor intermediário**: o app não abre conexão de rede alguma: não
  há endpoint do Guardinha a atacar; credenciais nunca saem da máquina.
- **Confinamento AppArmor**: o `.deb` inclui um perfil restritivo em
  `/etc/apparmor.d/guardinha` (origem `build/apparmor-profile`, declarado em
  `build.deb.appArmorProfile`) sobre o executável
  `/opt/Guardinha/guardinha`, quando AppArmor está ativo e aceita o perfil. Ele
  nega leitura de arquivos do usuário, nega
  escrita fora dos diretórios do app, do cofre e do `$XDG_CONFIG_HOME` do
  app, nega rede `inet`/`inet6` e também `raw`, `packet` e `bluetooth` (só
  `unix` e `netlink`, já que o app é offline; as três negações explícitas
  existem para o fechamento não depender do padrão da mediação de rede, que
  muda de versão para versão) e nega execução de qualquer binário fora da lista
  curta do pacote (`chrome-sandbox`, `chrome_crashpad_handler`) e dos dois
  helpers do sistema (`pkexec`, `xdg-open`). Ele abre o socket do método de
  entrada do próprio usuário (`~/.cache/ibus/dbus-*`), que
  `<abstractions/ibus>` não cobre: sob `GTK_IM_MODULE=ibus` (o padrão do
  Cinnamon no Mint) o campo de texto fica mudo em `enforce` sem essa regra,
  porque o IME recusa a conexão e a tecla não volta como caractere.

  A instalação é em dois estágios, porque o AppArmor não tem compilação
  condicional por versão: o postinst compila o perfil sem carregar
  (`--skip-kernel-load -K`, com os avisos `rule-not-enforced` e
  `rule-downgraded` no log) e só copia o que a versão instalada aceita; se o
  kernel recusar o carregamento, o arquivo recém-instalado é removido, para o
  `apparmor.service` não falhar no boot seguinte. Ambientes sem suporte (Ubuntu
  22.04, que não conhece `abi/4.0`) continuam sem esse confinamento adicional,
  com o app rodando como qualquer Electron. A cópia para `/etc/apparmor.d` é
  atômica (temporário e `mv`), então um disco cheio no meio da escrita não
  deixa um perfil truncado para o próximo boot.

## Riscos aceitos (com justificativa)

- **Força bruta offline em `vault.zkv`**: quem já consiga ler o arquivo pode
  testar candidatas fora do app, e a trava exponencial (10 s → 24 h) só vale
  dentro dele: não há como o arquivo impor limite de tentativas por si só.
  Mitigado por Argon2id caro por tentativa: o PIN de 8 dígitos é o elo mais
  fraco e por isso custa 256 MB / t=4 (cerca de 5× os 64 MB / t=3 antigos),
  o que leva uma varredura completa de 10^8 candidatas de horas (da ordem de
  17 h numa RTX 4090 no custo antigo) para dias em GPU e semanas num desktop
  moderno; senha mestra (24 caracteres) e frase (12+ palavras) têm entropia
  própria e ficam em 128 MB / t=3. O PIN de 8 dígitos continua sendo o limite
  aceito desse cofre.
- **A trava exponencial protege contra o app, não contra o disco**: o campo
  `attempts` do `vault.zkv` mora num arquivo com dono usuário, então quem já
  tenha o arquivo pode zerá-lo e chutar à vontade. A trava serve para conter
  tentativas pela interface do app (e recusa a espera sem nem chegar a rodar o
  Argon2); a defesa real contra atacante com o arquivo e tempo ilimitado é o
  custo do Argon2id, medido em ~2,1 s por chute de PIN com a máquina quieta
  (sob carga do desktop a medição sobe para ~4 a ~16 s, nunca para baixo).
  Nada a mudar no código: trava online mais KDF caro é o modelo correto, e a
  trava não é considerada barreira de segurança contra leitura do disco.
- **Chave em memória enquanto o cofre está aberto**: com o cofre destravado,
  qualquer código rodando como o mesmo usuário lê `/proc/<pid>/mem` e
  recupera a chave de 32 bytes. Inerente a aplicativo desktop com cofre local
  (não há TPM nem cofre de hardware no alvo). Mitigado por zerar a chave no
  lock manual e no auto-lock de 5 minutos, o que limita a janela de exposição;
  rodar como outro usuário já está fora do escopo (abaixo).
- **`/usr/bin/xdg-open` sai do confinamento**: para `shell.openExternal` (o
  botão que abre o domínio da credencial no navegador) funcionar, o perfil
  concede `ux` ao abridor do sistema: a cadeia inteira (shell, `gio`,
  `gio-launch-desktop` e o navegador) roda sem confinamento depois da execução.
  Sem isso o wrapper do navegador é negado e o recurso quebra. O que isso
  entrega a um atacante que já rode dentro do app é abrir um endereço ou um
  tipo de arquivo já registrado no sistema (o mesmo que o próprio app faz);
  não há como criar o handler pelo perfil, pois escrever em
  `~/.local/share/applications` continua negado. Aceito por ser o único caminho
  suportado para abrir URLs no Linux sem reescrever o mecanismo do sistema.
- **`GUARDINHA_VAULT_DIR` / `GUARDINHA_VAR_LIB`**: variáveis de ambiente
  redirecionam o cofre (usadas por testes e `npm run dev`). Quem controla o
  ambiente do processo do usuário já está no mesmo nível de ameaça que a chave
  em memória, sem ganho adicional para um atacante local.
- **Dependências sem fix upstream**: problemas em dependências sem versão
  corrigida publicada são documentados com data de revisão em
  `.osv-scanner.toml` e voltam a aparecer no `security:audit` quando a data
  passa, monitorados a cada `npm run check`.
- **Sem TRIM sob demanda**: o app não chama `fstrim`, `fallocate` nem `sfill`.
  Não é limitação, é decisão: o perfil AppArmor (`build/apparmor-profile`)
  autoriza escrita apenas dentro de `.vault/**` e nega rede, então qualquer
  dessas chamadas seria negada em `enforce`. TRIM é do sistema
  (`fstrim.timer` do systemd, ativo por padrão no Linux Mint), e o
  Cryptographic Erase não depende dele: apagar a chave funciona com ou sem
  TRIM. Se algum dia valer a pena, o caminho seria um helper com PolicyKit
  como o `guardinha-setup` (`src/main/privilege.ts`), com ação `.policy` própria,
  e o custo/benefício precisaria ser medido antes.
- **O PIN de pânico não passa pela trava exponencial**: é uma escolha
  consciente, feita na direção de quem está sob coação. Um PIN de pânico que
  só funcionasse fora da janela de trava seria inútil na hora em que seria
  preciso. O efeito colateral aceito: o PIN de pânico é um caminho de
  desbloqueio que **não conta tentativa**, então ele nunca gera lockout e nunca
  denuncia a existência de si mesmo por aumento de contador. Ele paga a mesma
  derivação Argon2id do PIN (256 MiB, t=4, p=4) no método panic, mas o tempo
  total do fluxo não é igual: `unlock` tenta o pânico antes da cadeia normal,
  então um PIN comum (certo ou errado) paga duas derivações quando o pânico
  existe, e o PIN de pânico paga uma. Na prática, medir uma tentativa errada
  revela se o cofre tem PIN de pânico configurado. Igualar o custo exige uma
  derivação descartável no caminho do pânico (ou outro desenho), decisão ainda
  não tomada porque acrescenta custo justamente na hora da coação.
- **A autodestruição por tentativas é desligada por padrão**: `nukeLimit` vale 0
  num cofre novo, e o piso de habilitação é 50 (não 5). É decisão de produto
  registrada, não omissão: apagar o cofre por contagem é uma lâmina sem ponta
  para o usuário, porque cinco erros de digitação levariam à perda definitiva
  e **a frase de recuperação não salva**, já que o arquivo que a embrulha é
  apagado junto. Quem liga, liga sabendo, em Configurações, depois de ler o
  aviso.
- **Senha decifrada em `string` imutável do V8**: `Credential.password` é
  `string` (`src/types/vault.ts`), e `decryptRecord` (`src/main/crypto.ts`)
  materializa a senha em uma string que **não pode ser zerada**: `fill(0)`
  existe para `Buffer`, e a V8 guarda a string imutável no heap, com possível
  cópia em garbage collector e nos snapshots de heap usados pelo devtools. Só o
  `Buffer` de 32 bytes da chave (`VaultSessionManager.wipe`) e as chaves de
  trabalho derivadas (`fill(0)` nos `finally` de `unlock.ts`,
  `unwrapping.ts`, `vault.ts` e `crypto.ts`) são realmente apagados. Aceito
  porque o atacante do mesmo usuário que já leu a memória do processo lê também
  a string; zerar a chave não fecharia esse caminho sozinho.
- **`entries:list` entrega todas as senhas ao renderer**: o canal
  `entries:list` (`src/main/entries.ts`) devolve a lista inteira de credenciais
  **decifradas** ao processo renderer, que é um segundo processo com cópia em
  memória fora do controle do `VaultSessionManager`: o `wipe` zera a chave do
  main, mas não as strings que já foram copiadas para lá. Aceito porque o
  renderer precisa exibir os dados e porque os dois processos compartilham o
  mesmo uid (mesmo nível de ameaça de `/proc/<pid>/mem`, já listado acima);
  fechar isso exigiria não entregar a lista inteira e mudar a UX da grade.
- **A auditoria de dependências não é garantia**: `npm run security:audit`
  (OSV Scanner) e o CodeQL varrem o lockfile e o código, e nenhum dos dois
  detecta dependência sem CVE conhecido que seja maliciosa por desenho. O
  risco real continua sendo o código empacotado em `out/`, que sai de
  `package-lock.json` e do build local.
- **A sobrescrita não é garantia em SSD**: o Cryptographic Erase é a estratégia
  primária justamente porque invalida o acesso pela chave, independentemente de
  para onde o controlador de wear leveling moveu o bloco físico. Já a
  sobrescrita (`shredFile`) **não é garantia** em SSD: com wear leveling e
  over-provisioning, a escrita pode acabar em outro bloco físico e o conteúdo
  antigo sobrar no espaço que o controlador gerencia. Em disco rotacional
  (HDD) a sobrescrita é a defesa; em SSD ela é higiene. Sem a chave do cofre, o
  `.zke` é ruído de qualquer forma, e é isso que fecha o caso.
- **Sem `mlock`: a chave pode ir para swap**: o Node não expõe `mlock` sem
  extensão nativa, então a chave de 32 bytes fica em memória paginável e o
  kernel pode escrevê-la em swap ou em arquivo hibernado. Travar a página
  exigiria `libsodium-wrappers` ou um addon nativo, com o custo colateral em
  `.osv-scanner.toml`, `THIRD-PARTY-NOTICES.txt` e no perfil AppArmor. Decisão:
  **não fazer**; o ganho é pequeno (quem tem o mesmo usuário já lê
  `/proc/<pid>/mem`, e quem controla o swap controla a máquina) e o custo é
  grande (dependência nativa,surface de ataque e empacotamento). Swap
  criptografado permanece como mitigação do sistema.

## Fora de escopo

- Engenharia social, phishing, spam e ataques a serviços de terceiros
  (GitHub, npm, sites abertos pelo navegador).
- Falhas que exijam acesso físico ao PC já desbloqueado ou malware rodando
  como o próprio usuário (mesmo nível de ameaça da chave em memória).
- **Esquemas de 2FA fora do padrão TOTP**, como o Steam Guard (5 caracteres
  alfanuméricos de alfabeto customizado) e códigos por SMS ou e-mail. O app
  implementa o `otpauth://totp` da RFC 6238 e recusa qualquer outra coisa, em
  vez de mostrar um número que o serviço não aceitaria.
