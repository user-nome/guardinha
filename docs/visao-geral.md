# Visão geral

O Guardinha é um aplicativo desktop para guardar credenciais em **100% offline**:
não abre conexão de rede, não tem conta, não tem servidor e não sincroniza nada.
Ele roda em Electron, é escrito em TypeScript com React na interface e é
empacotado como `.deb` para o Linux Mint 22.X (Zena).

O usuário cria um cofre com três credenciais (senha mestra de 24 caracteres,
PIN de 8 dígitos e frase de recuperação escrita por ele mesmo) e guarda ali as
senhas dos sites que quiser. O login do dia a dia é só pelo PIN.

## O que o app não é

- Não é nuvem: nada sai da máquina. Não há backend, telemetria nem analytics.
- Não gera frase de recuperação: o app só conta as palavras (mínimo de 12) e
  exige que o usuário tenha escrito a frase dele.
- Não sincroniza nem importa senhas de outro gerenciador; a entrada é manual.
- Não substitui o navegador nem preenche formulários: ele guarda e copia.
- Não tem login por biometria, SSO nem compartilhamento com outras pessoas.

## O que ele faz

- Cria e desbloqueia o cofre em `/var/lib/.guardinha/.vault/` (fora de `~/`,
  sobrevive à limpeza da pasta do usuário).
- Guarda cada credencial em um arquivo cifrado próprio (`.entries/<uuid>.zke`)
  e detecta arquivo removido ou injetado de fora do app.
- Guarda tokens TOTP em arquivos cifrados próprios (`.auth/<uuid>.zka`); o
  segredo nunca é devolvido ao renderer.
- Copia usuário e senha com limpeza automática do clipboard após 30 s.
- Abre o site da credencial no navegador padrão, gera senhas aleatórias e
  mede a força das credenciais enquanto o usuário digita.
- Fala português do Brasil, chinês simplificado, coreano, japonês e inglês,
  com o idioma escolhido na Sidebar.
- Destrói o cofre quando o usuário manda: um botão de autodestruição que
  sobrescreve e apaga tudo, um PIN de coação que abre um cofre vazio enquanto
  apaga o de verdade, e uma autodestruição opcional por tentativas da senha
  mestra (desligada por padrão).

## Dependências de produção

São 5 pacotes em `dependencies`, todos com licenças permissivas (MIT/ISC e
afins). Pense duas vezes antes de adicionar um: regra do `CONTRIBUTING.md`
(seção 4) e registro em `THIRD-PARTY-NOTICES.txt`.

| Pacote                | Papel                                                 |
| --------------------- | ----------------------------------------------------- |
| `react` / `react-dom` | Interface (Sidebar, Home, modais)                     |
| `hash-wasm`           | Argon2id em WebAssembly dentro do processo main       |
| `fs-extra`            | Leitura e gravação de arquivos com tratamento de erro |
| `lucide-react`        | Ícones da interface                                   |

O Electron é dependência de desenvolvimento, mas é a plataforma: o
electron-builder o embute no `.deb`. O restante (Vite, Tailwind CSS 4, Vitest,
ESLint, Prettier, electron-builder) é ferramenta de desenvolvimento e também
não entra no pacote.

## Ciclo de vida resumido

1. Primeira execução: o app cria o cofre (ou chama o PolicyKit para criar a
   pasta em `/var/lib`, com a senha de administrador digitada no sistema).
2. Desbloqueio: PIN normalmente; a senha mestra só aparece após 3 falhas de PIN.
3. Uso: listar, criar, editar e apagar credenciais, copiar, abrir o site.
4. Bloqueio: botão de bloqueio, inatividade de 5 minutos ou falha de tentativa
   (trava exponencial de 10 s até 24 h).
5. Destruição: pelo botão de autodestruição, pelo PIN de coação ou (opcional)
   por excesso de tentativas da senha mestra. Em todos os casos a chave sai da
   memória antes de o disco ser tocado.

## Glossário

- **Senha mestra**: string de exatamente 24 caracteres que embrulha a chave do
  cofre. Serve para desbloquear quando o PIN falha demais, nunca como login
  corrente.
- **PIN**: 8 dígitos, credencial de uso diário e o elo mais fraco do cofre
  (10^8 candidatas), por isso o custo do Argon2id é o mais alto.
- **Frase de recuperação**: 12 ou mais palavras escritas pelo usuário; existe
  **só** para redefinir o PIN esquecido, nunca para desbloquear.
- **Chave do cofre**: segredo de 32 bytes em memória do processo main; embrulhado
  no `vault.zkv` e zerado no bloqueio.
- **`vault.zkv`**: arquivo único com as chaves embrulhadas por método (cada uma
  com o custo de Argon2id do seu método), a trava exponencial, o limite de
  autodestruição e o manifesto cifrado. A versão atual é a 6; a 5 é lida só
  para migrar (`cofre.md`).
- **`.zke`**: arquivo cifrado de uma credencial salva, com salt e IV próprios.
- **Argon2id (KDF)**: função de derivação que torna cada tentativa de adivinhação
  cara em CPU e memória; o custo varia por método (`cofre.md`).
- **Trava exponencial**: espera crescente a cada falha, persistida no disco do
  cofre (10 s, 30 s, 1 min, 1 h e depois 24 h).
- **Aliases `@zero/*`**: atalhos de import usados dentro de `src/`
  (`arquitetura.md`).
