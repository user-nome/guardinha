# Verificador de 2FA (TOTP)

Tela **Verificador 2FA** da barra lateral: os códigos de uso único que os
serviços pedem depois da senha (bancos, marketplaces e outros).

## O padrão: RFC 6238

O app implementa **TOTP** (RFC 6238), que é o que todo serviço quer dizer com
"verificação em duas etapas por aplicativo". O código sai de
`HOTP(K, C) = Truncate(HMAC-SHA1(K, C))`, com `C` sendo o passo de tempo
`floor(unix / período)`.

### Por que SHA-1, se ele está quebrado

SHA-1 está quebrado **para colisão**, não para HMAC. E, mais importante: **o
algoritmo é escolhido pelo serviço, não pelo aplicativo**. A maioria dos
serviços verifica HMAC-SHA1 com 6 dígitos a cada 30 s. Um código "mais forte"
que o servidor rejeita vale exatamente zero.

Por isso o campo `algorithm` existe e o app sabe gerar SHA1, SHA256 e SHA512
(RFC 6238 §1.2), mas o padrão é SHA1 e ninguém deve "melhorar" o token para
SHA256. A tela diz isso no formulário.

Os testes cobrem os vetores oficiais dos Anexos B e D das RFCs 4226 e 6238
(`tests/main/totp.test.ts`). Se um deles quebrar, o app gera um código que o
serviço recusa.

### Formatos suportados

| Parâmetro   | Valores                        | Observação                          |
| ----------- | ------------------------------ | ----------------------------------- |
| `algorithm` | `SHA1`, `SHA256`, `SHA512`     | padrão `SHA1`                       |
| `digits`    | `6`, `8`                       | padrão `6`                          |
| `period`    | 15 a 300 s                     | padrão `30`                         |
| `secret`    | Base32 (RFC 4648), sem padding | mínimo aceito de 80 bits (10 bytes) |

O cadastro aceita segredos a partir de 80 bits, isto é, 10 bytes (16 caracteres
Base32). A OWASP recomenda 128 bits (16 bytes, 26 caracteres Base32) como mínimo
e 160 bits (20 bytes, 32 caracteres) como ideal; a tela mostra um aviso quando a
chave fica abaixo desses valores, sem bloquear o cadastro, porque o tamanho é
escolhido pelo serviço, não pelo usuário. A validação ocorre no parser
compartilhado e novamente no processo principal; usar SHA-1, SHA-256 ou SHA-512
continua sendo uma escolha do serviço, não uma forma de compensar uma chave
curta.

### Formato de provisionamento

`otpauth://totp/<rótulo>?secret=<Base32>&issuer=…&algorithm=…&digits=…&period=…`
(wiki do Google Authenticator, hoje em rascunho no IETF). É o que o serviço
entrega quando o usuário escolhe "não posso escanear agora".

`src/shared/otpauth.ts` faz o parse **na string**, e não com `new URL()`, por
um motivo concreto: nome de usuário do Discord carrega `#` e o serviço entrega
o `#` sem codificar; um parser de URL leria `#1234` como fragmento e jogaria
fora todo o `?secret=...`.

Duas regras de recusa que valem Explain:

- **parâmetro repetido** recusa o endereço inteiro, em vez de escolher um dos
  dois valores (o draft do IETF manda recusar);
- **emissor que não bate com o rótulo** recusa, porque é sinal de endereço
  remontado ou colado de dois serviços diferentes.

`hotp://` é recusado de propósito: HOTP é um contador, não um relógio, e gerar
um número para ele exigiria um estado de contagem que o app não tem.

## Onde o segredo mora

```
serviço mostra o segredo
        ↓
renderer (colou o texto)
        ↓ IPC: authenticator:save-uri
main: parse → AES-256-GCM → .auth/<uuid>.zka (0600)
        ↓
renderer: só recebe id, emissor, conta e os parâmetros
```

**O segredo TOTP nunca é devolvido ao renderer.** Não está em `AuthToken`, não
está em `AuthCode` e não está em nenhum retorno de `window.api`. O renderer
pede o **código já calculado** (`authenticator:codes`) e recebe
`{ id, code, remainingMs }`.

