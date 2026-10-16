# Credenciais, gerador e força

Este documento trata do que o usuário **escreve**: as credenciais salvas, as
senhas que o app gera e a checagem de força. O cofre (onde tudo é cifrado) está
em `cofre.md`.

## Credencial salva

Cada registro é um objeto com estes campos (`Credential` em `src/types/vault.ts`):

| Campo                     | Conteúdo                                        |
| ------------------------- | ----------------------------------------------- |
| `id`                      | UUID gerado no ato da criação                   |
| `title`                   | Nome exibido na lista                           |
| `username`                | Nome de usuário; vazio é aceito                 |
| `password`                | Senha do site (fica cifrada no arquivo próprio) |
| `domain`                  | Domínio aberto pelo botão de globo              |
| `notes`                   | Observações livres                              |
| `createdAt` / `updatedAt` | Epoch em ms; a lista ordena por `updatedAt`     |

Validações na gravação (`src/main/entries.ts`):

- `title` não pode ficar vazio depois de aparado;
- `username`, quando preenchido, aceita palavra simples, `kebab-case` ou
  `snake_case` (sem espaço);
- `domain`, quando preenchido, aceita domínio com ponto e TLD ou URL
  `http`/`https`; o valor é guardado em minúsculas;
- `id`, na atualização, precisa ser UUID conhecido do manifesto (rejeita `/`,
  `\` e `\0`).

O app devolve sempre a lista completa, da credencial mais recente para a mais
antiga, e toda gravação re-sella o manifesto de integridade.

## Gerador de senhas

A aba **Gerador de Senhas** chama `window.api.generator.generate()` e monta a
senha no processo main (`generateHighEntropyPassword`, em `src/main/generator.ts`):

| Opção            | Faixa / padrão                               |
| ---------------- | -------------------------------------------- |
| Comprimento      | 0 a 72 caracteres (padrão 24)                |
| Maiúsculas       | ligado por padrão                            |
| Minúsculas       | ligado por padrão                            |
| Números          | ligado por padrão                            |
| Símbolos         | ligado por padrão                            |
| Entropia pessoal | até 5 palavras do próprio usuário (opcional) |

O conjunto de caracteres da senha é só o que está marcado: marcar apenas
Maiúsculas sai uma senha só de maiúsculas, apenas Minúsculas sai só de
minúsculas, e o mesmo vale para Números e Símbolos. A última categoria ligada
não desliga, porque sem nenhuma marcada o gerador não tem o que sortear; o
canal `generator:generate` recusa esse caso em vez de devolver vazio.

A entropia pessoal entra como deslocamento do índice de seleção: um digest
SHA-512 das palavras e 32 bytes aleatórios gerados por `crypto.randomBytes`,
combinados com `crypto.randomInt` para manter a seleção uniforme sobre o
conjunto de caracteres. Comprimento 0 devolve vazio e a tela avisa.

## Checagem de força

O cálculo mora em `src/shared/strength.ts`, um módulo **puro** importado pelo
renderer (medidor ao vivo) e pelo main (recusa na criação). A escolha da régua
por tipo de credencial (senha, mestra, PIN e frase) é a Strategy em
`src/shared/strategy.ts` (`strengthFor(kind)`). O renderer é só
conveniência: quem decide é o processo main.

### Nota

| Nível       | Faixa (senha)         | Segmentos na barra |
| ----------- | --------------------- | ------------------ |
| Muito fraca | menos de 28 bits      | 0                  |
| Fraca       | 28 a menos de 36 bits | 1                  |
| Razoável    | 36 a menos de 60 bits | 2                  |
| Forte       | 60 a menos de 80 bits | 3                  |
| Muito forte | 80 bits ou mais       | 4                  |

Os "bits" são estimativa heurística (tamanho × alfabeto, com desconto por
padrão), não cálculo criptográfico. O PIN de 8 dígitos **nunca passa de
razoável**, por honestidade do formato.

### Motivos que derrubam a nota

| Motivo           | Situação                                                |
| ---------------- | ------------------------------------------------------- |
| `allSame`        | Um caractere repetido (`00000000`)                      |
| `sequence`       | Sequência de ±1 (`12345678`, `abcdefgh`)                |
| `repeatedBlock`  | Mesmo bloco repetido (`12121212`)                       |
| `dateLike`       | 8 dígitos com cara de data (`01011990`)                 |
| `fewKinds`       | Uma classe só de caracteres (só minúsculas, só dígitos) |
| `lowVariety`     | Poucos caracteres distintos                             |
| `commonWord`     | Contém palavra ou fragmento comum (`senha`, `password`) |
| `shortWords`     | Palavras muito curtas na frase                          |
| `fewUniqueWords` | Poucas palavras distintas na frase                      |
| `repeatedWords`  | Palavra repetida 3 vezes ou mais na frase               |

### O que é bloqueado

Só o degenerado, e sempre **no main** (`createVault` e `resetPin`), antes de
qualquer tentativa contar:

| Entrada      | Regra de bloqueio                                     | Erro mostrado          |
| ------------ | ----------------------------------------------------- | ---------------------- |
| Senha mestra | 8 caracteres ou mais com repetido, bloco ou sequência | `errors.trivialMaster` |
| PIN          | 8 dígitos com dígito repetido, bloco ou sequência     | `errors.trivialPin`    |
| Frase        | 12+ palavras com 4 distintas ou menos                 | `errors.trivialPhrase` |

Data de nascimento, palavra comum e PIN fraco são **só avisos** no medidor e
não impedem a criação. A senha de uma credencial salva também nunca é
bloqueada (o aviso no `EntryModal` é informativo, porque ali pode estar a senha
antiga de outro site).

### Onde aparece

| Tela                      | Comportamento                                   |
| ------------------------- | ----------------------------------------------- |
| Criação do cofre          | Medidor na mestra, no PIN e na frase + bloqueio |
| Redefinição de PIN        | Medidor no PIN novo + bloqueio                  |
| Desbloqueio               | Sem medidor (aquilo já é credencial existente)  |
| `EntryModal` (credencial) | Medidor informativo, com nota de que é só aviso |
| Gerador                   | Medidor da senha gerada                         |

Os textos do medidor (nível, motivos, dicas) ficam em `src/messages/`, sob a
chave `strength`.

## Área de transferência

Copiar usuário ou senha passa pelo canal `clipboard:copy` e usa o clipboard
nativo no processo main (`SecureClipboardProxy`, em `src/main/clipboard.ts`),
que agenda a limpeza em 30 s. Se o usuário copiar outra coisa nesse intervalo,
o app não sobrescreve. O mesmo vale para a senha gerada. O renderer não usa
`navigator.clipboard`: toda permissão web da sessão é negada.
