/** Mensagens em português (Brasil): o canônico de todas as chaves e assinaturas. */
export const ptBR = {
  common: {
    close: 'Fechar',
    cancel: 'Cancelar',
    save: 'Salvar',
    saving: 'Salvando…',
    loading: 'Carregando…',
    delete: 'Excluir',
    confirm: 'Confirmar',
    copy: 'Copiar',
    copied: 'Copiado!',
    back: 'Voltar',
    skip: 'Pular',
    next: 'Avançar',
    optional: '(opcional)',
    search: 'Buscar',
    clearSearch: 'Limpar busca',
  },

  app: {
    name: 'Guardinha',
    subtitle: 'Otaku Delirante',
    statusLocal: '100% Local / Criptografado',
    statusLabel: 'Status:',
    nav: {
      home: 'Início (Senhas)',
      generator: 'Gerador de Senhas',
      authenticator: 'Verificador 2FA',
      backup: 'Backup',
      credits: 'Atribuições',
      settings: 'Configurações',
    },
    lock: 'Bloquear cofre',
    lockTitle: 'Bloqueia o cofre agora',
    languageLabel: 'Idioma',
    checkingVault: 'Verificando o cofre…',
    toastCopied: 'Copiado para a área de transferência.',
  },

  auth: {
    createTitle: 'Crie o seu cofre',
    createSubtitle:
      'A senha mestra tem exatamente **24 caracteres** e é a única chave do cofre. ' +
      'Nada sai daqui: tudo fica cifrado em `/var/lib/.guardinha/.vault/`.',
    masterLabel: 'Senha mestra (24 caracteres)',
    masterPlaceholder: 'Ex.: 24 caracteres quaisquer',
    masterConfirmLabel: 'Repita a senha mestra',
    masterMismatch: 'As senhas não coincidem.',
    masterLength: (needed: number, actual: number): string =>
      `A senha mestra precisa ter exatamente ${needed} caracteres (você digitou ${actual}).`,
    pinTitle: 'PIN de 8 dígitos',
    pinSubtitle: 'É com ele que você abre o cofre no dia a dia.',
    pinLabel: 'PIN (8 dígitos)',
    pinPlaceholder: 'Ex.: 49201733',
    pinInvalid: 'O PIN precisa ter exatamente 8 dígitos.',
    pinMismatch: 'Os PINs não coincidem.',
    createAction: 'Criar cofre',
    creating: 'Criando cofre…',
    recoveryTitle: 'Frase de recuperação',
    recoverySubtitle:
      'Escreva **com as suas palavras** a frase que vai redefinir o PIN se você o esquecer. ' +
      'O app não gera nem guarda esse texto: você decide e anota fora do computador.',
    recoveryHint: 'Maiúsculas e espaços extras são ignorados.',
    recoveryLabel: 'Sua frase de recuperação',
    recoveryPlaceholder: 'Ex.: o cavalo comeu cenoura na feira',
    recoveryConfirmLabel: 'Repita a frase de recuperação',
    recoveryMismatch: 'As frases não coincidem.',
    recoveryTooShort: (needed: number, actual: number): string =>
      `A frase precisa de pelo menos ${needed} palavras (você escreveu ${actual}).`,
    unlockTitle: 'Cofre bloqueado',
    unlockSubtitle: 'Informe o PIN para abrir o cofre.',
    tabPin: 'PIN',
    tabMaster: 'Senha mestra',
    masterAvailable: 'PIN incorreto 3 vezes: agora a senha mestra também pode abrir o cofre.',
    forgotPin: 'Esqueci o PIN',
    unlockAction: 'Desbloquear',
    unlocking: 'Verificando…',
    lockout: (time: string): string => `Muitas tentativas. Tente novamente em ${time}.`,
    resetTitle: 'Redefinir PIN',
    resetSubtitle:
      'Use a frase de recuperação que **você** definiu na criação do cofre para escolher um novo PIN.',
    newPinLabel: 'Novo PIN (8 dígitos)',
    newPinConfirmLabel: 'Repita o novo PIN',
    resetAction: 'Redefinir e abrir',
    resetting: 'Redefinindo…',
    backToPin: 'Voltar para o PIN',
  },

  /** Medidor de força: rótulos e motivos do medidor (o bloqueio é em `errors`). */
  strength: {
    label: 'Força',
    levels: {
      veryWeak: 'Muito fraca',
      weak: 'Fraca',
      fair: 'Razoável',
      strong: 'Forte',
      veryStrong: 'Muito forte',
    },
    reasons: {
      allSame: 'mesmo caractere repetido',
      sequence: 'sequência óbvia (1234, abcd…)',
      repeatedBlock: 'mesmo bloco repetido',
      dateLike: 'parece uma data',
      fewKinds: 'uma só categoria de caractere',
      lowVariety: 'poucos caracteres distintos',
      commonWord: 'contém palavra comum',
      shortWords: 'palavras curtas demais',
      fewUniqueWords: 'poucas palavras distintas',
      repeatedWords: 'palavras repetidas várias vezes',
    },
    hintMaster:
      'Misture maiúsculas, minúsculas, números e símbolos; evite datas, sequências e palavras comuns.',
    hintPin: 'São só 8 dígitos: nada de data, sequência ou repetição.',
    hintPhrase: 'Use palavras difíceis de adivinhar e não repita as mesmas várias vezes.',
    entryNote: 'Só informativo: a senha antiga de outro site não é bloqueada aqui.',
  },

  home: {
    title: 'Senhas',
    searchPlaceholder: 'Buscar por título, usuário ou domínio…',
    loading: 'Abrindo o cofre…',
    emptyTitle: 'Nenhuma credencial ainda',
    emptyText: 'Adicione a sua primeira credencial para começar.',
    emptyFoundTitle: 'Nenhuma credencial encontrada',
    emptyFoundText: 'Tente outro termo de busca.',
    addFirst: 'Adicionar primeira credencial',
    newEntry: 'Nova credencial',
    entryCount: (n: number): string => `${n} credencial(is)`,
    copyUser: 'Copiar usuário',
    copyPass: 'Copiar senha',
    openSite: 'Abrir o site em um navegador',
    toastSaved: 'Credencial salva.',
    toastRemoved: 'Credencial removida.',
    modalNew: 'Nova credencial',
    modalEdit: 'Editar credencial',
    titleLabel: 'Título',
    titlePlaceholder: 'Ex.: Meu Serviço',
    usernameLabel: 'Usuário',
    usernamePlaceholder: 'seu.usuario',
    passwordLabel: 'Senha',
    passwordPlaceholder: 'Senha gerada ou colada',
    showPassword: 'Mostrar senha',
    hidePassword: 'Ocultar senha',
    domainLabel: 'Domínio',
    domainPlaceholder: 'exemplo.com.br',
    notesLabel: 'Observações',
    notesPlaceholder: 'Notas opcionais…',
    titleRequired: 'Informe o título da credencial.',
    invalidUsername: 'Usuário inválido: use letras, números, `-` ou `_`.',
    invalidDomain: 'Domínio inválido (ex.: exemplo.com.br).',
    deleteConfirm: 'Excluir esta credencial? Esta ação não pode ser desfeita.',
    saveError: 'Não foi possível salvar a credencial.',
    removeError: 'Não foi possível remover a credencial.',
  },

  generator: {
    title: 'Gerador de Senhas',
    subtitle: 'Defina o tamanho, a quantidade por classe e a personalização.',
    lengthLabel: 'Tamanho da Senha',
    lengthValue: (n: number): string => `${n} caracteres`,
    upper: 'Maiúsculas',
    lower: 'Minúsculas',
    numbers: 'Números',
    symbols: 'Símbolos',
    quantityCount: 'Quantidade',
    entropyTitle: 'Personalização da senha',
    personalWordCount: 'Quantidade de palavras pessoais (0 a 5)',
    entropyPlaceholders: ['Objeto', 'Número', 'Carro', 'Móvel', 'Eletro'],
    includePersonalWords: 'Incluir as palavras literalmente na senha',
    personalWordsWarning:
      'As palavras entram exatamente como digitadas e podem reduzir bastante a força da senha.',
    missingPersonalWords: 'Preencha todas as palavras selecionadas ou desative a inclusão literal.',
    personalWordsTooLong: 'As palavras pessoais excedem o tamanho total da senha.',
    manualCharacterUsage: (used: number, limit: number): string =>
      `Caracteres definidos: ${used} de ${limit} disponíveis (limite de 40%).`,
    manualLimitExceeded: 'As opções pessoais excedem o limite de 40% do tamanho da senha.',
    generate: 'Gerar Senha Criptográfica',
    copyTitle: 'Copiar senha gerada',
    emptyLength: 'Escolha um tamanho maior que 0.',
    toastCopied: 'Senha copiada.',
  },

  /** Gerador de códigos de dois fatores (TOTP, RFC 6238). */
  authenticator: {
    title: 'Verificador 2FA',
    subtitle:
      'Códigos de uso único que os sites pedem depois da senha. ' +
      'Cada token fica em um arquivo cifrado próprio, dentro do cofre.',
    loading: 'Abrindo os tokens…',
    emptyTitle: 'Nenhum token ainda',
    emptyText:
      'Ative a verificação em duas etapas no serviço, escolha "Não posso escanear" ' +
      'e cole aqui o endereço `otpauth://` ou a chave de configuração.',
    addToken: 'Adicionar token',
    modalNew: 'Novo token de 2FA',
    modalEdit: 'Editar token de 2FA',
    tabUri: 'Endereço otpauth://',
    tabManual: 'Digitar a chave',
    uriLabel: 'Endereço que o site mostrou',
    uriPlaceholder: 'otpauth://totp/MeuServico:voce?secret=…&issuer=MeuServico',
    uriHint:
      'Cole o endereço inteiro, com o segredo. O segredo é cifrado **dentro do cofre** ' +
      'e não sai mais daqui.',
    uriInvalid:
      'Endereço inválido ou sem segredo. Confira se colou tudo, a partir de `otpauth://totp/`.',
    secretLabel: 'Chave de configuração (Base32)',
    secretPlaceholder: 'JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP',
    secretHint: 'Normalizamos a chave: maiúsculas, sem espaço e sem hífen.',
    weakSecretWarning: (bits: number): string =>
      `Esta chave tem ${bits} bits. A OWASP recomenda pelo menos 128 bits (26 caracteres Base32) ` +
      'e 160 bits (32 caracteres) como ideal. O token funciona, mas prefira uma chave maior.',
    belowRecommendedSecretWarning: (bits: number): string =>
      `Esta chave tem ${bits} bits, o mínimo da OWASP. ` +
      'O recomendado é 160 bits (32 caracteres Base32).',
    issuerLabel: 'Serviço',
    issuerPlaceholder: 'Meu Serviço',
    accountLabel: 'Conta',
    accountPlaceholder: 'voce@exemplo.com',
    algorithmLabel: 'Algoritmo',
    digitsLabel: 'Dígitos',
    periodLabel: 'Validade (segundos)',
    algorithmHint:
      'O algoritmo é escolhido pelo serviço, não por nós. **SHA1** é o padrão da ' +
      'maioria; SHA256 e SHA512 existem para os poucos que pedem.',
    deleteConfirm: 'Excluir este token de 2FA? Esta ação não pode ser desfeita.',
    saveError: 'Não foi possível salvar o token.',
    removeError: 'Não foi possível remover o token.',
    loadError: 'Não foi possível carregar os tokens.',
    toastSaved: 'Token salvo.',
    toastRemoved: 'Token removido.',
    toastCopied: 'Código copiado. Ele expira em poucos segundos.',
    issuerFallback: 'Sem serviço',
    expiresIn: (seconds: number): string => `expira em ${seconds}s`,
    expiringSoon: 'renovando',
  },

  /** Backup integral do cofre, já cifrado, gravado no pendrive. */
  backup: {
    title: 'Backup do cofre',
    subtitle:
      'Guarde uma cópia integral do cofre, já cifrada, em um pendrive e restaure ' +
      'quando precisar, inclusive depois de formatar o computador.',
    exportAction: 'Salvar backup em um pendrive',
    restoreAction: 'Restaurar de um backup',
    restoreHint:
      'A restauração substitui o cofre atual. Depois dela, o cofre só abre com o PIN ' +
      'ou a senha mestra do backup.',
    restoreConfirmTitle: 'Restaurar backup',
    restoreConfirmText:
      'Isto apaga o cofre atual e grava o do arquivo escolhido. Não há como desfazer. Continuar?',
    restoreConfirmAction: 'Restaurar agora',
    createRestoreAction: 'Restaurar de um backup',
    createRestoreHint: 'Já tem um backup no pendrive? Restaure antes de criar um cofre novo.',
    working: 'Processando…',
    toastBackup: (path: string): string => `Backup gravado em ${path}.`,
    toastRestored: (files: number): string => `Cofre restaurado com ${files} arquivo(s).`,
  },

  attributions: {
    title: 'ATRIBUIÇÕES',
    footer: '© 2026, Proteção de Dados 100% Offline & Local',
    loopHint: 'Os créditos voltam ao início em loop.',
  },

  settings: {
    title: 'Configurações',
    panicTitle: 'PIN de coação',
    panicSubtitle:
      'Um segundo PIN que **abre um cofre vazio** e apaga o cofre de verdade. ' +
      'Use-o quando alguém estiver olhando. Ele não conta tentativa e funciona mesmo com a trava ativa.',
    panicLabel: 'PIN de coação (8 dígitos)',
    panicConfirmLabel: 'Repita o PIN de coação',
    panicMismatch: 'Os PINs não coincidem.',
    panicSet: 'Definir PIN de coação',
    panicClear: 'Remover PIN de coação',
    panicActive: 'PIN de coação ativo. Guarde-o em local seguro: ele apaga o cofre.',
    panicInactive: 'Nenhum PIN de coação definido.',
    nukeTitle: 'Autodestruição por tentativas',
    nukeSubtitle:
      'Apaga o cofre depois de **N** erros seguidos da senha mestra. ' +
      'A frase de recuperação não salva: o arquivo que a guardava também é apagado.',
    nukeLabel: 'Limite de tentativas da senha mestra',
    nukeOff: 'Desligada',
    nukeValue: (n: number): string => `${n} tentativas`,
    nukeEnable: 'Ativar autodestruição',
    nukeDisable: 'Desativar autodestruição',
    nukeConfirmTitle: 'Confirmar autodestruição',
    nukeConfirmText: (n: number): string =>
      `Ao atingir ${n} erros seguidos da senha mestra, o cofre é apagado de vez. ` +
      'Não há como desfazer. Confirme digitando o limite:',
    nukeConfirmLabel: 'Digite o limite para confirmar',
  },

  /** Diálogo de autodestruição sob coação e pelo botão de pânico. */
  panic: {
    title: 'Destruir o cofre agora',
    subtitle:
      'Isto apaga **o cofre inteiro**, sem volta. A chave sai da memória e ' +
      'os arquivos cifrados são sobrescritos antes de sumirem.',
    manualTitle: 'Autodestruição',
    manualSubtitle:
      'Use isto se acreditar que alguém vai tomar o computador. O app volta a ' +
      'pedir a criação de um cofre novo, como se este nunca tivesse existido.',
    confirmNameLabel: 'Digite a palavra abaixo para confirmar:',
    confirmWord: 'DESTRUIR',
    confirmMismatch: 'O texto não confere.',
    action: 'Destruir cofre',
    working: 'Destruindo…',
    destroyed: 'Cofre destruído.',
  },

  /** Erros emitidos pelo processo main (já localizados no momento da emissão). */
  errors: {
    vaultExists: 'O cofre já existe.',
    vaultMissing: 'Cofre não encontrado em /var/lib/.guardinha/.vault/.',
    vaultLocked: 'Cofre bloqueado: desbloqueie antes de acessar as credenciais.',
    vaultTampered: 'O cofre está incompleto ou foi alterado fora do app.',
    vaultUnsupportedVersion: (version?: number): string =>
      version === undefined
        ? 'Este cofre foi criado por outra versão do Guardinha, cujo formato esta ' +
          'versão não lê mais. Nada foi perdido: os dados continuam cifrados no disco. ' +
          'Abra com a versão do app que criou o cofre ou apague a pasta do cofre e crie um novo.'
        : `Este cofre foi criado por outra versão do Guardinha (formato v${version}), que esta ` +
          'versão não lê mais. Nada foi perdido: os dados continuam cifrados no disco. ' +
          'Abra com a versão do app que criou o cofre ou apague a pasta do cofre e crie um novo.',
    vaultDestroyed: 'O cofre foi destruído e não pode mais ser aberto.',
    panicPinSame: 'O PIN de coação não pode ser igual ao PIN que abre o cofre.',
    invalidNukeLimit: 'Limite de tentativas inválido.',
    nukeLimitTooLow: 'O limite é baixo demais para não confundir com erro de digitação.',
    vaultDirUnavailable:
      'Sem permissão para gravar em /var/lib/.guardinha/.vault/. ' +
      'Reinstale o .deb com `sudo dpkg -i` para recriar a pasta com as permissões corretas.',
    vaultAuthCancelled:
      'A pasta do cofre em /var/lib/.guardinha não foi criada: ' +
      'a autenticação de administrador foi cancelada ou recusada.',
    wrongMaster: 'Senha mestra incorreta.',
    wrongPin: 'PIN incorreto.',
    wrongRecovery: 'Frase de recuperação incorreta.',
    invalidMasterLength: 'A senha mestra deve ter exatamente 24 caracteres.',
    invalidPin: 'O PIN deve ter exatamente 8 dígitos.',
    invalidRecovery: 'A frase de recuperação precisa de pelo menos 12 palavras.',
    trivialMaster: 'Senha mestra previsível: nada de sequências, repetições ou palavras óbvias.',
    trivialPin:
      'PIN previsível: nada de sequência (12345678), dígito repetido (00000000) ' +
      'ou bloco repetido (12121212).',
    trivialPhrase:
      'Frase previsível: as palavras se repetem demais. Use ao menos 5 palavras distintas.',
    invalidTitle: 'Informe o título da credencial.',
    invalidUsername: 'Usuário inválido.',
    invalidDomain: 'Domínio inválido.',
    invalidId: 'Identificador de credencial inválido.',
    entryNotFound: 'Credencial não encontrada.',
    invalidGenerator: 'Parâmetros inválidos para o gerador de senhas.',
    invalidAuthToken: 'Parâmetros de token de 2FA inválidos.',
    invalidAuthTokenUri:
      'Endereço `otpauth://` inválido. Confira se colou o endereço inteiro, ' +
      'começando em `otpauth://totp/`, e se o emissor bate com o rótulo.',
    invalidAuthSecret:
      'A chave precisa ser Base32 válido (A-Z e 2-7) e ter pelo menos 80 bits (10 bytes).',
    authTokenNotFound: 'Token de 2FA não encontrado.',
    // backup integral do cofre
    backupInvalid: 'Arquivo de backup inválido.',
    backupCorrupted: 'O backup está corrompido ou foi alterado. Nada foi restaurado.',
    backupUnsupportedVersion: (version?: number): string =>
      version === undefined
        ? 'Este backup foi criado por outra versão do Guardinha, cujo formato esta versão não lê mais.'
        : `Este backup foi criado por outra versão do Guardinha (formato v${version}), que esta versão não lê mais.`,
    backupWriteFailed: 'Não foi possível gravar o arquivo no destino.',
    internal: 'Erro interno do cofre.',
    /** Guarda de origem do IPC: o emissor não é a página oficial do app. */
    foreignFrame: 'IPC bloqueado: a requisição não veio da página do app.',
    // Invariantes internas: o contrato do código sendo violado. O caminho normal
    // converte tudo em `vaultTampered` ou `wrongPin` antes de chegar à tela, mas
    // o texto mora aqui como todo erro emitido pelo processo main.
    containerCorrupted: 'Registro do cofre corrompido.',
    invalidManifest: 'Manifesto de integridade inválido.',
    invalidKdfParams: 'Parâmetros de KDF inválidos.',
    unknownUnlockMethod: (kind: string): string => `Método de desbloqueio desconhecido: ${kind}`,
    truncatedDigest: 'Digest HMAC truncado.',
    shortPhrase: 'Frase de recuperação curta.',
  },
};

/** Forma canônica: todo idioma deve ter exatamente estas chaves e assinaturas. */
export type Messages = typeof ptBR;