Isso não é preciosismo: o renderer é o processo com mais superfície de ataque
do app (DOM, scripts da página, `guardinha://`). Um segredo TOTP em memória ali
é uma senha de servidor esperando ser lida. `AuthToken` não tem o campo
`secret` justamente para o tipo impedir o descuido.

Como consequência, ao editar um token os metadados são preenchidos, mas o
segredo permanece em branco. Para salvar a edição pela interface atual, o
usuário precisa informar novamente a chave Base32.

## Armazenamento

Os tokens ficam em `/var/lib/.guardinha/.vault/.auth/<uuid>.zka`, um arquivo
por token, no mesmo formato dos `.zke` das credenciais:

- AES-256-GCM por arquivo, salt e IV novos a cada gravação (`crypto.ts`);
- chave derivada por HKDF-SHA512 com o rótulo de domínio
  `guardinha-vault-auth-v1`, **diferente** do `guardinha-vault-entry-v1` das
  credenciais, para que os dois nunca derivem a mesma chave nem por acidente;
- escrita atômica (`.tmp` + `rename`), arquivo em `0600`, pasta em `0700`.
- cadastro aceita a partir de 80 bits e avisa abaixo de 128 bits (mínimo da
  OWASP) e de 160 bits (recomendado), independente do algoritmo HMAC
  selecionado.

A pasta fica **dentro** de `.vault` e não como irmã por um motivo concreto: a
raiz `/var/lib/.guardinha/` é do sistema (`root:root 0711`, criada no
`postinst`) e o Cryptographic Erase não pode mexer nela. Dentro de `.vault` o
token entra na mesma varredura que a credencial.

## Integridade

O manifesto cifrado do cofre está na versão 3 e lista as duas coisas: `ids`
(credenciais) e `authIds` (tokens), com o SHA-256 dos bytes de cada arquivo em
`entries` e `auth`.

O código atual grava `v: 3`, com `ids`, `authIds` e os dois mapas de hash. A
única leitura antiga é a v2, que acompanha o container v5 e só tem `ids` e
`authIds`: ela serve à migração explícita, que re-sela o manifesto na v3 quando
o usuário confirma a atualização com as credenciais. Não há compatibilidade com
manifestos v1. O container aceita as versões 5 e 6: a 5 é lida para migrar e a
6 é a única que o app grava. Uma versão fora dessas duas é recusada como formato
incompatível antes de o manifesto ser aberto. O campo `v` fica dentro do blob
AES-256-GCM e não altera o cabeçalho do container.

O motivo de cobrir os tokens: sem isso, apagar um `.zka` ou plantar o seu
próprio passaria despercebido. O segredo TOTP trocado em silêncio é exatamente
o ataque que o manifesto existe para fechar; esse comportamento é testado em
`tests/main/authenticator.test.ts`.

## Autodestruição

`eraseVault()` apaga os `.zka` por shred e remove a pasta `.auth`. Um segredo
TOTP que sobrevive ao Cryptographic Erase é uma senha de servidor que sobrevive
a ele, então apagar o container sem os tokens seria apagar a fechadura e
deixar a chave na parede.

## Steam e outros esquemas fora do padrão

**Steam Guard não é TOTP padrão.** O Steam usa TOTP por baixo, mas exibe 5
caracteres alfanuméricos de um alfabeto customizado, não 6 dígitos numéricos.
O app **não** gera códigos de Steam: mostrar um número que o cliente recusa seria
pior que não mostrar nada.

O mesmo vale para qualquer esquema que não seja `otpauth://totp`.

## Arquivos

| Arquivo                               | Papel                                                 |
| ------------------------------------- | ----------------------------------------------------- |
| `src/shared/base32.ts`                | Base32 da RFC 4648, com normalização do que se digita |
| `src/shared/otpauth.ts`               | Parse e montagem do `otpauth://`                      |
| `src/main/totp.ts`                    | HOTP e TOTP                                           |
| `src/main/auth-store.ts`              | Os `.zka` em disco                                    |
| `src/main/authenticator.ts`           | Regras: lista, salva, apaga, gera o código            |
| `src/renderer/.../Authenticator.tsx`  | A tela                                                |
| `src/renderer/.../AuthTokenModal.tsx` | Formulário (endereço ou chave)                        |
