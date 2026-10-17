# Build, pacote e distribuição

O app é compilado com electron-vite (`main`, `preload` e `renderer`) e
empacotado em `.deb` pelo electron-builder. Nada disso entra no git: `out/`,
`release/`, `apt/` e `*.deb` estão no `.gitignore`.

## Comandos

| Comando                      | O que faz                                                    |
| ---------------------------- | ------------------------------------------------------------ |
| `npm run dev`                | Sobe com hot reload usando o cofre de teste em `.dev-vault/` |
| `npm run build`              | Apaga `out/` e compila os três bundles                       |
| `npm start`                  | Pré-visualiza o build (`electron-vite preview`)              |
| `npm run dist`               | Build + gera o `.deb` em `release/`                          |
| `npm run dist:dir`           | Mesmo, mas deixa a árvore descompactada (`--dir`)            |
| `npm run check`              | typecheck, lint, formato, OSV Scanner e shellcheck           |
| `npm test`                   | Suíte Vitest                                                 |
| `npm run test:e2e`           | E2E (Playwright) sobre o app compilado e o `.deb`            |
| `npm run test:coverage`      | Suíte com cobertura em `coverage/`                           |
| `python3 build/make-icon.py` | Regenera `build/icon.png` (requer PIL)                       |

Os binários `bin/osv-scanner` e `bin/shellcheck` não são versionados; copie-os
de `user-nome/Biblioteca/bin/` ou baixe as releases correspondentes.

`dist` e `dist:dir` passam `--publish never` ao electron-builder, e isso não é
detalhe: sem a flag, num runner com `CI=true` ele aciona a publicação implícita
("Implicit publishing triggered by CI detection") e morre com
`GitHub Personal Access Token is not set`, porque este projeto não tem provedor
de publicação configurado no bloco `build`. Quem publica é o `publish.yml`, que
empacota com a flag e anexa os assets com `softprops/action-gh-release`.

## O banner do README

`docs/assets/banner.png` é a capa do README; [`build/banner.html`](../build/banner.html)
é sua fonte em 1280x400. O HTML fica versionado ao lado do script que permite
reproduzir a imagem.

Para regerar: troque `ICON_PATH` por `build/icon.png`, abra o HTML numa
`BrowserWindow` de 1280x400 (`useContentSize: true`, `frame: false`,
`backgroundColor: '#020617'`) e grave `capturePage().toPNG()`. O Electron já
está no `node_modules` do projeto, então não é preciso navegador extra.

## Saída do build

| Caminho                 | Conteúdo                                               |
| ----------------------- | ------------------------------------------------------ |
| `out/main/index.js`     | Processo principal (bundled pelo Vite em modo SSR)     |
| `out/preload/index.cjs` | Ponte `contextBridge` (CommonJS, exigido pelo sandbox) |
| `out/renderer/`         | HTML, CSS e JS da interface                            |
| `release/`              | `.deb` e árvore gerada pelo electron-builder           |

Os aliases `@zero/*` são resolvidos na hora do bundle
(`electron.vite.config.mts`), então o pacote não depende do `tsconfig` em tempo
de execução.

## O que vai dentro do `.deb`

Bloco `build` do `package.json`:

| Chave            | Valor                                                                         |
| ---------------- | ----------------------------------------------------------------------------- |
| `appId`          | `com.guardinha.keypass`                                                       |
| `target`         | `deb` para Linux (categoria Utility)                                          |
| `asar`           | ligado (o código vive no `app.asar`)                                          |
| `extraResources` | `build/scripts/guardinha-setup` (helper do PolicyKit)                         |
| `depends`        | GTK, libnotify, NSS, xdg-utils e afins do Electron                            |
| `afterInstall`   | `build/scripts/after-install.sh`                                              |
| `afterRemove`    | `build/scripts/after-remove.sh`                                               |
| `electronFuses`  | `runAsNode`, `NODE_OPTIONS` e inspetor desligados (detalhe em `seguranca.md`) |

### `after-install.sh` (postinst)

