import type { Messages } from '@zero/messages/pt-BR';

/**
 * 한국어. `pt-BR` é o canônico: a forma deste objeto é conferida pelo
 * TypeScript. Glossário alinhado ao app irmão (Biblioteca): 금고 é o cofre,
 * 마스터 비밀번호 é a senha mestra.
 *
 * Nomes de marca (`Guardinha`, `otpauth://`, `Base32`, `SHA1`…), caminhos e
 * identificadores técnicos não se traduzem.
 */
export const ko: Messages = {
  common: {
    close: '닫기',
    cancel: '취소',
    save: '저장',
    saving: '저장하는 중…',
    loading: '불러오는 중…',
    delete: '삭제',
    confirm: '확인',
    copy: '복사',
    copied: '복사됨!',
    back: '뒤로',
    skip: '건너뛰기',
    next: '다음',
    optional: '(선택 사항)',
    search: '검색',
    clearSearch: '검색어 지우기',
  },

  app: {
    name: 'Guardinha',
    subtitle: 'Otaku Delirante',
    statusLocal: '100% 로컬 / 암호화됨',
    statusLabel: '상태:',
    nav: {
      home: '홈 (비밀번호)',
      generator: '비밀번호 생성기',
      authenticator: '2FA 인증기',
      backup: '백업',
      credits: '라이선스',
      settings: '설정',
    },
    lock: '금고 잠그기',
    lockTitle: '금고를 지금 잠급니다',
    languageLabel: '언어',
    checkingVault: '금고를 확인하는 중…',
    toastCopied: '클립보드에 복사했습니다.',
  },

  auth: {
    createTitle: '금고 만들기',
    createSubtitle:
      '마스터 비밀번호는 정확히 **24자**이며, 금고의 유일한 열쇠입니다. ' +
      '여기에서 나가는 것은 없습니다: 모든 것이 `/var/lib/.guardinha/.vault/`에 암호화되어 남습니다.',
    masterLabel: '마스터 비밀번호 (24자)',
    masterPlaceholder: '예: 아무 24자나',
    masterConfirmLabel: '마스터 비밀번호 다시 입력',
    masterMismatch: '비밀번호가 일치하지 않습니다.',
    masterLength: (needed: number, actual: number): string =>
      `마스터 비밀번호는 정확히 ${needed}자여야 합니다(입력한 글자 수: ${actual}).`,
    pinTitle: '8자리 PIN',
    pinSubtitle: '일상적으로 금고를 여는 데 사용합니다.',
    pinLabel: 'PIN (8자리)',
    pinPlaceholder: '예: 49201733',
    pinInvalid: 'PIN은 정확히 8자리여야 합니다.',
    pinMismatch: 'PIN이 일치하지 않습니다.',
    createAction: '금고 만들기',
    creating: '금고를 만드는 중…',
    recoveryTitle: '복구 문구',
    recoverySubtitle:
      'PIN을 잊었을 때 새로 설정하는 문구를 **자기 나만의 말로** 쓰세요. ' +
      '앱은 이 문장을 만들지도 저장하지도 않습니다: 정하는 것은 본인이 하고, 컴퓨터 밖에 적어 두세요.',
    recoveryHint: '대소문자와 불필요한 공백은 무시됩니다.',
    recoveryLabel: '나의 복구 문구',
    recoveryPlaceholder: '예: 시장에서 말이 당근을 먹었다',
    recoveryConfirmLabel: '복구 문구 다시 입력',
    recoveryMismatch: '문구가 일치하지 않습니다.',
    recoveryTooShort: (needed: number, actual: number): string =>
      `문구는 최소 ${needed}개의 단어가 필요합니다(입력한 단어 수: ${actual}).`,
    unlockTitle: '금고가 잠겼습니다',
    unlockSubtitle: 'PIN을 입력해 금고를 여세요.',
    tabPin: 'PIN',
    tabMaster: '마스터 비밀번호',
    masterAvailable: 'PIN을 3번 틀렸습니다: 이제 마스터 비밀번호로도 금고를 열 수 있습니다.',
    forgotPin: 'PIN을 잊었어요',
    unlockAction: '잠금 해제',
    unlocking: '확인하는 중…',
    lockout: (time: string): string => `시도가 너무 많습니다. ${time} 후에 다시 시도하세요.`,
    resetTitle: 'PIN 재설정',
    resetSubtitle: '금고를 만들 때 **본인이** 정해 둔 복구 문구를 사용해 새 PIN을 정하세요.',
    newPinLabel: '새 PIN (8자리)',
    newPinConfirmLabel: '새 PIN 다시 입력',
    resetAction: '재설정하고 열기',
    resetting: '재설정하는 중…',
    backToPin: 'PIN으로 돌아가기',
  },

  /** Medidor de força: rótulos e motivos do medidor (o bloqueio é em `errors`). */
  strength: {
    label: '강도',
    levels: {
      veryWeak: '매우 약함',
      weak: '약함',
      fair: '보통',
      strong: '강함',
      veryStrong: '매우 강함',
    },
    reasons: {
      allSame: '같은 문자가 반복됨',
      sequence: '눈에 띄는 연속 순서 (1234, abcd…)',
      repeatedBlock: '같은 덩어리가 반복됨',
      dateLike: '날짜처럼 보임',
      fewKinds: '한 종류의 문자만 사용됨',
      lowVariety: '서로 다른 문자가 너무 적음',
      commonWord: '흔한 단어를 포함함',
      shortWords: '단어가 너무 짧음',
      fewUniqueWords: '서로 다른 단어가 너무 적음',
      repeatedWords: '같은 단어가 여러 번 반복됨',
    },
    hintMaster: '대문자, 소문자, 숫자, 기호를 섞고, 날짜·연속 순서·흔한 단어는 피하세요.',
    hintPin: '8자리뿐입니다: 날짜, 연속 순서, 반복은 쓰지 마세요.',
    hintPhrase: '추측하기 어려운 단어를 쓰고, 같은 단어를 여러 번 반복하지 마세요.',
    entryNote: '참고일 뿐입니다: 다른 사이트에서 쓰던 예전 비밀번호를 막지는 않습니다.',
  },

  home: {
    title: '비밀번호',
    searchPlaceholder: '제목, 사용자 이름 또는 도메인으로 검색…',
    loading: '금고를 여는 중…',
    emptyTitle: '아직 자격 증명이 없습니다',
    emptyText: '첫 번째 자격 증명을 추가해 보세요.',
    emptyFoundTitle: '일치하는 자격 증명이 없습니다',
    emptyFoundText: '다른 검색어로 시도해 보세요.',
    addFirst: '첫 자격 증명 추가',
    newEntry: '새 자격 증명',
    entryCount: (n: number): string => `자격 증명 ${n}개`,
    copyUser: '사용자 이름 복사',
    copyPass: '비밀번호 복사',
    openSite: '브라우저에서 사이트 열기',
    toastSaved: '자격 증명을 저장했습니다.',
    toastRemoved: '자격 증명을 삭제했습니다.',
    modalNew: '새 자격 증명',
    modalEdit: '자격 증명 편집',
    titleLabel: '제목',
    titlePlaceholder: '예: 내 서비스',
    usernameLabel: '사용자 이름',
    usernamePlaceholder: 'seu.usuario',
    passwordLabel: '비밀번호',
    passwordPlaceholder: '생성하거나 붙여넣은 비밀번호',
    showPassword: '비밀번호 표시',
    hidePassword: '비밀번호 숨기기',
    domainLabel: '도메인',
    domainPlaceholder: 'exemplo.com.br',
    notesLabel: '메모',
    notesPlaceholder: '선택 메모…',
    titleRequired: '자격 증명의 제목을 입력하세요.',
    invalidUsername: '사용자 이름이 올바르지 않습니다: 문자, 숫자, `-`, `_`만 쓸 수 있습니다.',
    invalidDomain: '도메인이 올바르지 않습니다(예: exemplo.com.br).',
    deleteConfirm: '이 자격 증명을 삭제할까요? 이 작업은 되돌릴 수 없습니다.',
    saveError: '자격 증명을 저장할 수 없습니다.',
    removeError: '자격 증명을 삭제할 수 없습니다.',
  },

  generator: {
    title: '비밀번호 생성기',
    subtitle: '길이(0~72)를 정하고 개인 취향을 넣어 엔트로피를 높이세요.',
    lengthLabel: '비밀번호 길이',
    lengthValue: (n: number): string => `${n}자`,
    upper: '대문자',
    lower: '소문자',
    numbers: '숫자',
    symbols: '기호',
    entropyTitle: '개인 엔트로피 주입 (무작위 취향 항목 5개)',
    entropyPlaceholders: ['물건', '숫자', '자동차', '가구', '가전제품'],
    generate: '암호학적 비밀번호 생성',
    copyTitle: '생성한 비밀번호 복사',
    emptyLength: '0보다 큰 길이를 선택하세요.',
    toastCopied: '비밀번호를 복사했습니다.',
  },

  /** Gerador de códigos de dois fatores (TOTP, RFC 6238). */
  authenticator: {
    title: '2FA 인증기',
    subtitle:
      '비밀번호 다음에 사이트가 요구하는 일회용 코드입니다. ' +
      '각 토큰은 금고 안의 개별 암호화 파일에 저장됩니다.',
    loading: '토큰을 여는 중…',
    emptyTitle: '아직 토큰이 없습니다',
    emptyText:
      '해당 서비스에서 2단계 인증을 켜고 "지금 스캔할 수 없음"을 선택한 뒤, ' +
      '`otpauth://` 주소나 설정 키를 여기에 붙여넣으세요.',
    addToken: '토큰 추가',
    modalNew: '새 2FA 토큰',
    modalEdit: '2FA 토큰 편집',
    tabUri: 'otpauth:// 주소',
    tabManual: '키 직접 입력',
    uriLabel: '사이트가 보여 준 주소',
    uriPlaceholder: 'otpauth://totp/MyService:voce?secret=…&issuer=MyService',
    uriHint:
      '비밀 키를 포함한 주소 전체를 붙여넣으세요. 비밀 키는 **금고 안에서** 암호화되며 ' +
      '이후로 밖으로 나가지 않습니다.',
    uriInvalid:
      '주소가 올바르지 않거나 비밀 키가 없습니다. `otpauth://totp/`부터 주소 전체를 붙였는지 확인하세요.',
    secretLabel: '설정 키 (Base32)',
    secretPlaceholder: 'JBSW Y3DP EHPK 3PXP',
    secretHint: '키를 정규화합니다: 대문자로 바꾸고 공백과 하이픈을 뺍니다.',
    issuerLabel: '서비스',
    issuerPlaceholder: '내 서비스',
    accountLabel: '계정',
    accountPlaceholder: 'voce@exemplo.com',
    algorithmLabel: '알고리즘',
    digitsLabel: '자릿수',
    periodLabel: '유효 시간 (초)',
    algorithmHint:
      '알고리즘은 우리가 아니라 서비스가 정합니다. **SHA1**이 대부분의 서비스에서 기본값이며, ' +
      'SHA256과 SHA512는 그것을 요구하는 소수 서비스용입니다.',
    deleteConfirm: '이 2FA 토큰을 삭제할까요? 이 작업은 되돌릴 수 없습니다.',
    saveError: '토큰을 저장할 수 없습니다.',
    removeError: '토큰을 삭제할 수 없습니다.',
    loadError: '토큰을 불러올 수 없습니다.',
    toastSaved: '토큰을 저장했습니다.',
    toastRemoved: '토큰을 삭제했습니다.',
    toastCopied: '코드를 복사했습니다. 몇 초 뒤에 만료됩니다.',
    issuerFallback: '서비스 없음',
    expiresIn: (seconds: number): string => `${seconds}초 후 만료`,
    expiringSoon: '갱신 중',
  },

  /** 금고 전체 암호화 백업. */
  backup: {
    title: '금고 백업',
    subtitle:
      '이미 암호화된 금고 전체를 USB에 보관하고, 필요할 때 복원하세요. 컴퓨터를 포맷한 뒤에도 복원할 수 있습니다.',
    exportAction: 'USB에 백업 저장',
    restoreAction: '백업에서 복원',
    restoreHint:
      '복원하면 현재 금고가 교체됩니다. 이후 금고는 백업의 PIN 또는 마스터 비밀번호로만 열립니다.',
    restoreConfirmTitle: '백업 복원',
    restoreConfirmText:
      '현재 금고를 지우고 선택한 파일의 금고를 기록합니다. 되돌릴 수 없습니다. 계속할까요?',
    restoreConfirmAction: '지금 복원',
    createRestoreAction: '백업에서 복원',
    createRestoreHint: 'USB에 백업이 있나요? 새 금고를 만들기 전에 복원하세요.',
    working: '처리 중…',
    toastBackup: (path: string): string => `백업을 ${path}에 기록했습니다.`,
    toastRestored: (files: number): string => `파일 ${files}개로 금고를 복원했습니다.`,
  },

  attributions: {
    title: '라이선스',
    footer: '© 2026, 100% 오프라인 및 로컬 데이터 보호',
    loopHint: '자막은 반복해서 처음으로 돌아갑니다.',
  },

  settings: {
    title: '설정',
    panicTitle: '압박 PIN',
    panicSubtitle:
      '두 번째 PIN으로 **빈 금고를 열고** 진짜 금고를 지웁니다. ' +
      '누군가 지켜보는 자리에서 사용하세요. 시도 횟수에 포함되지 않으며, 잠금이 걸려 있어도 동작합니다.',
    panicLabel: '압박 PIN (8자리)',
    panicConfirmLabel: '압박 PIN 다시 입력',
    panicMismatch: 'PIN이 일치하지 않습니다.',
    panicSet: '압박 PIN 설정',
    panicClear: '압박 PIN 제거',
    panicActive: '압박 PIN이 켜져 있습니다. 금고를 지우므로 안전한 곳에 보관하세요.',
    panicInactive: '설정된 압박 PIN이 없습니다.',
    nukeTitle: '시도 횟수 기반 자폭',
    nukeSubtitle:
      '마스터 비밀번호가 **N**회 연속 틀리면 금고를 지웁니다. ' +
      '복구 문구로는 복구할 수 없습니다: 그 문구를 담던 파일도 함께 지워집니다.',
    nukeLabel: '마스터 비밀번호 시도 횟수 한도',
    nukeOff: '꺼짐',
    nukeValue: (n: number): string => `${n}회 시도`,
    nukeEnable: '자폭 활성화',
    nukeDisable: '자폭 비활성화',
    nukeConfirmTitle: '자폭 확인',
    nukeConfirmText: (n: number): string =>
      `마스터 비밀번호가 ${n}회 연속 틀리면 금고가 완전히 삭제됩니다. ` +
      '되돌릴 수 없습니다. 한도를 입력해 확인하세요:',
    nukeConfirmLabel: '확인을 위해 한도 입력',
  },

  /** Diálogo de autodestruição sob coação e pelo botão de pânico. */
  panic: {
    title: '지금 금고 파괴',
    subtitle:
      '이것은 **금고 전체를** 되돌릴 수 없게 지웁니다. 열쇠는 메모리에서 사라지고, ' +
      '암호화 파일은 없어지기 전에 덮어써집니다.',
    manualTitle: '자폭',
    manualSubtitle:
      '누군가 컴퓨터를 빼앗을 것 같다고 생각하면 이것을 쓰세요. ' +
      '앱은 이 금고가 처음부터 없었다는 듯 새 금고를 만들라고 다시 묻습니다.',
    confirmNameLabel: '확인을 위해 아래 단어를 입력하세요:',
    confirmWord: '파괴',
    confirmMismatch: '텍스트가 일치하지 않습니다.',
    action: '금고 파괴',
    working: '파괴하는 중…',
    destroyed: '금고가 파괴되었습니다.',
  },

  /** Erros emitidos pelo processo main (já localizados no momento da emissão). */
  errors: {
    vaultExists: '금고가 이미 있습니다.',
    vaultMissing: '/var/lib/.guardinha/.vault/ 에서 금고를 찾을 수 없습니다.',
    vaultLocked: '금고가 잠겨 있습니다: 자격 증명에 접근하기 전에 잠금을 해제하세요.',
    vaultTampered: '금고가 불완전하거나 앱 밖에서 변경되었습니다.',
    vaultUnsupportedVersion: (version?: number): string =>
      version === undefined
        ? '이 금고는 다른 버전의 Guardinha가 만든 것으로, 현재 버전은 그 형식을 읽지 않습니다. ' +
          '데이터는 손실되지 않았고 여전히 암호화되어 디스크에 있습니다. 만든 버전의 앱으로 열거나, ' +
          '금고 폴더를 지우고 새로 만드세요.'
        : `이 금고는 다른 버전의 Guardinha가 만든 것입니다(형식 v${version}), 현재 버전은 그 형식을 읽지 않습니다. ` +
          '데이터는 손실되지 않았고 여전히 암호화되어 디스크에 있습니다. 만든 버전의 앱으로 열거나, ' +
          '금고 폴더를 지우고 새로 만드세요.',
    vaultDestroyed: '금고가 파괴되어 더 이상 열 수 없습니다.',
    panicPinSame: '압박 PIN은 금고를 여는 PIN과 같을 수 없습니다.',
    invalidNukeLimit: '시도 횟수 한도가 올바르지 않습니다.',
    nukeLimitTooLow: '한도가 너무 낮아 오타와 구분할 수 없습니다.',
    vaultDirUnavailable:
      '/var/lib/.guardinha/.vault/ 에 쓸 권한이 없습니다. ' +
      '`sudo dpkg -i`로 .deb를 다시 설치해 올바른 권한으로 폴더를 다시 만드세요.',
    vaultAuthCancelled:
      '/var/lib/.guardinha 의 금고 폴더를 만들지 못했습니다: ' +
      '관리자 인증이 취소되거나 거부되었습니다.',
    wrongMaster: '마스터 비밀번호가 올바르지 않습니다.',
    wrongPin: 'PIN이 올바르지 않습니다.',
    wrongRecovery: '복구 문구가 올바르지 않습니다.',
    invalidMasterLength: '마스터 비밀번호는 정확히 24자여야 합니다.',
    invalidPin: 'PIN은 정확히 8자리여야 합니다.',
    invalidRecovery: '복구 문구에는 최소 12개의 단어가 필요합니다.',
    trivialMaster: '마스터 비밀번호가 예측하기 쉽습니다: 연속 순서, 반복, 뻔한 단어는 쓰지 마세요.',
    trivialPin:
      'PIN이 예측하기 쉽습니다: 연속 순서(12345678), 같은 숫자 반복(00000000), ' +
      '덩어리 반복(12121212)을 쓰지 마세요.',
    trivialPhrase:
      '문구가 예측하기 쉽습니다: 단어가 너무 많이 반복됩니다. 최소 5개의 서로 다른 단어를 쓰세요.',
    invalidTitle: '자격 증명의 제목을 입력하세요.',
    invalidUsername: '사용자 이름이 올바르지 않습니다.',
    invalidDomain: '도메인이 올바르지 않습니다.',
    invalidId: '자격 증명 식별자가 올바르지 않습니다.',
    entryNotFound: '자격 증명을 찾을 수 없습니다.',
    invalidGenerator: '비밀번호 생성기의 매개변수가 올바르지 않습니다.',
    invalidAuthToken: '2FA 토큰 매개변수가 올바르지 않습니다.',
    invalidAuthTokenUri:
      '`otpauth://` 주소가 올바르지 않습니다. `otpauth://totp/`부터 주소 전체를 붙였는지, ' +
      '그리고 발급자가 라벨과 일치하는지 확인하세요.',
    invalidAuthSecret:
      '설정 키는 올바른 Base32(A-Z 및 2-7)여야 하며 128비트(16바이트) 이상이어야 합니다.',
    authTokenNotFound: '2FA 토큰을 찾을 수 없습니다.',
    // ---- 금고 전체 백업 ----
    backupInvalid: '백업 파일이 유효하지 않습니다.',
    backupCorrupted: '백업이 손상되었거나 변경되었습니다. 아무것도 복원되지 않았습니다.',
    backupUnsupportedVersion: (version?: number): string =>
      version === undefined
        ? '이 백업은 다른 버전의 Guardinha에서 만들어졌으며 이 버전은 더 이상 그 형식을 읽지 않습니다.'
        : `이 백업은 다른 버전의 Guardinha(형식 v${version})에서 만들어졌으며 이 버전은 더 이상 그 형식을 읽지 않습니다.`,
    backupWriteFailed: '대상에 파일을 쓰지 못했습니다.',
    internal: '금고 내부 오류.',
    /** Guarda de origem do IPC: o emissor não é a página oficial do app. */
    foreignFrame: 'IPC 차단: 요청이 앱 페이지에서 오지 않았습니다.',
    containerCorrupted: '손상된 금고 레코드입니다.',
    invalidManifest: '무결성 매니페스트가 잘못되었습니다.',
    invalidKdfParams: 'KDF 파라미터가 잘못되었습니다.',
    unknownUnlockMethod: (kind: string): string => `알 수 없는 잠금 해제 방식: ${kind}`,
    truncatedDigest: 'HMAC 다이제스트가 잘렸습니다.',
    shortPhrase: '복구 구문구가 너무 짧습니다.',
  },
};
