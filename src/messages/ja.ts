import type { Messages } from '@zero/messages/pt-BR';

/**
 * 日本語; `pt-BR` é o canônico e o TypeScript confere a forma do objeto.
 * Nomes de marca, caminhos e identificadores técnicos não se traduzem.
 */
export const ja: Messages = {
  common: {
    close: '閉じる',
    cancel: 'キャンセル',
    save: '保存',
    saving: '保存しています…',
    loading: '読み込み中…',
    delete: '削除',
    confirm: '確定',
    copy: 'コピー',
    copied: 'コピーしました！',
    back: '戻る',
    skip: 'スキップ',
    next: '次へ',
    optional: '（任意）',
    search: '検索',
    clearSearch: '検索条件を消す',
  },

  app: {
    name: 'Guardinha',
    subtitle: 'Otaku Delirante',
    statusLocal: '100% ローカル / 暗号化済み',
    statusLabel: '状態:',
    nav: {
      home: 'ホーム（パスワード）',
      generator: 'パスワード生成',
      authenticator: '2FA 認証',
      backup: 'バックアップ',
      credits: 'ライセンス帰属',
      settings: '設定',
    },
    lock: '金庫をロック',
    lockTitle: '金庫をすぐにロックします',
    languageLabel: '言語',
    checkingVault: '金庫を確認しています…',
    toastCopied: 'クリップボードにコピーしました。',
  },

  auth: {
    createTitle: '金庫を作成',
    createSubtitle:
      'マスターパスワードはちょうど **24 文字**で、金庫の唯一の鍵です。' +
      'ここから外に出るものはありません：すべて `/var/lib/.guardinha/.vault/` に暗号化されたまま残ります。',
    masterLabel: 'マスターパスワード（24 文字）',
    masterPlaceholder: '例：任意の 24 文字',
    masterConfirmLabel: 'マスターパスワードをもう一度',
    masterMismatch: 'パスワードが一致しません。',
    masterLength: (needed: number, actual: number): string =>
      `マスターパスワードはちょうど ${needed} 文字である必要があります（入力は ${actual} 文字）。`,
    pinTitle: '8 桁の PIN',
    pinSubtitle: '日常的に金庫を開けるのはこの PIN です。',
    pinLabel: 'PIN（8 桁）',
    pinPlaceholder: '例：49201733',
    pinInvalid: 'PIN はちょうど 8 桁である必要があります。',
    pinMismatch: 'PIN が一致しません。',
    createAction: '金庫を作成',
    creating: '金庫を作成しています…',
    recoveryTitle: 'リカバリーフレーズ',
    recoverySubtitle:
      'PIN を忘れたときに設定し直すフレーズを、**あなたの言葉で**書いてください。' +
      'この文をアプリが生成することも保存することもしません：決めるのはあなたで、' +
      'コンピューターの外に控えを取ってください。',
    recoveryHint: '大文字小文字と余分な空白は無視されます。',
    recoveryLabel: 'あなたのリカバリーフレーズ',
    recoveryPlaceholder: '例：市場で馬が人参を食べた',
    recoveryConfirmLabel: 'リカバリーフレーズをもう一度',
    recoveryMismatch: 'フレーズが一致しません。',
    recoveryTooShort: (needed: number, actual: number): string =>
      `フレーズには少なくとも ${needed} 個の単語が必要です（入力は ${actual} 個）。`,
    unlockTitle: '金庫はロック中です',
    unlockSubtitle: 'PIN を入力して金庫を開きます。',
    tabPin: 'PIN',
    tabMaster: 'マスターパスワード',
    masterAvailable: 'PIN を 3 回間違えました：マスターパスワードでも金庫を開けます。',
    forgotPin: 'PIN を忘れた',
    unlockAction: 'ロック解除',
    unlocking: '確認しています…',
    lockout: (time: string): string => `試行回数が多すぎます。${time} 後にやり直してください。`,
    resetTitle: 'PIN を再設定',
    resetSubtitle:
      '金庫を作ったときに**あなた自身**が設定したリカバリーフレーズで新しい PIN を選んでください。',
    newPinLabel: '新しい PIN（8 桁）',
    newPinConfirmLabel: '新しい PIN をもう一度',
    resetAction: '再設定して開く',
    resetting: '再設定しています…',
    backToPin: 'PIN に戻る',
  },

  /** Medidor de força: rótulos e motivos do medidor (o bloqueio é em `errors`). */
  strength: {
    label: '強度',
    levels: {
      veryWeak: '非常に弱い',
      weak: '弱い',
      fair: 'ふつう',
      strong: '強い',
      veryStrong: '非常に強い',
    },
    reasons: {
      allSame: '同じ文字の繰り返し',
      sequence: '分かりやすい並び（1234、abcd…）',
      repeatedBlock: '同じ並びの繰り返し',
      dateLike: '日付のように見える',
      fewKinds: '文字の種類が 1 つだけ',
      lowVariety: '異なる文字が少ない',
      commonWord: 'よく使われる語を含む',
      shortWords: '単語が短すぎる',
      fewUniqueWords: '異なる単語が少ない',
      repeatedWords: '同じ単語を何度も繰り返している',
    },
    hintMaster: '大文字・小文字・数字・記号を混ぜ、日付や並び、よく使われる語は避けましょう。',
    hintPin: '8 桁だけです：日付、並び、繰り返しは使いません。',
    hintPhrase: '当てにくい単語を使い、同じ単語を何度も繰り返さないでください。',
    entryNote:
      '参考情報です：他のサイトで使っていた古いパスワードは、ここで止めることはありません。',
  },

  home: {
    title: 'パスワード',
    searchPlaceholder: 'タイトル、ユーザー名、ドメインで検索…',
    loading: '金庫を開いています…',
    emptyTitle: '認証情報がまだありません',
    emptyText: '最初の認証情報を追加して始めましょう。',
    emptyFoundTitle: '該当する認証情報がありません',
    emptyFoundText: '別の検索条件で試してください。',
    addFirst: '最初の認証情報を追加',
    newEntry: '新しい認証情報',
    entryCount: (n: number): string => `認証情報 ${n} 件`,
    copyUser: 'ユーザー名をコピー',
    copyPass: 'パスワードをコピー',
    openSite: 'ブラウザーでサイトを開く',
    toastSaved: '認証情報を保存しました。',
    toastRemoved: '認証情報を削除しました。',
    modalNew: '新しい認証情報',
    modalEdit: '認証情報を編集',
    titleLabel: 'タイトル',
    titlePlaceholder: '例：マイサービス',
    usernameLabel: 'ユーザー名',
    usernamePlaceholder: 'seu.usuario',
    passwordLabel: 'パスワード',
    passwordPlaceholder: '生成または貼り付けたパスワード',
    showPassword: 'パスワードを表示',
    hidePassword: 'パスワードを隠す',
    domainLabel: 'ドメイン',
    domainPlaceholder: 'exemplo.com.br',
    notesLabel: 'メモ',
    notesPlaceholder: '任意のメモ…',
    titleRequired: '認証情報のタイトルを入力してください。',
    invalidUsername: 'ユーザー名が正しくありません：文字、数字、`-`、`_` だけ使えます。',
    invalidDomain: 'ドメインが正しくありません（例：exemplo.com.br）。',
    deleteConfirm: 'この認証情報を削除しますか？この操作は取り消せません。',
    saveError: '認証情報を保存できませんでした。',
    removeError: '認証情報を削除できませんでした。',
  },

  generator: {
    title: 'パスワード生成',
    subtitle: '長さ、文字種ごとの文字数、個人設定を指定します。',
    lengthLabel: 'パスワードの長さ',
    lengthValue: (n: number): string => `${n} 文字`,
    upper: '大文字',
    lower: '小文字',
    numbers: '数字',
    symbols: '記号',
    quantityCount: '個数',
    entropyTitle: 'パスワードの個人設定',
    personalWordCount: '個人用の単語数（0〜5）',
    entropyPlaceholders: ['物', '数字', '車', '家具', '家電'],
    includePersonalWords: '個人用の単語をそのままパスワードに含める',
    personalWordsWarning:
      '入力した単語がそのまま含まれるため、パスワードの強度が大幅に下がる可能性があります。',
    missingPersonalWords:
      '選択した単語をすべて入力するか、そのまま含める設定をオフにしてください。',
    personalWordsTooLong: '個人用の単語がパスワード全体の長さを超えています。',
    manualCharacterUsage: (used: number, limit: number): string =>
      `設定済み文字数: ${used}/${limit}（上限 40%）。`,
    manualLimitExceeded: '個人設定がパスワード長の 40% 上限を超えています。',
    generate: '暗号学的パスワードを生成',
    copyTitle: '生成したパスワードをコピー',
    emptyLength: '0 より大きい長さを選んでください。',
    toastCopied: 'パスワードをコピーしました。',
  },

  /** Gerador de códigos de dois fatores (TOTP, RFC 6238). */
  authenticator: {
    title: '2FA 認証',
    subtitle:
      'パスワードの次にサイトが求める使い捨てコードです。' +
      '各トークンは金庫の中の個別の暗号化ファイルに保存されます。',
    loading: 'トークンを開いています…',
    emptyTitle: 'トークンがまだありません',
    emptyText:
      '該当サービスで二段階認証を有効にし、「今はスキャンできない」を選んで、' +
      '`otpauth://` のアドレスまたは設定キーをここに貼り付けてください。',
    addToken: 'トークンを追加',
    modalNew: '新しい 2FA トークン',
    modalEdit: '2FA トークンを編集',
    tabUri: 'otpauth:// アドレス',
    tabManual: 'キーを直接入力',
    uriLabel: 'サイトに表示されたアドレス',
    uriPlaceholder: 'otpauth://totp/MyService:voce?secret=…&issuer=MyService',
    uriHint:
      '秘密鍵を含めたアドレス全体を貼り付けてください。秘密鍵は**金庫の中**で暗号化され、' +
      'ここから出ることはありません。',
    uriInvalid:
      'アドレスが正しくないか、秘密鍵がありません。`otpauth://totp/` から最後まで貼り付けられているか確認してください。',
    secretLabel: '設定キー（Base32）',
    secretPlaceholder: 'JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP',
    secretHint: 'キーを正規化します：大文字化し、空白とハイフンを除きます。',
    weakSecretWarning: (bits: number): string =>
      `このキーは ${bits} ビットです。OWASP は最低 128 ビット（Base32 で 26 文字）、` +
      '理想的には 160 ビット（32 文字）を推奨しています。トークンは機能しますが、より長いキーを選ぶことをおすすめします。',
    belowRecommendedSecretWarning: (bits: number): string =>
      `このキーは ${bits} ビットで、OWASP の最低基準です。` +
      '160 ビット（Base32 で 32 文字）が推奨されています。',
    issuerLabel: 'サービス',
    issuerPlaceholder: 'マイサービス',
    accountLabel: 'アカウント',
    accountPlaceholder: 'voce@exemplo.com',
    algorithmLabel: 'アルゴリズム',
    digitsLabel: '桁数',
    periodLabel: '有効期間（秒）',
    algorithmHint:
      'アルゴリズムを決めるのは私たちではなくサービスです。**SHA1** が多くのサービスの標準で、' +
      'SHA256 と SHA512 はそれを求める少数のサービス向けです。',
    deleteConfirm: 'この 2FA トークンを削除しますか？この操作は取り消せません。',
    saveError: 'トークンを保存できませんでした。',
    removeError: 'トークンを削除できませんでした。',
    loadError: 'トークンを読み込めませんでした。',
    toastSaved: 'トークンを保存しました。',
    toastRemoved: 'トークンを削除しました。',
    toastCopied: 'コードをコピーしました。数秒で期限切れになります。',
    issuerFallback: 'サービスなし',
    expiresIn: (seconds: number): string => `${seconds} 秒後に期限切れ`,
    expiringSoon: '更新中',
  },

  /** 金庫全体の暗号化バックアップ。 */
  backup: {
    title: '金庫のバックアップ',
    subtitle:
      '暗号化済みの金庫全体を USB メモリに保管し、必要なときに復元します。パソコンの初期化後にも復元できます。',
    exportAction: 'USB にバックアップを保存',
    restoreAction: 'バックアップから復元',
    restoreHint:
      '復元すると現在の金庫は置き換わります。以後、金庫はバックアップの PIN かマスターパスワードでのみ開きます。',
    restoreConfirmTitle: 'バックアップを復元',
    restoreConfirmText:
      '現在の金庫を消し、選んだファイルの金庫を書き込みます。元に戻せません。続けますか？',
    restoreConfirmAction: '今すぐ復元',
    createRestoreAction: 'バックアップから復元',
    createRestoreHint: 'USB にバックアップがありますか？新しい金庫を作る前に復元してください。',
    working: '処理中…',
    toastBackup: (path: string): string => `バックアップを ${path} に書き込みました。`,
    toastRestored: (files: number): string => `ファイル ${files} 件で金庫を復元しました。`,
  },

  attributions: {
    title: 'ライセンス帰属',
    footer: '© 2026、データ保護 100% オフラインかつローカル',
    loopHint: 'クレジットは先頭に戻って繰り返します。',
  },

  settings: {
    title: '設定',
    panicTitle: '脅迫 PIN',
    panicSubtitle:
      'もう 1 つの PIN で、**空の金庫を開き**、本物の金庫を消すものです。' +
      '誰かに見られているときに使ってください。試行回数には数えず、ロック中でも動作します。',
    panicLabel: '脅迫 PIN（8 桁）',
    panicConfirmLabel: '脅迫 PIN をもう一度',
    panicMismatch: 'PIN が一致しません。',
    panicSet: '脅迫 PIN を設定',
    panicClear: '脅迫 PIN を削除',
    panicActive: '脅迫 PIN が有効です。金庫を消すので安全な場所に保管してください。',
    panicInactive: '脅迫 PIN は設定されていません。',
    nukeTitle: '試行回数による自動破壊',
    nukeSubtitle:
      'マスターパスワードに **N** 回連続で失敗したら金庫を消します。' +
      'リカバリーフレーズでは戻せません：それを保存していたファイルも一緒に消えます。',
    nukeLabel: 'マスターパスワードの試行回数の上限',
    nukeOff: 'オフ',
    nukeValue: (n: number): string => `${n} 回`,
    nukeEnable: '自動破壊を有効にする',
    nukeDisable: '自動破壊を無効にする',
    nukeConfirmTitle: '自動破壊の確認',
    nukeConfirmText: (n: number): string =>
      `マスターパスワードに ${n} 回連続で失敗すると、金庫は完全に消されます。` +
      '取り消せません。上限を入力して確定してください：',
    nukeConfirmLabel: '上限を入力して確定',
  },

  /** Diálogo de autodestruição sob coação e pelo botão de pânico. */
  panic: {
    title: '今すぐ金庫を破棄',
    subtitle:
      'これは**金庫全体を**、取り消せない形で消します。鍵はメモリから消え、' +
      '暗号化されたファイルは消える前に上書きされます。',
    manualTitle: '自動破壊',
    manualSubtitle:
      '誰かにパソコンを取られると思ったときに使ってください。' +
      'アプリはこの金庫が最初から存在しなかったかのように、新しい金庫の作成を求めます。',
    confirmNameLabel: '確定するために次の語を入力してください：',
    confirmWord: '破棄',
    confirmMismatch: '内容が一致しません。',
    action: '金庫を破棄',
    working: '破棄しています…',
    destroyed: '金庫を破棄しました。',
  },

  /** Erros emitidos pelo processo main (já localizados no momento da emissão). */
  errors: {
    vaultExists: '金庫はすでに存在します。',
    vaultMissing: '/var/lib/.guardinha/.vault/ に金庫が見つかりません。',
    vaultLocked: '金庫はロック中です：認証情報にアクセスする前にロックを解除してください。',
    vaultTampered: '金庫が不完全か、アプリの外で変更されています。',
    vaultUnsupportedVersion: (version?: number): string =>
      version === undefined
        ? 'この金庫は別のバージョンの Guardinha が作成したもので、このバージョンではその形式を読めません。' +
          'データが失われたわけではありません。依然として暗号化されたままディスクにあります。' +
          '作成したバージョンのアプリで開くか、金庫フォルダを削除して新しく作成してください。'
        : `この金庫は別のバージョンの Guardinha が作成したものです（形式 v${version}）。` +
          'このバージョンではその形式を読めません。データが失われたわけではありません。' +
          '依然として暗号化されたままディスクにあります。' +
          '作成したバージョンのアプリで開くか、金庫フォルダを削除して新しく作成してください。',
    vaultDestroyed: '金庫は破棄済みで、もう開けません。',
    panicPinSame: '脅迫 PIN は金庫を開く PIN と同じにはできません。',
    invalidNukeLimit: '試行回数の上限が正しくありません。',
    nukeLimitTooLow: '上限が小さすぎて、打ち間違いと区別できません。',
    vaultDirUnavailable:
      '/var/lib/.guardinha/.vault/ に書き込む権限がありません。' +
      '`sudo dpkg -i` で .deb を再インストールして、正しい権限でフォルダを作り直してください。',
    vaultAuthCancelled:
      '/var/lib/.guardinha に金庫フォルダを作成できませんでした：' +
      '管理者認証がキャンセルされたか、拒否されました。',
    wrongMaster: 'マスターパスワードが正しくありません。',
    wrongPin: 'PIN が正しくありません。',
    wrongRecovery: 'リカバリーフレーズが正しくありません。',
    invalidMasterLength: 'マスターパスワードはちょうど 24 文字である必要があります。',
    invalidPin: 'PIN はちょうど 8 桁である必要があります。',
    invalidRecovery: 'リカバリーフレーズには少なくとも 12 個の単語が必要です。',
    trivialMaster:
      'マスターパスワードが推測できます：並び、繰り返し、分かりやすい語は使わないでください。',
    trivialPin:
      'PIN が推測できます：並び（12345678）、数字の繰り返し（00000000）、' +
      '同じ並びの繰り返し（12121212）は使わないでください。',
    trivialPhrase:
      'フレーズが推測できます：単語の繰り返しが多すぎます。少なくとも 5 つの異なる単語を使ってください。',
    invalidTitle: '認証情報のタイトルを入力してください。',
    invalidUsername: 'ユーザー名が正しくありません。',
    invalidDomain: 'ドメインが正しくありません。',
    invalidId: '認証情報の識別子が正しくありません。',
    entryNotFound: '認証情報が見つかりません。',
    invalidGenerator: 'パスワード生成のパラメーターが正しくありません。',
    invalidAuthToken: '2FA トークンのパラメーターが正しくありません。',
    invalidAuthTokenUri:
      '`otpauth://` アドレスが正しくありません。`otpauth://totp/` から最後まで貼り付けられているか、' +
      'および発行者がラベルと一致しているかを確認してください。',
    invalidAuthSecret:
      '設定キーは有効な Base32（A-Z と 2-7）で、80 ビット（10 バイト）以上である必要があります。',
    authTokenNotFound: '2FA トークンが見つかりません。',
    backupInvalid: 'バックアップファイルが無効です。',
    backupCorrupted: 'バックアップが破損しているか改変されています。何も復元されませんでした。',
    backupUnsupportedVersion: (version?: number): string =>
      version === undefined
        ? 'このバックアップは別のバージョンの Guardinha で作成され、このバージョンではもう読めません。'
        : `このバックアップは別のバージョンの Guardinha (形式 v${version}) で作成され、このバージョンではもう読めません。`,
    backupWriteFailed: '保存先にファイルを書き込めませんでした。',
    internal: '金庫内部のエラーです。',
    /** Guarda de origem do IPC: o emissor não é a página oficial do app. */
    foreignFrame: 'IPC ブロック：リクエストがアプリのページからではありません。',
    containerCorrupted: '金庫のレコードが破損しています。',
    invalidManifest: '整合性マニフェストが無効です。',
    invalidKdfParams: 'KDF パラメータが無効です。',
    unknownUnlockMethod: (kind: string): string => `不明なロック解除方式：${kind}`,
    truncatedDigest: 'HMAC ダイジェストが切り詰められています。',
    shortPhrase: 'リカバリーフレーズが短すぎます。',
  },
};