Além do padrão do electron-builder (link do executável, AppArmor, banco de
MIME), ele:

1. Cria a raiz `/var/lib/.guardinha` com `root:root 0711`; não migra nem
   renomeia formatos ou layouts de cofre anteriores.
2. Se identifica quem instalou por `SUDO_UID`/`PKEXEC_UID`, cria `.vault` com
   `0700` e atribui o diretório a esse usuário. Sem essa identificação, o app
   pode criar a estrutura via PolicyKit no primeiro uso.
3. Escreve a ação do PolicyKit em
   `/usr/share/polkit-1/actions/com.guardinha.keypass.policy`, que autoriza o
   `pkexec` a rodar o helper `guardinha-setup`.

### `guardinha-setup`

Executado como root pelo `pkexec`, só cria os diretórios fixos com modos
fixos: nenhum caminho vem do chamador. O dono vem de `PKEXEC_UID`.

### `after-remove.sh` (postrm)

Remove link, perfil do AppArmor e a ação do PolicyKit. **Os dados em
`/var/lib/.guardinha/` permanecem**; desinstalar não apaga o cofre.

## Integridade do build

- `npm run check` antes de commitar (é a barra do CONTRIBUTING).
- `after-install.sh`, `after-remove.sh` e `guardinha-setup` passam pelo
  shellcheck (`npm run lint:shell`).
- As dependências passam pelo OSV Scanner (`npm run security:audit`). O comando
  roda com `--all-vulns` (mostra também o que o scanner julga sem importance ou
  não chamado), `--experimental-flag-deprecated-packages` (versão abandonada é
  dívida) e `--licenses` com uma allowlist de licença: o `.deb` é distribuído e
  há `THIRD-PARTY-NOTICES.txt` para manter honesto, então licença copyleft
  (GPL, AGPL, SSPL, BUSL) ou ausente reprova o `check`. As bandeiras e o motivo
  de cada entrada da allowlist estão em `.osv-scanner.toml` e no
  `scripts.security:audit`, no `package.json`.
- Fuses do Electron no bloco `build.electronFuses` do `package.json`:
  `runAsNode`, `enableNodeOptionsEnvironmentVariable` e
  `enableNodeCliInspectArguments` desligados; `enableCookieEncryption` e
  `onlyLoadAppFromAsar` ligados.

## Publicação (CI)

Fluxo completo em `CONTRIBUTING.md` (seção 10); resumo do
`.github/workflows/publish.yml`:

1. Push na `main` ou tag `v*` dispara o workflow **Publicar .deb**.
2. O job **Verificar versão** (`resolver-versao`) compara `package.json` com as
   Releases e decide se há o que publicar (push sem bump de versão vira execução
   verde e rápida).
3. O job **Verificar qualidade** (`qualidade`) roda em paralelo ao anterior e
   é o **gate**: `npm run check` (tipo, lint, formato, OSV e shellcheck) e
   `npm test`. Os binários `osv-scanner` e `shellcheck` são baixados no
   próprio job, com versão fixada, porque `bin/` é gitignored e não existe no
   checkout do CI.
4. O job **Gerar e publicar** (`build-deb`) tem `needs: [resolver-versao,
qualidade]`: só começa se **os dois** passarem. Falha de tipo, lint,
   formato, auditoria OSV, shellcheck ou teste interrompe a publicação.
5. O mesmo job compila, roda o `electron-builder`, cria a tag `vX.Y.Z` se não
   existir e publica a Release.
6. Na mesma Release sobem o `.deb` e o **repo APT flat assinado**
   (`Packages`, `Packages.gz`, `Release`, `Release.gpg`, `InRelease`,
   `public.key` e o alias `guardinha_amd64.deb` em `releases/latest/download/`),
   que é o que mantém o `sudo apt upgrade` vivo.

Sem o gate, um erro de tipo ou um teste vermelho só apareceria no `.deb` que o
usuário instala. Com ele, a falha aparece no pull request.

