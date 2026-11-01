# Limites de segurança e responsabilidades

Este documento descreve o que o Guardinha controla e o que depende do sistema
operacional, da pessoa usuária ou do serviço em que a credencial será usada.
As medidas reduzem riscos específicos; não tornam seguro um dispositivo ou site
comprometido.

## O que o Guardinha protege

- Mantém o cofre e os tokens TOTP cifrados em arquivos locais. A chave do cofre
  fica no processo principal enquanto a sessão está aberta e é zerada ao
  bloquear ou após dois minutos de inatividade.
- Valida os dados locais antes de gravá-los e restringe a comunicação entre a
  interface e o processo principal aos canais IPC autorizados.
- Confirma antes de copiar uma senha e mostra o domínio cadastrado para a pessoa
  comparar com o endereço exibido no navegador. O clipboard é limpo após dez
  segundos, salvo se outra aplicação ou a própria pessoa o alterar antes.
- Calcula códigos TOTP no processo principal. O segredo do token fica cifrado e
  não é enviado à interface; o renderer recebe somente os metadados e o código
  calculado.
- Funciona sem conexão de rede própria, sem conta Guardinha, servidor ou
  sincronização. Ao pedir para abrir um site, o Guardinha entrega o endereço ao
  navegador padrão; a conexão subsequente é feita pelo navegador, fora do app.

Essas medidas protegem o armazenamento e os fluxos internos do Guardinha. Elas
não atestam a identidade ou a segurança de um site.

## O que o Guardinha não cobre

- Não inspeciona as abas nem o endereço ativo do navegador. A confirmação de
  cópia e o domínio cadastrado são um auxílio para conferência manual, não uma
  verificação automática da origem. O app não preenche formulários nem confirma
  onde uma senha será usada.
- Validar que um endereço tem formato HTTPS não prova que o site é legítimo,
  que pertence à organização esperada ou que é o destino correto da conta.
  Também não evita phishing, páginas falsas ou captura da senha depois que ela
  é copiada.
- Não recebe do site a confirmação de que um código TOTP foi aceito e não pode
  revogar um código já exibido. O serviço controla a validação, a recuperação
  da conta e a revogação dos fatores cadastrados.
- Não implementa passkeys, WebAuthn ou FIDO2. Se um serviço oferecer esse
  recurso, a validação da passkey e a vinculação à origem são feitas pelo
  serviço e pelo navegador ou autenticador compatível, não pelo Guardinha.
- Não detecta nem remove keyloggers, malware ou um sistema operacional
  comprometido. Um processo malicioso com acesso ao mesmo usuário pode
  observar teclado, tela, clipboard ou memória; enquanto o cofre está aberto,
  dados decifrados também precisam estar disponíveis para a interface.
- Não protege contra acesso físico a uma sessão já desbloqueada, força bruta
  offline sobre uma cópia do cofre, perda do dispositivo ou falhas do hardware.
  A trava de tentativas do app não limita tentativas feitas diretamente contra
  uma cópia do arquivo.

## Defesas do sistema operacional

O pacote `.deb` tenta instalar um perfil AppArmor que restringe o acesso do
processo do Guardinha a arquivos e nega conexões de rede quando o sistema
suporta e consegue carregar o perfil. Essa camada não é garantida em todos os
sistemas e não é um detector de malware. Ela também não impede, por si só, que
outro programa malicioso executado como a mesma pessoa capture teclado,
clipboard ou dados em memória. A conexão do site é aberta pelo navegador
padrão, fora do processo confinado do Guardinha.

## Divisão de responsabilidades

| Parte                           | Responsabilidade                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guardinha                       | Proteger os arquivos locais segundo o modelo do app, validar os dados que recebe, mostrar o aviso antes de copiar e calcular localmente os códigos TOTP cadastrados.                                                |
| Pessoa usuária                  | Conferir o endereço completo no navegador antes de fornecer credenciais, interromper o uso se o domínio não corresponder ao esperado, proteger a sessão do sistema e manter cópias de segurança em local confiável. |
| Serviço ou site                 | Proteger o próprio domínio e a sessão de acesso, validar a senha e o TOTP, oferecer recuperação e revogação de conta e implementar corretamente os fatores de autenticação que suporta.                             |
| Sistema operacional e navegador | Proteger a conta local e o processo do navegador, aplicar atualizações e executar a conexão HTTPS com o site selecionado.                                                                                           |

O aviso do Guardinha não transfere para a pessoa usuária a responsabilidade por
defeitos do app. Ele explicita uma fronteira técnica: sem integração confiável
com o navegador, o Guardinha não tem como saber qual origem está aberta.

## Antes de usar uma credencial

1. Abra o site pelo endereço oficial conhecido e confira o domínio completo na
   barra do navegador, inclusive a grafia. O ícone HTTPS, sozinho, não prova
   que o site é o serviço esperado.
2. Se o domínio não corresponder ao cadastro ou houver dúvida sobre a página,
   não copie nem informe a senha.
3. Use TOTP somente com os parâmetros fornecidos pelo serviço. Se o código for
   recusado, o Guardinha não consegue determinar a causa nem alterar o estado
   da conta no serviço.
4. Mantenha o sistema e o navegador atualizados e bloqueie a sessão do
   dispositivo quando não estiver em uso.

Para detalhes de implementação das medidas, consulte o [mapa de segurança](seguranca.md)
e a [política de segurança](../SECURITY.md).
