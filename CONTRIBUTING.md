# Como contribuir

Obrigado por querer ajudar o **Guardinha**! Este guia resume o fluxo. As regras
detalhadas para agentes e contribuidores estão em [`AGENTS.md`](AGENTS.md).

## 1. Preparar o ambiente

- **Node.js 22+** e **npm** (o app roda em Electron 44).
- Linux Mint 22.x (alvo do `.deb`); outros Linux funcionam para desenvolver.

```bash
npm install
npm run dev     # abre o app com hot reload (cofre de teste em .dev-vault/)
```

## 2. Scripts importantes

| Comando                      | Quando usar                                                              |
| ---------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`                | desenvolver com recarregamento automático                                |
| `npm test`                   | rodar a suíte Vitest                                                     |
| `npm run test:e2e`           | E2E (Playwright) sobre o app compilado e o `.deb` (ver `docs/e2e.md`)    |
| `npm run check`              | **obrigatório antes de commitar** (tipos + lint + formato + OSV + shell) |
| `npm run clean`              | apagar `out/` e `release/` (builds anteriores)                           |
| `npm run build`              | compilar main/preload/renderer                                           |
| `npm run dist`               | gerar o `.deb` em `release/`                                             |
| `npm run security:audit`     | auditoria de vulnerabilidades (OSV Scanner)                              |
| `npm run lint:shell`         | shellcheck nos scripts de `build/scripts/`                               |
| `python3 build/make-icon.py` | regenerar `build/icon.png` (requer PIL)                                  |

Os binários do `osv-scanner` e do `shellcheck` ficam em `bin/` e não entram no
git (ver `AGENTS.md`, seção Comandos).

## 3. Convenções de código (resumo)

- **Imports em `src/` sempre por alias** `@zero/*` (`@zero/types`,
  `@zero/messages`, `@zero/main/*`, `@zero/preload/*`, `@zero/renderer/*`);
  nunca caminho relativo entre pastas. O mapa vive em `tsconfig.base.json` e é
  espelhado em `electron.vite.config.mts`, `vitest.config.mts` e
  `src/node.loader.ts`.
- **Arquivos `index` só como barrel**, exceto os entrypoints exigidos pelo
  Electron (`src/main/index.ts`, `src/preload/index.ts`).
- **Sem `any`**, sem casts desnecessários; prefira tipos bem definidos e
  `unknown` + validação nas fronteiras (JSON, IPC).
- **Arquivos com ~500 linhas devem ser quebrados** em módulos/componentes.
- Textos de UI e mensagens de erro **só em `src/messages/`** (pt-BR é o
  canônico; todos os outros idiomas fecham com o tipo `Messages`); ver
  `docs/messages.md`.
- Rode `node --import ./src/node.loader.ts <arquivo.ts>` para executar um `.ts`
  direto no Node com os aliases resolvidos.

## 4. Dependências

- Só licenças permissivas aprovadas pela OSI (MIT, ISC, BSD, Apache 2.0 …);
  **nada de GPL/AGPL/LGPL** em dependências obrigatórias.
- Confira a licença **antes** de instalar e prefira o que já existe no projeto.
- Dependências novas que entram no `.deb` ganham entrada em
  [`THIRD-PARTY-NOTICES.txt`](THIRD-PARTY-NOTICES.txt).

## 5. Documentação junto com o código

Toda mudança de comportamento, fluxo, configuração, mensagens ou dependências
**atualiza `README.md` e/ou `docs/*.md` na mesma mudança**, nunca depois.
Guias novos vão em `docs/`, com a linha correspondente no índice
[`docs/README.md`](docs/README.md); o `README.md` da raiz é a porta de
entrada. Mudanças voltadas ao usuário ganham entrada em
[`CHANGELOG.md`](CHANGELOG.md).

## 6. Testes

- Testes em `tests/**/*.test.{ts,tsx}` (Vitest + jsdom); alvos de cobertura em
  `vitest.config.mts`.
- Correção de bug vem acompanhada de teste que reproduz o problema.
- Mantenha os arquivos de teste abaixo de ~500 linhas (extraia helpers).

## 7. Segurança

- Nunca commite credencial, PIN ou frase de recuperação; erros do cofre não
  podem ecoar nenhum dos três (regra do `AGENTS.md`).
- Vulnerabilidades de dependências: rode `npm run security:audit`; ignores só
  com justificativa e data de revisão em `.osv-scanner.toml`.
- Licença de dependência: o mesmo comando barra licença copyleft (GPL, AGPL,
  SSPL, BUSL) e pacote sem licença declarada. Licença nova que aparecer é pedido
  de revisão, não defeito: leia a licença e acrescente à allowlist em
  `scripts.security:audit` (`package.json`), com o motivo em
  `.osv-scanner.toml`. Confira antes se o pacote vai mesmo para o `.deb` ou se
  é só de build.
- Scripts de shell: `npm run lint:shell` no `check` cobre `build/scripts/`.
- Achou uma falha? **Não abra issue pública**: siga [`SECURITY.md`](SECURITY.md).

## 8. Enviar a mudança

1. Crie um branch a partir da `developer` (é a integração com a `main` que
   publica): `git checkout -b minha-mudanca developer`.
2. Faça commits pequenos, com mensagens claras em pt-BR.
3. Rode `npm run check` e `npm test` (tudo verde).
4. Abra o PR pelo formulário do repositório (`.github/pull_request_template.md`),
   descrevendo **o quê**, **por quê** e **como testar**.

## 9. Issues e automações do GitHub

- Issues só pelas templates de `.github/ISSUE_TEMPLATE/` (bug e funcionalidade);
  vulnerabilidade de segurança vai pelo canal privado do `SECURITY.md` (link em
  `.github/ISSUE_TEMPLATE/config.yml`).
- `.github/dependabot.yml` abre PRs toda segunda para dependências (npm) e para
  as versões das GitHub Actions.
- `.github/workflows/codeql.yml` roda o CodeQL em push/PR para `main` e toda
  segunda-feira, complementando o `npm run security:audit`.
- `.circleci/config.yml` roda o mesmo gate de qualidade no CircleCI (tipos,
  lint, formato, OSV, cobertura, E2E e mutação). Ele **não** publica: a
  Release e o repo APT assinado continuam sendo do `publish.yml`, que é quem
  tem os secrets de GPG. O passo a passo está em `docs/build.md`.

## 10. Commits e lançamentos

Use [Conventional Commits](https://www.conventionalcommits.org/) em pt-BR no
título do commit vindo da `developer` para a `main`:

- `feat: ...` → nova funcionalidade (sobe `MINOR`, ex.: 1.0.3 → 1.1.0);
- `fix: ...` → correção de bug (sobe `PATCH`, ex.: 1.0.3 → 1.0.4);
- `docs: ...`, `test: ...`, `chore: ...`, `refactor: ...` → sem lançamento.

Para publicar uma versão (a partir da `main`):

1. Bump em `package.json` → `version` + entrada nova no `CHANGELOG.md`
   (o tipo dos commits desde a última release indica MINOR/PATCH);
2. Commit (`chore: release x.y.z`) e push na `main`;
3. O push dispara o workflow **Publicar .deb**: o job **Verificar versão**
   compara `package.json` com as Releases existentes e, sendo uma versão nova,
   cria a tag `vX.Y.Z`, compila (`npm run build` + `electron-builder`), anexa
   o `.deb` **e o repo APT flat assinado** (`Packages`, `Release`, `InRelease`,
   `public.key` + alias estável `guardinha_amd64.deb` em
   `releases/latest/download/`) à Release. Requer os secrets
   `GPG_PRIVATE_KEY` (+ `GPG_PASSPHRASE`, se houver) em Settings → Secrets →
   Actions. Push repetido sem bump de versão vira execução verde e rápida
   (nada a publicar).

Para reanexar os assets de uma Release que falhou no meio, rode o workflow na
UI (**Run workflow**, `workflow_dispatch`), pois ele publica de novo sem conferir
a versão. Também dá para empurrar a tag à mão
(`git tag vX.Y.Z && git push origin vX.Y.Z`), que dispara o mesmo workflow.

O `.deb` nunca é versionado no git: ele nasce no CI e vai para a Release
(gitignore cobre `release/`, `*.deb` e o workspace `apt/`).