Secrets necessários: `GPG_PRIVATE_KEY` (e `GPG_PASSPHRASE`, se houver). As
actions estão fixadas por SHA e atualizadas pelo Dependabot.

### A chave que assina o repo APT

`GPG_FINGERPRINT`, no `env` do topo do `publish.yml`, é a **fonte única** da
impressão digital. O passo de gerar o repo APT confere a chave por ela (e não
pelo uid) e assina com `--local-user`, de modo que o secret e o valor do
workflow não puedan combinar em silêncio: se divergirem, o job morre com
`::error::` na linha da checagem, antes de subir qualquer asset.

**Essa chave não assina commit.** Ela existe para uma coisa só: assinar o
`Release` do repo APT, que é o que faz o `apt update` aceitar o índice. O
trabalho no dia a dia (commit e push) passa pela chave SSH, e a assinatura de
commit está desligada:

```bash
git config --global commit.gpgsign false
```

Com isso, `git commit` não pede chave nenhuma, nem GPG nem SSH, e funciona
direto no VS Code. O efeito é o GitHub não mostrar o selo de "Verified" nos
commits, o que aqui é uma troca boa: o selo obrigava a ter uma chave privada
com passphrase presente em cada commit, e a passphrase perdida trancava o
trabalho inteiro. Se algum commit precisar ser assinado mesmo assim, é
`git commit -S` (a chave do APT, com a frase) ou `gpg.format ssh` com um
`ssh-agent` do OpenSSH (o agente do GNOME Keyring recusa a assinatura, com
`agent refused operation`).

Trocar a chave do APT (passphrase perdida, chave renovada, uid novo) é três
passos:

1. Gerar o par e exportar o bloco privado:

   ```bash
   gpg --quick-generate-key 'user-nome <user-nome@users.noreply.github.com>' ed25519 sign never
   gpg --armor --export-secret-keys <impressao-nova> > guardinha-apt.asc
   ```

   Guarde o arquivo **fora** do repositório: ele é o segredo do APT.

2. Trocar `GPG_FINGERPRINT` no `publish.yml`.

3. No repositório do GitHub (Settings → Secrets and variables → Actions),
   sobrescrever `GPG_PRIVATE_KEY` com o bloco inteiro (as linhas
   `-----BEGIN PGP PRIVATE KEY BLOCK-----` e `-----END PGP PRIVATE KEY BLOCK-----`
   inclusas) e `GPG_PASSPHRASE` com a frase da chave nova.

Na prática os dois arquivos ficam em `~/guardinha-apt.asc` e
`~/guardinha-apt-frase.txt` (perm 600), e a chave em si no keyring do `gpg`
(`~/.gnupg`). Para conferir o que está gravado no repositório contra o que
está na máquina, o passo do repo APT imprime o sha256 dos dois secrets
recebidos quando a assinatura falha; compare com
`sha256sum ~/guardinha-apt.asc ~/guardinha-apt-frase.txt`.

A chave em uso desde 17/10/2026 é a `AF9F...86F7`, a quinta rotação do dia (a
`A838...D7511D61` foi perdida com a frase, a `5C14...0CF7`, gerada sem frase, não
roda no CI, e `6510...7BF3`, `5F96...CAB20` e `1FF6...7D87`, todas com frase, foram
descartadas porque o secret `GPG_PASSPHRASE` do repositório não abria a chave que
o `GPG_PRIVATE_KEY` entregava, e essa chave vinha certa). **Ela tem frase**, e isso é
obrigatório no CI, não opcional: sem `--pinentry-mode loopback` o agente do gpg
tenta pinentry, o runner não tem terminal e a assinatura morre com
`Inappropriate ioctl for device`. E uma chave **sem frase não resolve**, porque
não existe argumento de senha vazia que o gpg aceite para desbloquear: o
`--passphrase ''` é descartado, e sem loopback o resultado depende de
heurística do agente, ora assinando, ora dando `Operação cancelada`. Foi o que
aconteceu na primeira tentativa de rotação (a `5C14...0CF7`), e a diferença só
aparece em parte das execuções. Com frase e loopback o desbloqueio é
determinístico, e o passo do `publish.yml` entrega a frase pelo
`--passphrase-file`, num arquivo temporário que é apagado no fim, em vez de
`--passphrase`, que a deixaria no argv do processo.

