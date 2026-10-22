import type { Messages } from '@zero/messages/pt-BR';

/**
 * 简体中文（中国大陆）。`pt-BR` é o canônico: a forma deste objeto é conferida
 * pelo TypeScript. Glossário alinhado ao app irmão (Biblioteca): 密码库 é o
 * cofre, 主密码 é a senha mestra, 金库 é a destroyAction equivalente.
 *
 * Nomes de marca (`Guardinha`, `otpauth://`, `Base32`, `SHA1`…), caminhos e
 * identificadores técnicos não se traduzem.
 */
export const zhCN: Messages = {
  common: {
    close: '关闭',
    cancel: '取消',
    save: '保存',
    saving: '正在保存…',
    loading: '正在加载…',
    delete: '删除',
    confirm: '确认',
    copy: '复制',
    copied: '已复制！',
    back: '返回',
    skip: '跳过',
    next: '下一步',
    optional: '（可选）',
    search: '搜索',
    clearSearch: '清除搜索',
  },

  app: {
    name: 'Guardinha',
    subtitle: 'Otaku Delirante',
    statusLocal: '100% 本地 / 已加密',
    statusLabel: '状态:',
    nav: {
      home: '首页（密码）',
      generator: '密码生成器',
      authenticator: '2FA 验证器',
      backup: '备份',
      credits: '致谢',
      settings: '设置',
    },
    lock: '锁定密码库',
    lockTitle: '立即锁定密码库',
    languageLabel: '语言',
    checkingVault: '正在检查密码库…',
    toastCopied: '已复制到剪贴板。',
  },

  auth: {
    createTitle: '创建你的密码库',
    createSubtitle:
      '主密码正好是 **24 个字符**，它是密码库唯一的钥匙。' +
      '不会有任何东西离开这里：全部内容都加密存放在 `/var/lib/.guardinha/.vault/`。',
    masterLabel: '主密码（24 个字符）',
    masterPlaceholder: '例：任意 24 个字符',
    masterConfirmLabel: '再次输入主密码',
    masterMismatch: '两次输入的密码不一致。',
    masterLength: (needed: number, actual: number): string =>
      `主密码必须正好是 ${needed} 个字符（你输入了 ${actual} 个）。`,
    pinTitle: '8 位 PIN 码',
    pinSubtitle: '日常开启密码库就用它。',
    pinLabel: 'PIN 码（8 位）',
    pinPlaceholder: '例：49201733',
    pinInvalid: 'PIN 码必须正好是 8 位数字。',
    pinMismatch: '两次输入的 PIN 码不一致。',
    createAction: '创建密码库',
    creating: '正在创建密码库…',
    recoveryTitle: '恢复短语',
    recoverySubtitle:
      '用**你自己的话**写下一句用来重设 PIN 码的短语，以备忘记。' +
      '应用不会生成也不会保存这段文字：由你决定，并抄写在本机之外。',
    recoveryHint: '大小写和多余空格会被忽略。',
    recoveryLabel: '你的恢复短语',
    recoveryPlaceholder: '例：市场边的马吃了胡萝卜',
    recoveryConfirmLabel: '再次输入恢复短语',
    recoveryMismatch: '两次输入的短语不一致。',
    recoveryTooShort: (needed: number, actual: number): string =>
      `短语至少需要 ${needed} 个单词（你写了 ${actual} 个）。`,
    unlockTitle: '密码库已锁定',
    unlockSubtitle: '输入 PIN 码以打开密码库。',
    tabPin: 'PIN 码',
    tabMaster: '主密码',
    masterAvailable: 'PIN 码输错 3 次：现在也可以用主密码打开密码库。',
    forgotPin: '我忘了 PIN 码',
    unlockAction: '解锁',
    unlocking: '正在验证…',
    lockout: (time: string): string => `尝试次数过多，请在 ${time} 后重试。`,
    resetTitle: '重设 PIN 码',
    resetSubtitle: '用创建密码库时**由你本人**设定的恢复短语来选择新的 PIN 码。',
    newPinLabel: '新 PIN 码（8 位）',
    newPinConfirmLabel: '再次输入新 PIN 码',
    resetAction: '重设并打开',
    resetting: '正在重设…',
    backToPin: '返回 PIN 码',
  },

  /** Medidor de força: rótulos e motivos do medidor (o bloqueio é em `errors`). */
  strength: {
    label: '强度',
    levels: {
      veryWeak: '非常弱',
      weak: '弱',
      fair: '一般',
      strong: '强',
      veryStrong: '非常强',
    },
    reasons: {
      allSame: '同一个字符反复出现',
      sequence: '明显的连续序列（1234、abcd…）',
      repeatedBlock: '同一段重复出现',
      dateLike: '看起来像日期',
      fewKinds: '只有一类字符',
      lowVariety: '不同字符太少',
      commonWord: '含有常见单词',
      shortWords: '单词太短',
      fewUniqueWords: '不同单词太少',
      repeatedWords: '单词多次重复',
    },
    hintMaster: '混合大写、小写、数字和符号；避开日期、连续序列和常见单词。',
    hintPin: '只有 8 位：不要用日期、序列或重复。',
    hintPhrase: '使用难以猜到的单词，并且不要多次重复同样的单词。',
    entryNote: '仅供参考：这里不会阻止你在其他网站沿用旧密码。',
  },

  home: {
    title: '密码',
    searchPlaceholder: '按标题、用户名或域名搜索…',
    loading: '正在打开密码库…',
    emptyTitle: '还没有任何凭据',
    emptyText: '添加第一条凭据来开始使用。',
    emptyFoundTitle: '没有找到匹配的凭据',
    emptyFoundText: '换一个搜索词试试。',
    addFirst: '添加第一条凭据',
    newEntry: '新建凭据',
    entryCount: (n: number): string => `${n} 条凭据`,
    copyUser: '复制用户名',
    copyPass: '复制密码',
    openSite: '在浏览器中打开网站',
    toastSaved: '凭据已保存。',
    toastRemoved: '凭据已删除。',
    modalNew: '新建凭据',
    modalEdit: '编辑凭据',
    titleLabel: '标题',
    titlePlaceholder: '例：我的服务',
    usernameLabel: '用户名',
    usernamePlaceholder: 'seu.usuario',
    passwordLabel: '密码',
    passwordPlaceholder: '生成或粘贴的密码',
    showPassword: '显示密码',
    hidePassword: '隐藏密码',
    domainLabel: '域名',
    domainPlaceholder: 'exemplo.com.br',
    notesLabel: '备注',
    notesPlaceholder: '可选的备注…',
    titleRequired: '请填写凭据的标题。',
    invalidUsername: '用户名无效：只能使用字母、数字、`-` 或 `_`。',
    invalidDomain: '域名无效（例：exemplo.com.br）。',
    deleteConfirm: '删除这条凭据？此操作无法撤销。',
    saveError: '无法保存该凭据。',
    removeError: '无法删除该凭据。',
  },

  generator: {
    title: '密码生成器',
    subtitle: '设置密码长度、各字符类别的数量和个性化选项。',
    lengthLabel: '密码长度',
    lengthValue: (n: number): string => `${n} 个字符`,
    upper: '大写字母',
    lower: '小写字母',
    numbers: '数字',
    symbols: '符号',
    quantityCount: '数量',
    entropyTitle: '密码个性化',
    personalWordCount: '个人词语数量（0 到 5）',
    entropyPlaceholders: ['物品', '数字', '汽车', '家具', '电器'],
    includePersonalWords: '将这些词原样包含在密码中',
    personalWordsWarning: '这些词将按输入内容原样加入，可能显著降低密码强度。',
    missingPersonalWords: '请填写所有已选择的词，或关闭原样包含选项。',
    personalWordsTooLong: '个人词语长度超过密码总长度。',
    manualCharacterUsage: (used: number, limit: number): string =>
      `已设置字符：${used}/${limit}（上限为 40%）。`,
    manualLimitExceeded: '个人选项超过密码长度的 40%。',
    generate: '生成加密密码',
    copyTitle: '复制生成的密码',
    emptyLength: '请选择大于 0 的长度。',
    toastCopied: '密码已复制。',
  },

  /** Gerador de códigos de dois fatores (TOTP, RFC 6238). */
  authenticator: {
    title: '2FA 验证器',
    subtitle: '网站在密码之后要求的一次性验证码。每个令牌都单独加密存放在密码库内的文件中。',
    loading: '正在打开令牌…',
    emptyTitle: '还没有令牌',
    emptyText:
      '在对应服务上开启两步验证，选择“无法扫码”，' +
      '然后把 `otpauth://` 地址或设置密钥粘贴到这里。',
    addToken: '添加令牌',
    modalNew: '新建 2FA 令牌',
    modalEdit: '编辑 2FA 令牌',
    tabUri: 'otpauth:// 地址',
    tabManual: '手动输入密钥',
    uriLabel: '网站给出的地址',
    uriPlaceholder: 'otpauth://totp/MyService:voce?secret=…&issuer=MyService',
    uriHint:
      '请粘贴完整的地址，其中包含密钥。密钥会被加密存放在**密码库内部**，之后不会再离开这里。',
    uriInvalid: '地址无效或缺少密钥。请确认已完整粘贴，从 `otpauth://totp/` 开始。',
    secretLabel: '设置密钥（Base32）',
    secretPlaceholder: 'JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP',
    secretHint: '密钥会被规范化：转为大写，去掉空格和连字符。',
    issuerLabel: '服务',
    issuerPlaceholder: '我的服务',
    accountLabel: '账号',
    accountPlaceholder: 'voce@exemplo.com',
    algorithmLabel: '算法',
    digitsLabel: '位数',
    periodLabel: '有效期（秒）',
    algorithmHint:
      '算法由服务决定，而不是由我们决定。**SHA1** 是大多数服务的默认选择；' +
      'SHA256 和 SHA512 是给少数要求的服务准备的。',
    deleteConfirm: '删除这个 2FA 令牌？此操作无法撤销。',
    saveError: '无法保存该令牌。',
    removeError: '无法删除该令牌。',
    loadError: '无法加载令牌。',
    toastSaved: '令牌已保存。',
    toastRemoved: '令牌已删除。',
    toastCopied: '验证码已复制，几秒后就会失效。',
    issuerFallback: '未指定服务',
    expiresIn: (seconds: number): string => `${seconds} 秒后失效`,
    expiringSoon: '正在刷新',
  },

  /** 金库整体加密备份。 */
  backup: {
    title: '金库备份',
    subtitle: '把已加密的整个金库存到 U 盘，需要时再恢复，重装系统后也能恢复。',
    exportAction: '把备份保存到 U 盘',
    restoreAction: '从备份恢复',
    restoreHint: '恢复会替换当前金库。之后，金库只能用备份的 PIN 或主密码打开。',
    restoreConfirmTitle: '恢复备份',
    restoreConfirmText: '这会删除当前金库并写入所选文件中的金库。无法撤销。继续？',
    restoreConfirmAction: '立即恢复',
    createRestoreAction: '从备份恢复',
    createRestoreHint: 'U 盘里已有备份？先恢复，再创建新金库。',
    working: '处理中…',
    toastBackup: (path: string): string => `备份已写入 ${path}。`,
    toastRestored: (files: number): string => `已用 ${files} 个文件恢复金库。`,
  },

  attributions: {
    title: '致谢',
    footer: '© 2026，数据保护 100% 离线与本地',
    loopHint: '致谢字幕会循环从头播放。',
  },

  settings: {
    title: '设置',
    panicTitle: '胁迫 PIN 码',
    panicSubtitle:
      '另一个 PIN 码，它会**打开一个空的密码库**并抹掉真正的密码库。' +
      '在有人注视着你时使用。它不计入尝试次数，即使处于锁定状态也能用。',
    panicLabel: '胁迫 PIN 码（8 位）',
    panicConfirmLabel: '再次输入胁迫 PIN 码',
    panicMismatch: '两次输入的 PIN 码不一致。',
    panicSet: '设置胁迫 PIN 码',
    panicClear: '移除胁迫 PIN 码',
    panicActive: '胁迫 PIN 码已启用。请妥善保管：它会抹掉密码库。',
    panicInactive: '尚未设置胁迫 PIN 码。',
    nukeTitle: '按尝试次数自毁',
    nukeSubtitle:
      '主密码连续输错 **N** 次后抹掉密码库。恢复短语救不了你：保存它的那份文件也会被删除。',
    nukeLabel: '主密码的尝试次数上限',
    nukeOff: '已关闭',
    nukeValue: (n: number): string => `${n} 次尝试`,
    nukeEnable: '启用自毁',
    nukeDisable: '停用自毁',
    nukeConfirmTitle: '确认自毁',
    nukeConfirmText: (n: number): string =>
      `主密码连续输错 ${n} 次后，密码库将被彻底删除。无法撤销。请输入上限以确认：`,
    nukeConfirmLabel: '输入上限以确认',
  },

  /** Diálogo de autodestruição sob coação e pelo botão de pânico. */
  panic: {
    title: '立即销毁密码库',
    subtitle: '这会抹掉**整个密码库**，无法恢复。密钥会从内存中清除，加密文件会在消失之前被覆写。',
    manualTitle: '自毁',
    manualSubtitle:
      '如果你认为有人要抢走这台电脑，就用这个功能。' +
      '之后应用会像这个密码库从未存在过一样，要求你创建一个新的。',
    confirmNameLabel: '输入下面的词语以确认：',
    confirmWord: '销毁',
    confirmMismatch: '输入的内容不匹配。',
    action: '销毁密码库',
    working: '正在销毁…',
    destroyed: '密码库已销毁。',
  },

  /** Erros emitidos pelo processo main (já localizados no momento da emissão). */
  errors: {
    vaultExists: '密码库已存在。',
    vaultMissing: '在 /var/lib/.guardinha/.vault/ 中找不到密码库。',
    vaultLocked: '密码库已锁定：请先解锁再访问凭据。',
    vaultTampered: '密码库不完整，或在应用之外被改动过。',
    vaultUnsupportedVersion: (version?: number): string =>
      version === undefined
        ? '此密码库由另一个版本的 Guardinha 创建，本版本已不再支持该格式。数据没有丢失：' +
          '内容仍以加密形式保存在磁盘上。请用创建它的那个版本打开，或删除密码库目录后新建一个。'
        : `此密码库由另一个版本的 Guardinha 创建（格式 v${version}），本版本已不再支持该格式。` +
          '数据没有丢失：内容仍以加密形式保存在磁盘上。请用创建它的那个版本打开，或删除密码库目录后新建一个。',
    vaultDestroyed: '密码库已被销毁，无法再打开。',
    panicPinSame: '胁迫 PIN 码不能与开启密码库的 PIN 码相同。',
    invalidNukeLimit: '尝试次数上限无效。',
    nukeLimitTooLow: '上限太低，容易与输入错误混淆。',
    vaultDirUnavailable:
      '没有在 /var/lib/.guardinha/.vault/ 中写入的权限。' +
      '请用 `sudo dpkg -i` 重新安装 .deb，以正确的权限重新创建该目录。',
    vaultAuthCancelled: '未能创建 /var/lib/.guardinha 中的密码库目录：管理员认证被取消或拒绝。',
    wrongMaster: '主密码不正确。',
    wrongPin: 'PIN 码不正确。',
    wrongRecovery: '恢复短语不正确。',
    invalidMasterLength: '主密码必须正好是 24 个字符。',
    invalidPin: 'PIN 码必须正好是 8 位数字。',
    invalidRecovery: '恢复短语至少需要 12 个单词。',
    trivialMaster: '主密码容易猜到：不要用连续序列、重复或显而易见的单词。',
    trivialPin:
      'PIN 码容易猜到：不要用连续序列（12345678）、重复数字（00000000）' +
      '或重复片段（12121212）。',
    trivialPhrase: '短语容易猜到：单词重复太多。请至少使用 5 个不同的单词。',
    invalidTitle: '请填写凭据的标题。',
    invalidUsername: '用户名无效。',
    invalidDomain: '域名无效。',
    invalidId: '凭据标识无效。',
    entryNotFound: '未找到该凭据。',
    invalidGenerator: '密码生成器的参数无效。',
    invalidAuthToken: '2FA 令牌参数无效。',
    invalidAuthTokenUri:
      '`otpauth://` 地址无效。请确认已完整粘贴（从 `otpauth://totp/` 开始），' +
      '并且签发方与标签一致。',
    invalidAuthSecret: '设置密钥必须是有效的 Base32（A-Z 和 2-7），且至少包含 128 位（16 字节）。',
    authTokenNotFound: '未找到该 2FA 令牌。',
    // ---- 金库整体备份 ----
    backupInvalid: '备份文件无效。',
    backupCorrupted: '备份已损坏或被改动。未恢复任何内容。',
    backupUnsupportedVersion: (version?: number): string =>
      version === undefined
        ? '此备份由另一版本的 Guardinha 创建，当前版本已不再读取该格式。'
        : `此备份由另一版本的 Guardinha 创建（格式 v${version}），当前版本已不再读取该格式。`,
    backupWriteFailed: '无法把文件写入目标位置。',
    internal: '密码库内部错误。',
    /** Guarda de origem do IPC: o emissor não é a página oficial do app. */
    foreignFrame: 'IPC 已阻止：请求并非来自应用页面。',
    containerCorrupted: '密码库记录已损坏。',
    invalidManifest: '完整性清单无效。',
    invalidKdfParams: 'KDF 参数无效。',
    unknownUnlockMethod: (kind: string): string => `未知的解锁方式：${kind}`,
    truncatedDigest: 'HMAC 摘要被截断。',
    shortPhrase: '恢复短语过短。',
  },
};
