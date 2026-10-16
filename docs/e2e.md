# Testes ponta a ponta (E2E)

A suíte de `tests/**` verifica cada módulo isolado, com o `electron` trocado por
um dublê. O E2E faz o caminho oposto: sobe o **app de verdade**, compilado ou
empacotado, abre a janela e dirige a interface como um usuário faria. É o único
lugar onde o bundle compilado, o `guardinha://`, o IPC real, o Argon2id real e o
React montado aparecem juntos.

O motor é o [Playwright](https://playwright.dev) (`playwright-core`, sem
download de navegador: o navegador aqui é o próprio Electron) rodando sob o
Vitest, para o projeto continuar com um runner só. Os fluxos moram em
`e2e/support/`.

## Como rodar

O E2E **não** entra no `npm test` nem no `npm run check`: ele abre janelas,
sobe uma porta de depuração e paga Argon2id de produção a cada criação ou
desbloqueio. É sob demanda e no CI.

O app precisa estar compilado antes:

```bash
npm run build        # para o alvo compilado (out/)
npm run dist:dir     # para o alvo empacotado (release/, gera o .deb)
```

Depois:

| Comando                     | O que roda                                       |
| --------------------------- | ------------------------------------------------ |
| `npm run test:e2e`          | Jornada compilada, auto-lock e fumaça empacotada |
| `npm run test:e2e:bundled`  | Só o app compilado (`out/`)                      |
| `npm run test:e2e:packaged` | Só o payload do `.deb`                           |

Não há seletor por classe Tailwind: os testes casam por papel acessível
(`getByRole`, `getByLabel`) e por `title`, e os textos vêm de `@zero/messages`,
a mesma fonte que a tela usa.

## Os dois alvos

| Alvo                | O que é                                             | Como sobe                        | Clipboard |
| ------------------- | --------------------------------------------------- | -------------------------------- | --------- |
| Compilado (`out/`)  | O que sai do `electron-vite build`, antes do pacote | `_electron.launch` do Playwright | Sim       |
| Empacotado (`.deb`) | O payload que o usuário instala                     | `--remote-debugging-port` + CDP  | Não       |

O alvo compilado cobre os fluxos visíveis da aplicação: validações e criação do
cofre; busca, edição e exclusão de credenciais; cópia e geração de senha com
opções; criação, edição, exclusão e uso de tokens TOTP pelos dois formatos;
configurações de pânico; troca de idioma; créditos; exportação e restauração de
backup; bloqueio, login por PIN e senha mestra, redefinição do PIN, confirmação
de destruição e PIN de coação. O auto-lock também roda nessa suíte, após cinco
minutos reais de ociosidade.

O alvo empacotado continua sendo fumaça de instalação: criar cofre, adicionar e
copiar credencial, bloquear e desbloquear. Não repete cada jornada da variante
compilada; prova que o artefato instalado abre e executa os caminhos essenciais.
`test:e2e` exige que os dois alvos existam: gere-os com `npm run dist:dir`. A
suíte não marca um alvo ausente como skip silencioso.

### Por que o `.deb` não sobe pelo Playwright

O pacote liga o fusível `enableNodeCliInspectArguments: false` (`package.json`,
chave `electronFuses`): o Electron passa a ignorar `--inspect`, e é por ele que
o Playwright se anexa à main. Sem isso, o `_electron.launch` espera para sempre.
Por isso o alvo empacotado sobe como processo comum, com
`--remote-debugging-port`, e o runner conecta por CDP
(`chromium.connectOverCDP`). O CDP só enxerga o renderer, então nesse alvo não
dá para ler o clipboard do main: a cópia é verificada só pelo aviso da tela.

### Por que o CI extrai o `.deb` em vez de instalar

O perfil AppArmor que o `postinst` instala nega `network inet`. O CDP é uma
conexão TCP em `127.0.0.1`, e um perfil em _enforce_ a bloquearia: o app
instalado abriria, mas o runner não conseguiria falar com ele. Então a suíte
empacotada extrai o payload com `dpkg-deb -x` e roda o binário de dentro da
extração. É byte a byte o que o `.deb` entrega, sem instalar nada e sem
AppArmor. Para apontar a suíte para outro binário (por exemplo, o
`/opt/Guardinha/guardinha` de uma instalação real com o perfil em _complain_),
use `GUARDINHA_E2E_APP=/caminho/para/guardinha`.

## Auto-lock

A trava automática acontece depois de cinco minutos reais de ociosidade e não há
costura de relógio no app. O teste que a mede ponta a ponta fica em
`e2e/autolock.e2e.test.ts` e faz parte de `npm run test:e2e` e
`npm run test:e2e:bundled`. O teste observa o IPC do auto-lock e o retorno à
tela de desbloqueio, além da cobertura unitária do `ActivityMonitor`.

## Isolamento

Cada app lançado recebe um `HOME` e um `GUARDINHA_VAULT_DIR` próprios
(`e2e/support/env.ts`), ambos em diretório temporário: o cofre, o
`settings.json` e o cache do Chromium nunca tocam `/var/lib` nem o perfil do
usuário. `ELECTRON_RENDERER_URL` é removido para o entrypoint servir a SPA
compilada por `guardinha://`, e não o dev server.

A remoção do temporário espera o app morrer. O alvo empacotado sobe como
processo comum e o `SIGTERM` é dado ao **grupo** de processos (o app é líder do
grupo, com `detached: true`), porque o Chromium tem zygote, GPU e crashpad:
sinalizar só o líder deixaria auxiliares escrevendo no `HOME` enquanto a árvore
é apagada. A promessa do `close()` só resolve no `exit` do líder, e o `rmSync`
vai com repetição. Sem essa espera a limpeza dá `ENOTEMPTY` de forma
intermitente, e o CI, mais lento, perdia sempre: era o que reprovava o job.

## CI

O job "Testes E2E" de `.github/workflows/quality.yml` compila (`npm run
dist:dir`), roda os dois alvos sob `xvfb` e, em seguida, instala o `.deb` de
verdade (`apt-get install ./release/*.deb`) para conferir que o pacote resolve
as dependências e deixa o binário e a ação do PolicyKit no lugar. Os testes não
dependem dessa instalação: ela é a checagem do pacote, e o E2E roda sobre o
payload extraído.