A frase entra no secret `GPG_PASSPHRASE` e é gerada em hexadecimal, para não
ter caractere que uma colagem possa trocar (`+`, `/` e `=` do base64 já
estragaram uma troca de secret). Guarde-a num gerenciador de senhas: ela só é
usada pelo CI, mas é a sua chave assinando o repositório. Trocar a frase depois
de exportar o bloco privado deixa o `GPG_PRIVATE_KEY` protegido pela frase
antiga, e aí é preciso reexportar a chave e sobrescrever os dois secrets.

Como a assinatura de commit está desligada, trocar a chave do APT não mexe em
nenhuma configuração de repositório local. A regra é manter a chave antiga no
keyring, para ela continuar verificando as Releases já assinadas; na rotação de
17/10/2026 ela foi apagada por inteiro (o material secreto não tinha mais uso
sem a frase), com as duas chaves públicas de backup em
`~/.local/share/guardinha-backup-gpg/`.

Para quem já instalou pelo APT, a rotação não muda a instrução do `README.md`
(o `public.key` vem de `releases/latest/download/`), mas o keyring antigo não
valida a assinatura nova: é preciso repetir a linha do `public.key` e depois
`sudo apt update`. Na rotação de 17/10/2026 isso não afetou ninguém, porque
nenhuma Release com `InRelease` tinha sido publicada ainda.

## Versão do runner (`ubuntu-24.04`, não `ubuntu-latest`)

Os oito jobs dos três workflows rodam em `ubuntu-24.04`, com o rótulo escrito à
mão em vez do `ubuntu-latest`.

