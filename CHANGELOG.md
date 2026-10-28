# Registro de mudanças

Todos os lançamentos seguem [versionamento semântico](https://semver.org/lang/pt-BR/)
(`MAJOR.MINOR.PATCH`) e o formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
em português do Brasil.

## [2.3.1] - 2026-10-27

### Corrigido

- Removendo um pouco de comentarios do codigo e atualizando 2 dependencias.



## [2.3.0] - 2026-10-27

### Adicionado

- **Migração automática do cofre v5 para a v6.** A 2.2.1 passou a gravar o
  container na v6 e o manifesto na v3, mas recusava os cofres anteriores. Agora
  a v5 é lida e migrada no desbloqueio: o método usado é reembrulhado com a
  identidade própria (`guardinha-method-<tipo>-v1`), o manifesto é re-selado com
  os hashes de conteúdo e o container sobe para a v6. Cada um dos outros
  métodos migra no desbloqueio da própria credencial, porque reembrulhar exige
  a credencial em mãos; um cofre meio migrado abre normalmente.
- **Snapshot de downgrade antes da primeira migração.** `vault.zkv.v<versão>.bak`
  é gravado em `0600` e nunca sobrescrito. Se a versão nova tiver um defeito,
  restaurar esse arquivo por cima do `vault.zkv` devolve o cofre ao app antigo.
  O Cryptographic Erase apaga o snapshot junto com o resto.
- **A migração não derruba o desbloqueio.** Manifesto que não confere com o
  diretório ou falha de escrita adiam a migração e deixam o container antigo
  intacto. No desbloqueio, se o snapshot não puder ser criado, a migração é
  abortada; na redefinição de PIN, o novo PIN é gravado mesmo assim e a falha
  fica no log.

### Corrigido

- **Segredo de 2FA de 80 bits voltou a ser aceito.** Serviços que emitem chave
  de 16 caracteres Base32 (80 bits) voltaram a ser aceitos; o piso de 128 bits
  introduzido na 2.0.1 recusava essas chaves com a mensagem de que precisam de
  pelo menos 128 bits. O piso volta a 80 bits, como na 1.7.1 a 1.9.1, e a tela
  passa a avisar quando a chave fica abaixo do mínimo da OWASP (128 bits) e do
  recomendado (160 bits), sem bloquear o cadastro.

## [2.2.1]

### Alterado

- **Container na versão 6 e manifesto na versão 3.** Cada método de desbloqueio
  passou a ter `info` de HKDF e AAD do AES-256-GCM próprios
  (`guardinha-method-<tipo>-v1`), então copiar o blob de um método para o slot
  de outro não decifra. O manifesto agora guarda o SHA-256 dos bytes de cada
  `.zke` e `.zka`, além dos ids, e a listagem recusa conteúdo trocado entre
  arquivos existentes. Não há migração: cofres das versões anteriores são
  recusados como formato incompatível, como já era a regra do projeto.
- **Restauração por cima de cofre existente exige sessão aberta.** O pacote
  `.gbk` continua sem assinatura, mas um cofre já bloqueado não é mais
  substituído por um arquivo forjado. Numa máquina sem cofre, a restauração
  segue livre.
- **Operações do cofre serializadas.** `createVault`, `unlock`, `resetPin`,
  `setPanicPin`, `clearPanicPin`, `setNukeLimit` e `panicDestroy` passam por uma
  fila de promessas, para que duas chamadas concorrentes não percam uma
  tentativa contada nem uma troca de PIN.
- **Domínio para abrir no navegador só aceita `https://`.** `http://` passou a
  ser recusado também na validação de formato, e não só na hora de abrir.

## [2.0.1] - 2026-10-22

### Alterado

- **Segredo de 2FA passou a exigir 128 bits.** O piso subiu de 80 bits (10
  bytes, 16 caracteres Base32) para 128 bits (16 bytes, 26 caracteres), o
  mínimo obrigatório da RFC 4226. Serviços que ainda emitem segredo de 16
  caracteres deixam de ser aceitos; a mensagem de erro e a documentação foram
  atualizadas junto.
- **Instalação do `.deb` endurecida.** O postinst faz o dry run do perfil do
  AppArmor com `--skip-kernel-load -K` e os avisos `rule-not-enforced` e
  `rule-downgraded` (o parser ignora em silêncio a regra que o kernel não
  aplica, e isso não chegava ao log), grava o perfil e a ação do PolicyKit por
  troca atômica e, se o kernel recusar o perfil já compilado, remove o arquivo
  em vez de deixar o `apparmor.service` quebrar no próximo boot. O link do
  executável ganhou diagnóstico: o `update-alternatives` mantém um arquivo real
  em `/usr/bin/guardinha` (é o que o manual manda fazer sem `--force`) e antes
  o atalho do sistema abria outro programa sem aviso; o caminho de link direto
  também deixou de sobrescrever arquivo de outro pacote.
- **Perfil do AppArmor mais fechado.** `network raw`, `packet` e `bluetooth`
  passaram a ser negados de forma explícita, ao lado de `inet`/`inet6`: o
  fechamento deixa de depender do padrão da mediação de rede, que muda de
  versão para versão. O cabeçalho do perfil documenta o gate de instalação e os
  despejos do wiki (`--preprocess` e `--skip-kernel-load --debug`).
- **`after-pack` valida o que não pode faltar.** O hook confere
  `libffmpeg.so`, `chrome-sandbox` e `resources/app.asar` depois das remoções,
  então uma entrada errada na lista de arquivos a apagar quebra o build em vez
  de gerar um `.deb` que não abre. Ele também não morre mais se `locales/`
  sumir de uma versão futura do Electron.
- **`libsecret-1-0` entrou nas dependências do `.deb`.** É a lista padrão do
  electron-builder e é o backend de chaveiro que o fuse `enableCookieEncryption`
  procura; sem ele o Chromium cai para cookie sem cifra. O app não usa cookie
  nem rede, então era peça faltando no pacote, não correção de defeito visível.
- **Dependências atualizadas para as versões estáveis mais recentes.** Electron
  45.0.0 (Chromium 156, Node 24.22.0), `electron-vite` 6.0.0 (a faixa saiu do
  beta), `eslint` 10.13.0, `typescript-eslint` 8.72.0, Vite 8.3.5,
  `electron-builder` 26.18.0, `lucide-react` 1.61.0, Vitest 5.0.5, Tailwind
  4.3.3, jsdom 30.1.3 e Prettier 3.9.10. O TypeScript ficou no 6.0.3 porque o
  `typescript-eslint` declara paridade abaixo de 6.1, e o linter é parte do
  `npm run check`: sem `--legacy-peer-deps`, nenhuma versão da série 7 instala.
  Nenhuma versão `beta`, `alpha` ou `rc` entrou na árvore.
- **A configuração do build trocou `rollupOptions` por `rolldownOptions`.** O
  Vite 8 builda com Rolldown e marca o nome antigo como deprecated; o
  `electron-vite` 6.0.0 já normaliza o nome novo.
- **Colunas dos cartões pela largura da janela.** As grades do Início e do
  Verificador 2FA deixaram de usar _container query_ (que mediava a coluna de
  conteúdo, limitada a `max-w-6xl`, e por isso nunca passava de duas colunas)
  e passaram a contar a janela: uma coluna até 767 px, duas dali até 1535 px e
  três acima disso. O cartão do token é o mais largo da casa, então ele só vira
  três colunas em 1536 px; o da credencial aceita a terceira em 1280 px. A regra
  mora em um lugar só (`src/renderer/src/card-grid.ts`).
- **Janela mais estreita.** O `minWidth` caiu de 520 px para 400 px, que é a
  largura em que a grade já é uma coluna e a Sidebar já é o trilho de ícones.
- **Cobertura de 100%.** O piso de linhas, comandos, funções e ramos subiu de
  95% para 100% em `vitest.config.mts`. Os últimos ramos ou saíram do código
  (índice preso a uma união de literais em `strength.ts`, `charAt` no lugar do
  índice de string no gerador, separador do `otpauth://` fatiado pelo `index`,
  largura da faixa lida do `currentTarget` no slider, exclusão sem `entry`
  nulo no modal de credencial) ou ficaram com `/* v8 ignore next */` e o motivo
  ao lado, quando a guarda só cobre um estado que a interface impede.

### Adicionado

- **Suíte de segurança com oráculo independente.** `tests/security/` tenta
  quebrar as garantias do cofre sem passar pelas funções do app: Argon2id
  conferido contra um vetor conhecido, HKDF-SHA512 e AES-256-GCM refeitos com o
  próprio Node, adulteração de cada campo do registro, ataques ao desbloqueio,
  ao manifesto e à ordem do erase. O atalho `npm run test:security` roda só essa
  suíte, e o mapa de `docs/testes.md` foi atualizado.

### Corrigido

- **O `postrm` desmontava o app na atualização.** O `after-remove.sh` rodava em
  qualquer ação do dpkg, inclusive `upgrade` (o postrm da versão antiga sai
  antes de o postinst novo entrar), e tirava o perfil do AppArmor e a ação do
  PolicyKit no meio da atualização: o app ficava sem confinamento até o postinst
  e, se ele falhasse, sem como criar o cofre. Agora só `remove`, `purge` e
  `disappear` desmontam, e o symlink do caminho sem `update-alternatives`, que
  ficava apontando para um `/opt` já apagado, é limpo.
- **`guardinha-setup` seguia ligação simbólica.** O helper roda como root pelo
  `pkexec` e o `install -d` segue symlink: um `/var/lib/.guardinha` plantado
  levava o `chown`/`chmod` para outro lugar. Ele agora recusa symlink nos dois
  níveis antes de tocar em qualquer coisa.
- **Vazamento de memória a cada desbloqueio.** O `hash-wasm` monta uma
  instância WebAssembly nova por derivação (256 MiB no perfil do PIN) e o V8
  não coleta essa memória sozinho, porque ela é externa ao heap JS: o processo
  crescia cerca de 256 MB por desbloqueio até o OOM da máquina. O
  `src/main/crypto.ts` agora coleta ao fim de cada derivação, com o RSS estável
  perto de 100 MB, e a saída passou a ser binária para não deixar uma cópia da
  chave numa string imutável no heap. A derivação é a mesma: o
  `tests/main/crypto.test.ts` fixa o vetor do Argon2id, para que uma troca de
  implementação não passe verde e quebre os cofres já gravados.
- **Trava exponencial sem saída com estado adulterado.** Um `lockUntil` além do
  maior degrau legítimo (24 h) só aparece com o campo adulterado ou com o
  relógio recuado, mas era respeitado como espera e prendia o cofre para
  sempre. `getLockRemainingMs` agora trata esse valor como trava vencida, sem
  reescrever o que está gravado.

### Notas

- **A série 2.x começa pela compatibilidade do segredo de 2FA.** O piso de 128
  bits vale na gravação: tokens já salvos com 16 caracteres Base32 continuam
  gerando código, mas um token novo ou editado exige um segredo maior, e o
  serviço que só emite chave curta fica de fora. Foi a mudança que quebrou
  compatibilidade e justificou o salto de versão.

## [1.9.1] - 2026-10-19

### Alterado

- **Constantes centralizadas.** Números mágicos espalhados pelo código (tempos de
  trava, tetos de gerador, parâmetros do TOTP, passadas de shred, limites da
  autodestruição) foram extraídos para módulos dedicados em `src/main/`,
  `src/shared/` e `src/types/`. Cada constante agora tem um nome semântico e
  comentário explicando a origem, facilitando auditoria e ajustes futuros.
- **Formatos de disco documentados.** O layout binário do `vault.zkv` e do
  `.zke` passou a viver em `src/main/container-format.ts`, com offsets e
  tamanhos nomeados; o formato do backup `.gbk` em `src/main/backup-constants.ts`.
- **Tipagem enxuta.** Tipos inline complexos, asserções `as unknown` e uniões
  anônimas foram movidos para `src/types/` onde atravessam o IPC ou são
  compartilhados entre `main` e `renderer`; o que é local de um módulo ficou no
  próprio arquivo.

### Adicionado

- **Testes para as novas constantes.** `tests/main/backup-constants.test.ts` e
  `tests/shared/otp-constants.test.ts` garantem que os valores exportados
  existem e têm o formato esperado.
- **Módulos `time.ts`, `crypto-constants.ts`, `container-format.ts`,
  `generator-constants.ts`, `auth-constants.ts`, `window-constants.ts`,
  `backup-constants.ts`, `otp-constants.ts`.**

## [1.8.1] - 2026-10-17

### Adicionado

- **Personalização do gerador de senhas nos testes E2E.** A jornada compilada
  confere quantidades por classe, inclusão literal de palavras pessoais e o
  limite combinado de 40% para opções manuais.

### Corrigido

- **Destino do container na restauração do backup.** O arquivo `vault.zkv`
  também usa o resolvedor central de caminhos ao ser gravado, mantendo o
  container como último arquivo restaurado.

## [1.7.3] - 2026-10-17

### Alterado

- **Chave nova assinando o repositório APT.** A chave anterior foi perdida junto
  com a frase, então o `Release`, o `InRelease` e o `public.key` desta versão
  saem da chave `5C1451B1A06DED7ECC2A2AD908BC89E300B40CF7`. Quem já tem o
  repositório no APT precisa repetir a linha do `public.key` do `README.md` e
  depois rodar `sudo apt update`, porque o keyring antigo não valida a assinatura
  nova. O aplicativo em si não muda nesta versão.

### Corrigido

- **Publicação do `.deb` travada antes de começar.** O `npm ci` dos jobs do
  `publish.yml` morria com `ERESOLVE` porque o Dependabot tinha subido o
  TypeScript para a série 7, fora da faixa de peer do `typescript-eslint`, e sem
  isso nenhum `.deb` era gerado.
- **Erro do passo de assinatura do APT.** A falha de pré-verificação acusava
  "GPG_PASSPHRASE incorreto (ou secret ausente)" para qualquer erro de
  assinatura; agora ela diz o que fazer em cada caso.
- **Frase da chave fora do `argv`.** O passo do repo APT entregava a frase do
  secret ao gpg por `--passphrase`, o que a deixava legível no processo. Agora
  ela vai por `--passphrase-file`, num arquivo temporário apagado no fim.

## [1.7.2] - 2026-10-16

### Adicionado

- **Cobertura E2E ampliada.** A jornada do app compilado agora verifica
  validações, busca, edição e exclusão de credenciais, opções do gerador,
  tokens TOTP, backup e restauração, configurações de segurança e caminhos de
  desbloqueio. O auto-lock faz parte da suíte completa, e a ausência do artefato
  empacotado causa uma falha explícita em vez de pular os testes.

### Corrigido

- **Retorno à tela inicial após bloqueio ou restauração.** A aba ativa volta
  para Início quando o cofre fica bloqueado, evitando reabrir uma tela interna
  após o desbloqueio.
- **Teste de geração de senha.** O E2E aguarda o resultado atualizado antes de
  verificar o comprimento e as categorias selecionadas.

### Alterado

- **Autoria e mantenedor do pacote.** As atribuições da interface e o campo
  `maintainer` do `.deb` passam a nomear **Otaku Delirante**, e as referências
  ao dono dos binários de `bin/` e ao repositório do projeto de apoio usam o
  usuário `user-nome`, o mesmo já usado no repositório e no e-mail de release.
  Os dados dos testes (`otaku-delirante` no lugar de `chronos-atalante`) são só
  fixtures.
- **Tipos compartilhados e validação de dados.** `Argon2Params` e
  `SaltedPayload` agora ficam em `src/types/`, os registros decifrados são
  tratados como `unknown` até a validação e os guards substituem asserções
  frágeis nas fronteiras de dados.

### Documentação

- **Guia E2E atualizado** com os fluxos cobertos, o auto-lock obrigatório e a
  exigência de gerar o `.deb` antes de executar a suíte completa.

## [1.7.1] - 2026-10-16

### Adicionado

- **Backup e restauração do cofre num pendrive.** O cofre inteiro, já cifrado,
  vira um arquivo único (`.gbk`) com manifesto e SHA-256 por arquivo, e a nova
  aba **Backup** salva e restaura esse pacote. A restauração existe também na
  tela de criação do cofre, para o caso de quem formatou a máquina e quer voltar
  ao cofre antigo sem criar um vazio antes. Nada é decifrado para copiar: quem
  achar o pendrive ainda precisa do PIN ou da senha mestra, e o pacote é
  validado por inteiro (magic, versão, digest global e cada SHA-256) antes de o
  cofre atual ser tocado.

### Corrigido

- **O segredo de 2FA do GitHub era recusado.** O piso de tamanho estava em 128
  bits (16 bytes), e o serviço emite segredo de 16 caracteres, ou seja, 80 bits
  (10 bytes): colar o `otpauth://` do GitHub, do Google, do Discord, da AWS ou
  da Coinbase era recusado com "chave precisa ter pelo menos 128 bits", sem
  chance de resolver, porque a pessoa não tem como pedir um segredo maior ao
  serviço. O piso agora são 80 bits. Para esbarrar num código de 6 dígitos por
  força bruta seria preciso adivinhar um em um milhão dentro da janela de 30 s,
  com o segredo trocando a cada período.
- **A construção do `.deb` no CI morria sem token do GitHub.** Os scripts
  `dist` e `dist:dir` passaram a chamar o electron-builder com
  `--publish never`: num runner, a detecção de CI faz o electron-builder
  tentar publicar sozinho ("Implicit publishing") e o job "Testes E2E" caía com
  `GitHub Personal Access Token is not set` mesmo com a Release perto de
  succeeding.

### Segurança

- **O `publish.yml` confere a chave que assina o repo APT pela impressão
  digital.** A impressão ficou num único lugar (`GPG_FINGERPRINT`, no `env` do
  workflow) e as três assinaturas usam `--local-user`: se o secret e o valor do
  workflow divergirem, o job morre na checagem com `::error::` antes de subir
  qualquer asset, em vez de assinar com a chave errada em silêncio.

### Alterado

- **O repositório passou a ser `user-nome/guardinha`**, com o `Origin` e o
  `Label` do repo APT como `Guardinha` e o e-mail de release
  `user-nome@users.noreply.github.com`.
- **Dependências atualizadas** dentro das faixas já declaradas: Electron
  44.8.0, `electron-vite` 6.0.0 (saiu do beta), React 19.3.1, Vitest 5.0.5,
  jsdom 30.1.3, lucide-react 1.58.0. O TypeScript ficou no 6.0.3 porque o
  `typescript-eslint` declara paridade abaixo de 6.1, e o linter é parte do
  `npm run check`.
- **A auditoria de licença aprendeu a declarar, e não a congelar.** O scanner
  resolve licença pela API do deps.dev, que ainda não tinha registro do
  `caniuse-lite` 1.0.30001816 (cuja licença é a mesma `CC-BY-4.0` da versão
  anterior, conferida no tarball). A licença passa a ser declarada em
  `.osv-scanner.toml`, com validade e motivo, em vez de prender a dependência
  numa versão antiga por causa de uma lacuna de dado.

### Documentação

- **`docs/build.md`: a chave que assina o repo APT.** Procedimento de rotação
  (gerar, exportar, trocar `GPG_FINGERPRINT`, sobrescrever os secrets) e o
  registro de que essa chave não assina commit: a assinatura de commit está
  desligada de propósito, para o trabalho no dia a dia não depender de chave
  privada com frase.
- **`docs/testes.md`**: o arquivo `tests/main/entrypoint.backup.test.ts` entrou
  no mapa da suíte.

### Notas

- Cobertura em 100% das linhas, 99,72% dos comandos, 99,68% das funções e 98,24%
  dos ramos (limiar de 95% nos quatro, em `vitest.config.mts`).

## [1.6.3] - 2026-10-14

### Corrigido

- **A recusa de IPC saía sempre em português.** A guarda de origem do frame
  montava a mensagem com texto fixo no código, então quem estivesse no inglês,
  no coreano ou no japonês veria o erro no idioma do Brasil. Agora ela sai do
  bundle, como todo erro do processo principal.

### Alterado

- **Nenhum texto de erro fica mais escrito dentro do código.** As invariantes
  internas (`containerCorrupted`, `invalidManifest`, `invalidKdfParams`,
  `unknownUnlockMethod`, `truncatedDigest`, `shortPhrase`) passaram a vir do
  bundle de mensagens. O caminho normal continua convertendo quase todas em
  "cofre adulterado" ou "PIN incorreto" antes de a tela ver qualquer coisa; o
  que muda é que a regra de que todo erro emitido pelo processo principal sai
  de `src/messages/` passa a valer sem lista de exceções.
- **Respostas do servidor `guardinha://`:** os corpos de erro estavam
  misturados, com `Forbidden` em inglês ao lado de `Não encontrado.` e `Erro` em
  português. Viraram frases de status do protocolo, em inglês e literais: é
  transporte, não interface, e quem chega ali é o carregador de asset, não a
  tela.

### Documentação

- **Índice da documentação em `docs/README.md`.** O arquivo era citado por
  cinco documentos, inclusive pelo `README.md` da raiz, mas não existia. Agora
  existe e reúne os onze guias técnicos.
- **Números conferidos contra o repositório:** a suíte tem 64 arquivos de teste
  e não 51, e a tabela agora lista os 13 que faltavam; são oito jobs de CI, e
  não sete; o pin do `upload-artifact` é v7.0.2; a tabela de versões suportadas
  do `SECURITY.md` voltou a listar a 1.2.x; o placar da varredura de mutação é
  69,4%, e não 70,2%.
- **Comentários que descreviam o contrário do código:** a pasta de credenciais
  é `.entries` e não `entries`; o botão de autodestruição fica logo abaixo do
  bloqueio, e não "longe" dele; o workflow de qualidade fala da porta de 95% de
  cobertura, que é a que o `vitest.config.mts` impõe.
- **Fluxo de contribuição:** a seção de envio de mudança agora diz para criar o
  branch a partir da `developer`, que é de onde os workflows disparam, e não da
  `main`.

## [1.6.2] - 2026-10-13

### Corrigido

- **A cadeia de desbloqueio não parava no corte da autodestruição.** Quando a
  senha mestra cruzava o limite estrito, a cadeia devolvia "passe adiante" em
  vez de "pare", então o Argon2id rodava mesmo assim e a tentativa era contada
  duas vezes. Isso encurtava um degrau da trava exponencial por erro do usuário.
- **A credencial copiada não sumia do clipboard ao encerrar o app.** O
  temporizador de limpeza morre junto com o processo, então sair do aplicativo
  deixava a senha no clipboard do sistema indefinidamente. A limpeza agora
  acontece na hora tanto na destruição do cofre quanto na saída.
- **O `resetPin` podia deixar a chave de trabalho na memória.** Se o
  desembrulho da frase falhasse, o `Buffer` derivado não era zerado. Agora a
  limpeza está no `finally`.
- **O `fs` saiu do arquivo de janela e IPC para módulos próprios**, e a regra de
  fronteira passou a ser conferida pelo lint: ele recusa `fs` fora da lista de
  módulos autorizados e recusa `fs` e `child_process` no renderer e no preload.
- **Testes que mediam o mutante errado.** O cache de módulos transformados do
  Vitest revalidava o texto do mutante anterior, então, a partir do segundo
  mutante de cada arquivo, a suíte rodava contra o código errado e o veredito
  saía "sobreviveu" sem ter sido medido. O placar de mutação de um arquivo
  caía sozinho conforme a varredura avançava.

### Adicionado

- **Testes de mutação no repositório e medição contínua.** A varredura é uma
  ferramenta de desenvolvimento que roda por push na `developer`, uma vez por
  mês e por disparo manual, com o score no resumo da execução. Também é usada
  aqui para achar buraco de teste: foi ela que mostrou que a fronteira de
  origem do IPC não notificava a perda de sessão e que a varredura de
  temporários não contava o arquivo que sobrou depois da sobrescrita.
- **Medição de performance dos testes de interface.** O teto padrão de espera
  do Testing Library passou a ser 15 s, calibrado para uma suíte em que os
  testes do processo principal derivam chaves com Argon2id de produção.

### Alterado

- **Meta de cobertura de 90% para 95%** em linhas, comandos, funções e ramos.
  A varredura de mutação mostrou que os ramos que faltavam eram os de decisão
  (cofre ausente, arquivo fechado, falha de I/O), e fechar esses buracos é o
  que transforma a cobertura em afirmação.
- **Dependências atualizadas**, incluindo o Babel na versão 8. Isso expôs que o
  `import()` dinâmico passou a ser lido como outro tipo de nó, o que tirava o
  arquivo do preload da varredura de mutação sem gerar erro; agora há teste
  que fixa a forma da árvore sintática de que o motor depende.
- **Documentação alinhada com o código:** `container.ts`, `logging.ts` e o gerador
  de senha deixaram de ser módulos não documentados, e os rótulos de padrão de
  projeto foram corrigidos onde nomeavam algo que o código não faz.

## [1.6.1] - 2026-10-11

### Adicionado

- **Idiomas da interface:** português (Brasil), chinês simplificado, coreano,
  japonês e inglês, incluindo mensagens do processo principal. O idioma pode
  ser escolhido nas configurações e é salvo para os próximos usos.
- **Categoria de letras minúsculas no gerador:** agora é possível escolher
  separadamente letras maiúsculas, minúsculas, números e símbolos.
- **Aviso para formato de cofre incompatível:** quando o arquivo pertence a
  outra versão, a mensagem explica que os dados continuam cifrados e orienta a
  abrir com a versão que o criou ou criar um novo cofre.

### Alterado

- **Formato do container para a versão 5:** o cabeçalho agora tem 41 bytes e
  não inclui mais os parâmetros globais de KDF, que eram redundantes com os
  parâmetros específicos de cada método.
- **Compatibilidade de formatos anteriores removida:** esta versão só lê o
  formato v5. Arquivos de versões anteriores permanecem no disco, mas precisam
  ser abertos com a versão que os criou; não há migração automática.
- **Seletor de idioma:** passa a usar o mesmo campo compacto de seleção usado
  pelo restante da interface.
- **Logs na inicialização:** mensagens nativas rotineiras do navegador
  integrado deixam de poluir a saída do aplicativo. Avisos e erros do próprio
  app continuam disponíveis; os logs nativos podem ser reativados com
  `--log-level=0`.
- **Persistência e limpeza do cofre:** o tratamento do container, das
  credenciais, das permissões e da destruição foi simplificado e separado por
  responsabilidade.

### Corrigido

- O gerador não permite desmarcar a última categoria de caracteres ativa,
  evitando tentar gerar uma senha sem caracteres disponíveis.
- O cálculo e a validação do conjunto de caracteres usam as mesmas opções,
  tanto na interface quanto no processo principal.

## [1.5.0] - 2026-10-11

### Adicionado

- **Verificador de 2FA (TOTP)**: tela nova na barra lateral que gera os códigos
  de uso único dos serviços (GitHub, Discord, Google, AWS, exchanges,
  marketplaces). Implementa a RFC 6238 com os vetores oficiais dos anexos B e D
  das RFCs 4226 e 6238 como testes, e aceita o endereço `otpauth://` que os
  serviços exibem quando o usuário escolhe "não posso escanear agora".
- **Pasta própria de tokens** em `/var/lib/.guardinha/.vault/.auth/`, um
  arquivo `<uuid>.zka` por token, cifrado em AES-256-GCM com a chave do cofre
  e com rótulo de domínio HKDF próprio (`guardinha-vault-auth-v1`), separado do
  `guardinha-vault-entry-v1` das credenciais.
- **Segredo de 2FA fora do renderer**: o segredo TOTP não é retorno de nenhum
  canal de IPC. O renderer pede o código já calculado (`authenticator:codes`) e
  recebe `{ id, code, remainingMs }`, então a chave nunca existe no processo
  que tem DOM.

### Segurança

- O **manifesto de integridade** passou da versão 1 para a 2 e agora lista os
  tokens de 2FA junto com as credenciais. Sem isso, apagar um `.zka` ou plantar
  o seu próprio passaria despercebido. Cofres na v1 são lidos sem o campo novo
  e voltam selados na v2 na escrita seguinte, sem migração e sem mudança no
  formato do container.
- O **Cryptographic Erase** passou a alcançar `.auth/`: os `.zka` são sobrescritos
  e apagados junto com o container e as credenciais. Um segredo TOTP que
  sobrevive ao erase é uma senha de servidor que sobrevive a ele.
- A pasta `.auth` é criada em `0700` e os arquivos em `0600`, com escrita
  atômica (`.tmp` + `rename`), e o id do arquivo é validado contra path
  traversal como o das credenciais (CVE-2026-21589).

### Corrigido

- **Campo do limite de autodestruição sem rótulo** (`Settings.tsx`): os dois
  campos de limite eram localizáveis só por `placeholder`, e o de confirmação
  não tinha nem isso. As mensagens `nukeLabel` e `nukeConfirmLabel` já existiam
  desde sempre no `pt-BR` e no `en` e nunca foram ligadas ao formulário.
- **Falha silenciosa ao colar o endereço `otpauth://`** (`AuthTokenModal.tsx`):
  um endereço inválido ou sem segredo só descobria no botão "Salvar". Agora a
  aba avisa enquanto se digita, e o aviso some sozinho quando o endereço passa a
  servir. O texto de dica também ficou explícito: o segredo é cifrado dentro do
  cofre e não sai mais dele.

### Notas

- **BLAKE3 não entrou.** Ele foi avaliado e descartado de propósito: BLAKE3 foi
  projetado para ser rápido, que é o oposto do que uma KDF de senha precisa
  (o Argon2id continua sendo a KDF do cofre), e ele não pode entrar na geração
  do código porque **o algoritmo é escolhido pelo serviço, não pelo app**.
  Concatenar BLAKE3 com SHA-512 também não seria útil: um ataque a qualquer um
  dos dois quebra o par. O segredo continua sob AES-256-GCM + HKDF-SHA512, e
  o código sob HMAC nativo do Node, sem dependência nova.
- **Steam Guard não é suportado**: o Steam usa TOTP por baixo, mas exibe 5
  caracteres alfanuméricos de alfabeto customizado. Mostrar um número de 6
  dígitos que o cliente recusa seria pior que não mostrar nada.

## [1.4.1]

### Adicionado

- **Cryptographic Erase**: botão de autodestruição na barra lateral que
  sobrescreve e apaga o cofre inteiro. Apagar o `vault.zkv` é o que destrói o
  cofre, porque ele é o único lugar onde existe a chave embrulhada; sem a
  chave, cada `.zke` vira ruído matemático. A chave da RAM é zerada **antes**
  de qualquer I/O (`panicDestroy`, em `src/main/vault.ts`).
- **PIN de coação** (`src/main/vault.ts`): um segundo PIN que abre um cofre
  vazio enquanto aciona a mesma autodestruição, para uso sob coação física. É
  verificado antes da trava exponencial (quem está sob coação não espera 24 h),
  não conta tentativa (para não denunciar a existência do segundo caminho) e
  paga o mesmo Argon2id de um PIN comum (para não ser medido pelo atacante). A
  sessão de coação não guarda chave alguma. Configurável em Configurações.
- **Autodestruição por tentativas da senha mestra**: limite configurável que
  dispara o Cryptographic Erase ao ser cruzado. **Desligada por padrão**, com
  piso 50, porque apagar o cofre por contagem é irreversível e a frase de
  recuperação não salva nessa situação. Falha de PIN e de frase não contam
  para esse limite.
- **Sobrescrita antes do `unlink`** (`src/main/shred.ts`): todo arquivo
  apagado pelo app passa por sobrescrita em blocos de 64 KiB alternando bytes
  aleatórios e zeros, com `fsync` antes de fechar e `fsync` do diretório pai.
  O arquivo é aberto com `O_NOFOLLOW`, então symlink não é seguido.
- **Varredura de temporários órfãos**: um `.tmp` deixado por um crash não é
  coberto pelo manifesto; agora eles são sobrescritos e apagados na
  inicialização, antes do primeiro `vault:status` responder.

### Alterado

- **Container do cofre na versão 4**: cabeçalho de 45 para 53 bytes, com
  `attemptsMaster` e `nukeLimit` logo depois da máscara de flags, e a flag do
  método de pânico. Cofres nas versões 2 e 3 continuam legíveis (com os campos
  novos valendo zero) e sobem de versão no próximo desbloqueio; o tamanho do
  cabeçalho passou a ser função da versão, e não uma constante só.
- **Persistência reorganizada por domínio**: `layout.ts` (caminhos, sem `fs`),
  `structure.ts` (pastas e permissões), `entries-store.ts` (os arquivos
  `.zke`/`.enc`) e `erase.ts` (a orquestração da destruição). O `storage.ts`
  ficou só com o `vault.zkv` e as migrações, dentro do teto de linhas do
  repositório.
- **Configurações** deixa de ser uma tela de aviso e passa a ter as duas
  proteções de pânico, atrás do cofre desbloqueado.
- Suíte de testes com 23 arquivos e 213 testes (antes 19 e 144).

### Corrigido

- **Tela travada quando a sessão do cofre some no meio de uma operação**: a
  chave pode ser zerada entre o status que o renderer recebeu e a chamada de
  dados seguinte, seja pelo auto-lock disparando com a tela montada, seja pelo
  restart do processo main em `npm run dev` (que recria o `VaultSessionManager`
  vazio e deixa o renderer com a tela antiga). O renderer ficava chamando
  `entries:list` contra um cofre que não existia mais, com um erro no console
  que ninguém entendia. Agora as operações que exigem a chave avisam o renderer
  pelo mesmo canal do auto-lock, e ele volta para a autenticação. A resposta
  continua sendo erro de propósito: devolver lista vazia faria o app parecer um
  cofre vazio, que é a pior leitura possível num app de credenciais
  (`withSessionNotice`, em `src/main/index.ts`).
- **Ruído de VA-API na partida**: o Chromium imprimia
  `libva error: iHD_drv_video.so init failed` ao subir em máquina com o driver
  de vídeo do Intel quebrado. Desligada apenas a decodificação acelerada de
  vídeo (`--disable-accelerated-video-decode`), que o app não usa: ele não tem
  `<video>`, WebCodecs nem captura de canvas, e a composição de tela continua
  na GPU. Desligar a GPU inteira resolveria a mensagem também, mas trocaria a
  aceleração da interface por software em todas as máquinas.

### Corrigido

- **Publicação sob gate de qualidade**: o workflow que gera e publica o `.deb`
  ganhou o job **Verificar qualidade** (`npm run check`, com OSV Scanner e
  shellcheck, mais `npm test`), espelhando o repositório do user-nome/Biblioteca.
  O job de publicação passou a depender dele (`needs: [resolver-versao,
qualidade]`), então falha de tipo, lint, formato, auditoria ou teste
  interrompe a Release. Antes, esse tipo de erro só apareceria no `.deb` que o
  usuário instala.

### Segurança

- **O container não ressuscita depois de um erase**: `writeVaultContainer`
  recusa escrever enquanto o processo marcar o cofre como destruído, para que
  um `writeAuthState`, um `initManifest` ou um `VaultContainerData` ainda em
  memória não recriem um `vault.zkv` sem chave e transformem "cofre destruído"
  em "cofre adulterado". Só `createVault` libera a guarda.
- **Autenticação**: a senha mestra tem agora contador próprio
  (`attemptsMaster`), separado do contador geral, para que o limite estrito não
  seja acionado por erro de digitação de PIN.
- Novo estado de sessão "decoy", sem chave, para o PIN de pânico: a lista de
  credenciais vem vazia e nenhum `.zke` pode ser decifrado a partir dele.

### Documentação

- `SECURITY.md`, `docs/cofre.md`, `docs/seguranca.md`, `docs/api.md`,
  `docs/telas.md`, `docs/testes.md` e `AGENTS.md` descrevem a nova estratégia
  de destruição, o PIN de pânico e o limite por tentativas, incluindo os
  riscos aceitos: o PIN de pânico não passa pela trava e não conta tentativa, e
  a autodestruição por contagem nasce desligada.
- Justificativa registrada de por que a sobrescrita **não é garantia em SSD** e
  de por que o Cryptographic Erase é a estratégia primária lá, e de por que o
  app não roda `fstrim` (o perfil AppArmor nega, e TRIM é do sistema).

## [1.3.1] - 2026-10-08

### Segurança

- **AppArmor em enforce real**: o perfil decorativo do electron-builder foi
  substituído por `build/apparmor-profile` (gerado no build e instalado pelo
  `postinst`); o app sobe confinado de verdade e o `SECURITY.md` passou a
  listar os riscos aceitos (a trava exponencial protege contra o app, não
  contra o disco; a chave fica em memória enquanto o cofre está aberto).
- **Clipboard limpo em 30 s**: copiar usuário ou senha agora passa pelo
  `SecureClipboardProxy` no processo main (`src/main/clipboard.ts`); o
  renderer não usa mais `navigator.clipboard` e a cópia some da área de
  transferência 30 s depois, salvo o usuário copiar outra coisa antes.
- **Auto-lock de 5 minutos**: sem operação no cofre a chave sai da memória
  sozinha (`ActivityMonitor`, padrão Observer, em `src/main/activity.ts`) e o
  renderer recebe o evento `vault:auto-locked` (canal novo, `docs/api.md`),
  além do polling de 15 s que continua como rede de segurança.
- Vetores do relatório de análise reexecutados e cobertos pela suíte:
  permissões, adulteração de byte, injeção/remoção de arquivo e trava sem
  Argon2id na espera (`tests/main/window.test.ts`,
  `tests/main/facade.test.ts`, `tests/main/vault.test.ts`,
  `tests/main/unlock.test.ts`); 19 arquivos e 144 testes no total.

### Alterado

- Chave do cofre com um único dono: `VaultSessionManager` (Singleton,
  `src/main/session.ts`) guarda e zera a chave no lock, no auto-lock e no
  encerramento do app; nenhum outro módulo mantém cópia.
- Persistência atrás da fachada `VaultStorageFacade` (`src/main/facade.ts`):
  `vault.ts` e `entries.ts` pedem operações de alto nível e não tocam mais
  `fs`, AES-256-GCM nem o manifesto direto.
- Desbloqueio em cadeia de manipuladores (`src/main/unlock.ts`, Chain of
  Responsibility): trava exponencial barata corta antes da validação de
  formato, que corta antes do Argon2id; PIN malformado não paga mais 256 MB
  de derivação e quem espera a trava não gasta tentativa nova.
- Embrulho e desembrulho da chave por tipo de credencial
  (`src/main/unwrapping.ts`, Factory Method) e medidor de força por Strategy
  (`src/shared/strategy.ts`), no lugar dos `evaluate*` avulsos.
- Contagem regressiva da trava unificada em `src/shared/format.ts` (estava
  repetida no main e no renderer).
- Custo do Argon2id revalidado por benchmark nesta máquina: ~2,1 s por chute
  de PIN com a máquina quieta e ~4 a ~16 s sob carga do desktop; o processo
  main fica bloqueado só durante a derivação, e o renderer (processo
  separado) segue responsivo. Testes de Argon2id real ganharam teto de 120 s
  para não virar falso positivo sob carga.

## [1.2.1] - 2026-10-08

### Adicionado

- Aba **Configurações** na sidebar, logo abaixo de Atribuições: por ora mostra
  apenas o aviso de que as configurações serão implementadas em uma versão
  futura (idioma e bloqueio do cofre continuam na barra lateral).
- **Checagem de força** compartilhada (`src/shared/strength.ts`, usada por
  renderer e main): medidor ao vivo com nota de 0 a 4 e motivos em senha
  mestra, PIN, frase de recuperação, senha da credencial salva e saída do
  gerador, além de dica própria para cada tipo de credencial.
- Documentação técnica nova em `docs/`: índice em `docs/README.md` e guias de
  visão geral, arquitetura, cofre, credenciais, telas, build, testes e mapa de
  segurança; `docs/api.md` e `docs/messages.md` passaram a apontar a checagem
  de força e o `README.md` ganhou a seção Documentação.

### Alterado

- Sidebar reordenada e renomeada: **Início (Senhas)**, **Gerador de Senhas**,
  **Atribuições** e **Configurações**; o item "Configuração & Gerador" virou
  "Gerador de Senhas", também no título da tela.
- Textos dos `.md` revisados: pontuação do português do Brasil e remoção de
  travessões em `README.md`, `SECURITY.md`, `AGENTS.md` e `CHANGELOG.md`.

### Segurança

- `vault.zkv` passa à **versão 3**: cada método de desbloqueio guarda o próprio
  custo do Argon2id: **PIN de 8 dígitos com 256 MB / t=4 / p=4** (o segredo
  fraco, o mais caro) e **senha mestra / frase de recuperação com 128 MB /
  t=3 / p=4** (antes 64 MB / t=3 para todos). Cofres na versão 2 continuam
  legíveis e cada método é reembrulhado com o custo atual no desbloqueio em que
  a credencial dele é usada (migração incremental: só quem tem a credencial
  consegue reembrulhar).
- Parâmetros KDF fora de uma faixa segura agora são recusados na leitura e na
  gravação do container (fail-closed), para um arquivo adulterado não conseguir
  exigir memória ou CPU ilimitadas do app.
- Custo maior por tentativa: no hardware de referência (i7 antigo) o
  desbloqueio com PIN passou de ~0,4 s para ~2 s e a senha mestra / frase de
  ~0,4 s para ~0,8 s; criar o cofre também fica mais lento.
- Criação do cofre e redefinição do PIN **recusam credencial previsível**,
  com a regra rodando também no processo main (não se confia no renderer):
  dígito repetido (`00000000`), sequência de ponta a ponta (`12345678`),
  mesmo bloco repetido (`12121212`), frase com quatro palavras distintas ou
  menos; data de nascimento, palavra comum e PIN fraco são **só avisados** no
  medidor, nunca recusados (`errors.trivialMaster`/`trivialPin`/`trivialPhrase`).

## [1.1.0] - 2026-10-07

### Segurança

- janela: navegação presa na página do app (`will-navigate` recusa qualquer
  URL fora da página carregada) e `window.open` nunca cria janela: só repassa
  `https:` para o navegador do sistema (`setWindowOpenHandler`).
- sessão: toda permissão web do renderer (mídia, geolocalização, notificações…)
  é negada; só o clipboard passa, para copiar usuário/senha.
- área de transferência: copiar usuário, senha ou senha gerada limpa o
  clipboard 30 s depois, salvo o usuário já ter copiado outra coisa antes
  (`src/renderer/src/clipboard.ts`).
- produção: DevTools desligado no app empacotado (`devTools: !app.isPackaged`).
- IPC pelo frame oficial: todo handler chegou com `assertAppFrame(event)`, que
  confere `event.senderFrame` contra a página do scheme `guardinha://` (ou o
  Vite dev server), bloqueando qualquer frame de fora antes do domínio.
- renderer entregue via scheme `guardinha://` em produção
  (`registerAppProtocol` serve `out/renderer`), em vez de `file://`; CSP com
  `object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action
'self'`.
- `electronFuses` no electron-builder: `runAsNode: false`,
  `enableNodeOptionsEnvironmentVariable: false`,
  `enableNodeCliInspectArguments: false`, `enableCookieEncryption: true`,
  `onlyLoadAppFromAsar: true` e
  `grantFileProtocolExtraPrivileges: false`.

## [1.0.3] - 2026-10-07

### Alterado

- Seletor de idioma na Sidebar voltou a ser um campo retangular com o menu
  embutido: o menu abre abaixo do campo, o item ativo aparece em verde com
  check, e o campo fecha no clique fora, no `Escape` ou após a escolha (com
  navegação por setas, Home e End).

## [1.0.2] - 2026-10-07

### Alterado

- Slider do gerador voltou à sensibilidade normal do mouse: o arraste
  acompanha o cursor (o teclado continua com setas e Page Up/Page Down).
- Seletor de idioma na Sidebar virou duas pílulas (pt/en) no lugar do
  `<select>`, no mesmo estilo dos retângulos de status, categoria e tipo do
  user-nome/biblioteca.
- Pontuação em português sem travessões: textos da interface, comentários e
  documentação usam vírgula, dois-pontos e ponto e vírgula no lugar do
  travessão tipográfico.

## [1.0.1] - 2026-10-07

### Alterado

- Ferramenta de build atualizada: vite 8 (rolldown) e electron-vite
  6.0.0-beta.6, com build mais rápido e bundle do renderer menor, sem mudança
  de comportamento do app.

### Corrigido

- CI: `github/codeql-action` em v4.38.2 com `init` e `analyze` na mesma
  versão; `npm ci` volta a resolver as dependências (peer do electron-vite
  com vite 8); a publicação do `.deb` tolera a ausência dos segredos
  opcionais de GPG/APT e Vercel.

## [1.0.0] - 2026-10-07

Primeira versão pública do **Guardinha** (pacote `.deb` para Linux Mint 22.X).

### Adicionado

- Cofre offline de credenciais: registros com usuário/senha, busca, copiar
  usuário/senha e botão que abre o site da credencial no navegador
  (canal `shell:open-domain`, restrito a `http:`/`https:`).
- Acesso em camadas: login só com **PIN**; a senha mestra só é oferecida após
  3 falhas de PIN; a frase de recuperação (mínimo de 12 palavras, escrita pelo
  próprio usuário, o app nunca gera) serve exclusivamente para redefinir o
  PIN; nunca é forma de login.
- Trava exponencial (10 s → 30 s → 1 min → 1 h → 24 h) persistida em disco e
  auto-lock após 5 minutos ocioso.
- Criptografia: Argon2id (64 MB, t=3, p=4) embrulhando as chaves em `vault.zkv`
  (versão 2) e AES-256-GCM por registro em `.entries/<uuid>.zke`, com chave por
  arquivo via HKDF-SHA512 e salt/IV de 128 bits.
- Manifesto cifrado com integridade fail-closed: registro removido ou injetado
  de fora do app é detectado e o acesso falha com um único erro de adulteração.
- Cofre em `/var/lib/.guardinha/.vault/` (fora de `~/`; topo `root:root 0711`
  sem listagem, cofre 0700 com dono usuário, pastas ocultas) criado pelo
  `postinst` do `.deb`; migração automática do legado `~/.guardinha-vault/`
  (JSON) e do XDG visível para o layout oculto binário.
- Criação da estrutura via PolicyKit: helper `guardinha-setup` do pacote
  chamado com `pkexec` (ação `com.guardinha.keypass.setup-vault`); a senha de
  administrador é digitada no diálogo do sistema e nunca passa pelo app.
- Interface React com Sidebar (Início, Configuração & Gerador, Atribuições),
  busca, gerador de senhas com slider de baixa sensibilidade e pós-créditos de
  cinema.
- Idiomas pt-BR (canônico) e en, escolhidos em Configuração e persistidos em
  `$XDG_CONFIG_HOME/guardinha/settings.json` (textos em `src/messages/`; ver
  `docs/messages.md`).
- Qualidade no `npm run check`: typecheck, ESLint, Prettier, auditoria OSV
  (`osv-scanner` + `.osv-scanner.toml`) e shellcheck nos scripts de
  empacotamento.
- CI no GitHub Actions: publicação automática de Release + repo APT flat
  (`publish.yml`), CodeQL, Dependabot, agradecimento a PRs mesclados e
  templates de issue/PR.
- Documentação: `README.md` (índice), `AGENTS.md`, `docs/api.md`,
  `docs/messages.md`, governança (`CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, `LICENSE`) e avisos de terceiros (`THIRD-PARTY-NOTICES.txt`).

### Segurança

- Renderer com CSP estrita, preload sandboxed (`contextIsolation: true`,
  `sandbox: true`), sem `innerHTML` dinâmico e sem acesso a disco ou rede,
  tudo via IPC tipado (`docs/api.md`).
- Chave do cofre só na memória do processo main; zerada no lock e no
  auto-lock; nenhuma senha, PIN ou frase em log ou eco de erro.
- Fronteiras validadas: ids de registro com anti path-traversal
  (`assertSafeEntryId`, defesa em profundidade inspirada no CVE-2026-21589) e
  `openExternal` exclusivamente para `http:`/`https:`.