Motivo: em **19/10/2026** o `ubuntu-latest` do GitHub passa a apontar para o
Ubuntu 26.04 e a migração termina em 19/11/2026
([actions/runner-images#14748](https://github.com/actions/runner-images/issues/14748)).
Quem deixa `ubuntu-latest` não toma uma decisão: a imagem troca sozinha, e o
que quebra aparece na pior hora. No caso daqui, o alvo não é quebramento
comum, é o `build-deb` do `publish.yml`, que é o job que **gera o `.deb` que o
usuário instala**. Trocar o ambiente de build no meio da linha 1.x muda glibc,
`dpkg-deb` e o empacotamento do electron-builder sem ninguém ter decidido isso.

O alvo de distribuição é o Linux Mint 22.X, que descende da série 24.04, então
o 24.04 também é o ambiente mais próximo do destino real.

**Para sair do 24.04**, não basta trocar o rótulo: rodar a linha inteira em
`ubuntu-26.04` e conferir, nesta ordem:

1. `npm run check` e `npm run test:coverage` (os testes rodam Argon2id de 128 e
   256 MiB de verdade, então pegam diferença de runtime e de memória);
2. `npm run build && npx electron-builder --linux deb` e conferir o `.deb`
   gerado: `dpkg-deb -I` para os metadados, o perfil AppArmor aplicado em
   `build/scripts/after-install.sh` e a instalação em uma VM limpa do Mint 22.X;
3. o postinst e o prerm, que rodam como root (`fakeroot` só cobre o empacotamento).

Só depois disso o `ubuntu-26.04` entra nos workflows, com o mesmo peso de
decisão que teve o `ubuntu-24.04`.

Sobre o Dependabot: ele **não** é o que segura nada aqui. Os workflows fixam as
actions por SHA completo, e o Dependabot (`github-actions`) só abre PR para
mover esses pins. Se ninguém mesclar esses PRs, nada quebra: os pins atuais
(`checkout` v7.0.1, `setup-node` v7.0.0, `codeql-action` v4.38.2,
`upload-artifact` v7.0.2) seguem funcionando. O que para de acontecer é a
chegada automática de correção de segurança das actions, e isso é revisão de
ponta, não automação. Já a migração do runner é mudança da **imagem**, invisível
para o Dependabot: foi por isso que o `ubuntu-latest` precisou ser fixado à mão.

Um caso em que o PR do Dependabot não era merger: a major do TypeScript. O
`typescript-eslint@8.71.2`, junto com `@typescript-eslint/parser`,
`typescript-estree` e `ts-api-utils`, declara o peer
`typescript@">=4.8.4 <6.1.0"`, e o `typescript` 7 está fora dessa faixa. Com o
`package.json` no 7 o `npm ci` morre em ERESOLVE nos três jobs do ritmo normal
(um `npm ci` por job), antes do typecheck. Enquanto o `typescript-eslint` não
publicar suporte à série 7, o jeito é o PR ser fechado e o `typescript` ficar no
6, com `ignore` de major em `.github/dependabot.yml` para ele não voltar toda
segunda. Não é para resolver com `--legacy-peer-deps` no `npm ci`: isso esconde a
incompatibilidade e deixa o lint analisando um compilador que ele não suporta,
justamente o tipo de gate afrouxado que este repositório não tem.

## Gate da branch de trabalho

`.github/workflows/quality.yml` confere a `developer` enquanto o código está
sendo escrito, que é o oposto do `publish.yml` (que só roda na `main`, no
momento em que a versão sai). Sem ele, erro de tipo, formatação quebrada,
dependência vulnerável, teste vermelho ou cobertura abaixo de 95% só apareceriam
depois do merge.

| Gatilho                    | O que roda                                                                      |
| -------------------------- | ------------------------------------------------------------------------------- |
| push na `developer`        | "Verificar qualidade", "Testes e cobertura", "Testes E2E" e "Testes de mutação" |
| PR para `main`/`developer` | os três primeiros, e são eles que travam o merge                                |
| execução manual            | os quatro, para conferir na mão um passo local duvidoso                         |

Três jobs no ritmo normal, para a falha apontar o culpado, e um quarto em outro
ritmo:

- **Verificar qualidade**: `npm run check` (tipos, lint, formato, auditoria OSV,
  shellcheck). Instala `bin/osv-scanner` e `bin/shellcheck` do mesmo jeito que o
  `publish.yml`, com as mesmas versões fixadas.
- **Testes e cobertura**: `npm run test:coverage`, cujo limiar de 95% mora em
  `vitest.config.mts`. Publica a tabela no resumo da execução e sobe o relatório
  HTML como artefato (`cobertura-relatorio`, 14 dias), que é o que serve para
  achar a linha que derrubou o número.
- **Testes E2E**: compila o app e o pacote (`npm run dist:dir`), sobe os dois
  alvos sob `xvfb` (`npm run test:e2e`) e instala o `.deb` de verdade para
  conferir que ele resolve as dependências. O detalhe está em `docs/e2e.md`.
- **Testes de mutação**: a varredura de `tools/mutation/` (`docs/mutation.md`).
  Roda em push na `developer`, uma vez por mês e por disparo manual, **não** em
  pull request nem em push para a `main`, porque leva horas e o número que ela
  mede só muda quando alguém escreve teste novo. Reprova abaixo de 65%, e por
  isso não é status check obrigatório: ela informa e reprova, mas não segura o
  merge.

Para o merge ficar travado de verdade, marque os três status checks do ritmo
normal como obrigatórios nas regras de proteção da `main` (Settings > Branches >
Branch protection rules). Sem isso o workflow é informativo: ele roda, mas
ninguém é obrigado a esperar.

## Outros workflows

| Arquivo          | Papel                                                             |
| ---------------- | ----------------------------------------------------------------- |
| `quality.yml`    | Gate de tipos, lint, formato, OSV, cobertura e E2E em `developer` |
| `codeql.yml`     | CodeQL em push/PR para `main` e semanalmente                      |
| `dependabot.yml` | PRs semanais para dependências npm e actions                      |
