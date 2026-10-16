import type { Messages } from '@zero/messages/pt-BR';

/** Mensagens em inglês: mesma forma exata do canônico (`Messages`). */
export const en: Messages = {
  common: {
    close: 'Close',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving…',
    loading: 'Loading…',
    delete: 'Delete',
    confirm: 'Confirm',
    copy: 'Copy',
    copied: 'Copied!',
    back: 'Back',
    skip: 'Skip',
    next: 'Next',
    optional: '(optional)',
    search: 'Search',
    clearSearch: 'Clear search',
  },

  app: {
    name: 'Guardinha',
    subtitle: 'Otaku Delirante',
    statusLocal: '100% Local / Encrypted',
    statusLabel: 'Status:',
    nav: {
      home: 'Home (Passwords)',
      generator: 'Password Generator',
      authenticator: '2FA Verifier',
      backup: 'Backup',
      credits: 'Attributions',
      settings: 'Settings',
    },
    lock: 'Lock vault',
    lockTitle: 'Lock the vault now',
    languageLabel: 'Language',
    checkingVault: 'Checking the vault…',
    toastCopied: 'Copied to clipboard.',
  },

  auth: {
    createTitle: 'Create your vault',
    createSubtitle:
      'The master password is exactly **24 characters** and is the only key to the vault. ' +
      'Nothing leaves this machine: everything stays encrypted in ' +
      '`/var/lib/.guardinha/.vault/`.',
    masterLabel: 'Master password (24 characters)',
    masterPlaceholder: 'Ex.: any 24 characters',
    masterConfirmLabel: 'Repeat the master password',
    masterMismatch: 'The passwords do not match.',
    masterLength: (needed: number, actual: number): string =>
      `The master password must have exactly ${needed} characters (you typed ${actual}).`,
    pinTitle: '8-digit PIN',
    pinSubtitle: 'This is what you use to open the vault day to day.',
    pinLabel: 'PIN (8 digits)',
    pinPlaceholder: 'Ex.: 49201733',
    pinInvalid: 'The PIN must have exactly 8 digits.',
    pinMismatch: 'The PINs do not match.',
    createAction: 'Create vault',
    creating: 'Creating vault…',
    recoveryTitle: 'Recovery phrase',
    recoverySubtitle:
      'Write, **in your own words**, the phrase that will reset the PIN if you forget it. ' +
      'The app neither generates nor stores this text: you decide and keep it off this computer.',
    recoveryHint: 'Uppercase letters and extra spaces are ignored.',
    recoveryLabel: 'Your recovery phrase',
    recoveryPlaceholder: 'Ex.: the horse ate carrots at the market',
    recoveryConfirmLabel: 'Repeat your recovery phrase',
    recoveryMismatch: 'The phrases do not match.',
    recoveryTooShort: (needed: number, actual: number): string =>
      `The phrase needs at least ${needed} words (you wrote ${actual}).`,
    unlockTitle: 'Vault locked',
    unlockSubtitle: 'Enter the PIN to open the vault.',
    tabPin: 'PIN',
    tabMaster: 'Master password',
    masterAvailable: 'PIN failed 3 times: the master password can now open the vault too.',
    forgotPin: 'I forgot my PIN',
    unlockAction: 'Unlock',
    unlocking: 'Checking…',
    lockout: (time: string): string => `Too many attempts. Try again in ${time}.`,
    resetTitle: 'Reset PIN',
    resetSubtitle:
      'Use the recovery phrase **you** set when creating the vault to choose a new PIN.',
    newPinLabel: 'New PIN (8 digits)',
    newPinConfirmLabel: 'Repeat the new PIN',
    resetAction: 'Reset and open',
    resetting: 'Resetting…',
    backToPin: 'Back to PIN',
  },

  strength: {
    label: 'Strength',
    levels: {
      veryWeak: 'Very weak',
      weak: 'Weak',
      fair: 'Fair',
      strong: 'Strong',
      veryStrong: 'Very strong',
    },
    reasons: {
      allSame: 'same character repeated',
      sequence: 'obvious sequence (1234, abcd…)',
      repeatedBlock: 'same block repeated',
      dateLike: 'looks like a date',
      fewKinds: 'a single character class',
      lowVariety: 'too few distinct characters',
      commonWord: 'contains a common word',
      shortWords: 'words too short',
      fewUniqueWords: 'too few distinct words',
      repeatedWords: 'words repeated many times',
    },
    hintMaster:
      'Mix upper and lower case, numbers and symbols; avoid dates, sequences and common words.',
    hintPin: 'It is only 8 digits: no dates, sequences or repeats.',
    hintPhrase: 'Use hard-to-guess words and do not repeat the same ones over and over.',
    entryNote: 'Informational only: an old password from another site is never blocked here.',
  },

  home: {
    title: 'Passwords',
    searchPlaceholder: 'Search by title, username or domain…',
    loading: 'Opening the vault…',
    emptyTitle: 'No credentials yet',
    emptyText: 'Add your first credential to get started.',
    emptyFoundTitle: 'No credentials found',
    emptyFoundText: 'Try another search term.',
    addFirst: 'Add first credential',
    newEntry: 'New credential',
    entryCount: (n: number): string => `${n} credential(s)`,
    copyUser: 'Copy username',
    copyPass: 'Copy password',
    openSite: 'Open the site in a browser',
    toastSaved: 'Credential saved.',
    toastRemoved: 'Credential removed.',
    modalNew: 'New credential',
    modalEdit: 'Edit credential',
    titleLabel: 'Title',
    titlePlaceholder: 'Ex.: My Service',
    usernameLabel: 'Username',
    usernamePlaceholder: 'your.username',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Generated or pasted password',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    domainLabel: 'Domain',
    domainPlaceholder: 'example.com',
    notesLabel: 'Notes',
    notesPlaceholder: 'Optional notes…',
    titleRequired: 'Enter the credential title.',
    invalidUsername: 'Invalid username: use letters, numbers, `-` or `_`.',
    invalidDomain: 'Invalid domain (ex.: example.com).',
    deleteConfirm: 'Delete this credential? This action cannot be undone.',
    saveError: 'Could not save the credential.',
    removeError: 'Could not remove the credential.',
  },

  generator: {
    title: 'Password Generator',
    subtitle: 'Adjust the length (0 to 72) and inject personal taste for high entropy.',
    lengthLabel: 'Password length',
    lengthValue: (n: number): string => `${n} characters`,
    upper: 'Uppercase',
    lower: 'Lowercase',
    numbers: 'Numbers',
    symbols: 'Symbols',
    entropyTitle: 'Personal entropy injection (5 random taste items)',
    entropyPlaceholders: ['Object', 'Number', 'Car', 'Furniture', 'Appliance'],
    generate: 'Generate cryptographic password',
    copyTitle: 'Copy generated password',
    emptyLength: 'Choose a length greater than 0.',
    toastCopied: 'Password copied.',
  },

  /** One-time codes for two-step verification (TOTP, RFC 6238). */
  authenticator: {
    title: '2FA Verifier',
    subtitle:
      'One-time codes that sites ask for after the password. ' +
      'Each token lives in its own encrypted file inside the vault.',
    loading: 'Opening tokens…',
    emptyTitle: 'No token yet',
    emptyText:
      'Turn on two-step verification at the service, pick "Can\'t scan it" ' +
      'and paste here the `otpauth://` address or the setup key.',
    addToken: 'Add token',
    modalNew: 'New 2FA token',
    modalEdit: 'Edit 2FA token',
    tabUri: 'otpauth:// address',
    tabManual: 'Type the key',
    uriLabel: 'Address the site showed',
    uriPlaceholder: 'otpauth://totp/MyService:you?secret=…&issuer=MyService',
    uriHint:
      'Paste the whole address, secret included. The secret is encrypted **inside the ' +
      'vault** and never leaves it.',
    uriInvalid:
      'Invalid address or missing secret. Check that you pasted everything, starting at ' +
      '`otpauth://totp/`.',
    secretLabel: 'Setup key (Base32)',
    secretPlaceholder: 'JBSW Y3DP EHPK 3PXP',
    secretHint: 'The key is normalized: uppercase, no spaces and no dashes.',
    issuerLabel: 'Service',
    issuerPlaceholder: 'My Service',
    accountLabel: 'Account',
    accountPlaceholder: 'you@example.com',
    algorithmLabel: 'Algorithm',
    digitsLabel: 'Digits',
    periodLabel: 'Lifetime (seconds)',
    algorithmHint:
      'The service picks the algorithm, not us. **SHA1** is the default for most ' +
      'services; SHA256 and SHA512 exist for the few that ask.',
    deleteConfirm: 'Delete this 2FA token? This cannot be undone.',
    saveError: 'Could not save the token.',
    removeError: 'Could not remove the token.',
    loadError: 'Could not load the tokens.',
    toastSaved: 'Token saved.',
    toastRemoved: 'Token removed.',
    toastCopied: 'Code copied. It expires in a few seconds.',
    issuerFallback: 'No service',
    expiresIn: (seconds: number): string => `expires in ${seconds}s`,
    expiringSoon: 'renewing',
  },

  /** Full encrypted vault backup on a flash drive. */
  backup: {
    title: 'Vault backup',
    subtitle:
      'Keep a full copy of the vault, already encrypted, on a flash drive and ' +
      'restore it whenever you need, including after formatting the computer.',
    exportAction: 'Save backup to a flash drive',
    restoreAction: 'Restore from a backup',
    restoreHint:
      'Restoring replaces the current vault. After that, the vault only opens with ' +
      'the PIN or master password of the backup.',
    restoreConfirmTitle: 'Restore backup',
    restoreConfirmText:
      'This erases the current vault and writes the one from the chosen file. It cannot be undone. Continue?',
    restoreConfirmAction: 'Restore now',
    createRestoreAction: 'Restore from a backup',
    createRestoreHint:
      'Already have a backup on a flash drive? Restore before creating a new vault.',
    working: 'Working…',
    toastBackup: (path: string): string => `Backup written to ${path}.`,
    toastRestored: (files: number): string => `Vault restored from ${files} file(s).`,
  },

  attributions: {
    title: 'ATTRIBUTIONS',
    footer: '© 2026, 100% Offline & Local Data Protection',
    loopHint: 'The credits loop back to the start.',
  },

  settings: {
    title: 'Settings',
    panicTitle: 'Panic PIN',
    panicSubtitle:
      'A second PIN that **opens an empty vault** and wipes the real one. ' +
      'Use it when someone is watching. It does not count as an attempt and works even under lockout.',
    panicLabel: 'Panic PIN (8 digits)',
    panicConfirmLabel: 'Repeat the panic PIN',
    panicMismatch: 'The PINs do not match.',
    panicSet: 'Set panic PIN',
    panicClear: 'Remove panic PIN',
    panicActive: 'Panic PIN active. Keep it somewhere safe: it wipes the vault.',
    panicInactive: 'No panic PIN set.',
    nukeTitle: 'Self-destruct on attempts',
    nukeSubtitle:
      'Wipes the vault after **N** consecutive master password failures. ' +
      'The recovery phrase will not help: the file wrapping it is wiped too.',
    nukeLabel: 'Master password attempt limit',
    nukeOff: 'Disabled',
    nukeValue: (n: number): string => `${n} attempts`,
    nukeEnable: 'Enable self-destruct',
    nukeDisable: 'Disable self-destruct',
    nukeConfirmTitle: 'Confirm self-destruct',
    nukeConfirmText: (n: number): string =>
      `On reaching ${n} consecutive master password failures, the vault is wiped for good. ` +
      'There is no undo. Type the limit to confirm:',
    nukeConfirmLabel: 'Type the limit to confirm',
  },

  /** Self-destroy dialog, under coercion and from the panic button. */
  panic: {
    title: 'Destroy the vault now',
    subtitle:
      'This wipes the **entire vault**, with no way back. The key leaves memory and ' +
      'the encrypted files are overwritten before they disappear.',
    manualTitle: 'Self-destruct',
    manualSubtitle:
      'Use this if you believe someone is about to take the computer. The app goes back ' +
      'to asking for a new vault, as if this one had never existed.',
    confirmNameLabel: 'Type the word below to confirm:',
    confirmWord: 'DESTROY',
    confirmMismatch: 'The text does not match.',
    action: 'Destroy vault',
    working: 'Destroying…',
    destroyed: 'Vault destroyed.',
  },

  errors: {
    vaultExists: 'The vault already exists.',
    vaultMissing: 'Vault not found in /var/lib/.guardinha/.vault/.',
    vaultDestroyed: 'The vault was destroyed and can no longer be opened.',
    panicPinSame: 'The panic PIN cannot be the same as the PIN that opens the vault.',
    invalidNukeLimit: 'Invalid attempt limit.',
    nukeLimitTooLow: 'The limit is too low to tell apart from a typo.',
    vaultLocked: 'Vault locked: unlock it before accessing credentials.',
    vaultTampered: 'The vault is incomplete or was altered outside the app.',
    vaultUnsupportedVersion: (version?: number): string =>
      version === undefined
        ? 'This vault was created by another version of Guardinha, whose format this ' +
          'version no longer reads. Nothing was lost: your data is still encrypted on disk. ' +
          'Open it with the version of the app that created it, or delete the vault folder and create a new one.'
        : `This vault was created by another version of Guardinha (format v${version}), which this ` +
          'version no longer reads. Nothing was lost: your data is still encrypted on disk. ' +
          'Open it with the version of the app that created it, or delete the vault folder and create a new one.',
    vaultDirUnavailable:
      'No permission to write to /var/lib/.guardinha/.vault/. ' +
      'Reinstall the .deb with `sudo dpkg -i` to recreate the folder with the right permissions.',
    vaultAuthCancelled:
      'The vault folder in /var/lib/.guardinha was not created: ' +
      'administrator authentication was cancelled or refused.',
    wrongMaster: 'Wrong master password.',
    wrongPin: 'Wrong PIN.',
    wrongRecovery: 'Wrong recovery phrase.',
    invalidMasterLength: 'The master password must have exactly 24 characters.',
    invalidPin: 'The PIN must have exactly 8 digits.',
    invalidRecovery: 'The recovery phrase must have at least 12 words.',
    trivialMaster: 'Predictable master password: no sequences, repeats or obvious words.',
    trivialPin:
      'Predictable PIN: no sequence (12345678), repeated digit (00000000) ' +
      'or repeated block (12121212).',
    trivialPhrase: 'Predictable phrase: the words repeat too much. Use at least 5 distinct words.',
    invalidTitle: 'Enter the credential title.',
    invalidUsername: 'Invalid username.',
    invalidDomain: 'Invalid domain.',
    invalidId: 'Invalid credential identifier.',
    entryNotFound: 'Credential not found.',
    invalidGenerator: 'Invalid password generator parameters.',
    invalidAuthToken: 'Invalid 2FA token parameters.',
    invalidAuthTokenUri:
      'Invalid `otpauth://` address. Check that you pasted the whole address, ' +
      'starting with `otpauth://totp/`, and that the issuer matches the label.',
    invalidAuthSecret:
      'The setup key must be valid Base32 (A-Z and 2-7) and contain at least 80 bits (10 bytes).',
    authTokenNotFound: '2FA token not found.',
    // ---- full vault backup ----
    backupInvalid: 'Invalid backup file.',
    backupCorrupted: 'The backup is corrupted or was altered. Nothing was restored.',
    backupUnsupportedVersion: (version?: number): string =>
      version === undefined
        ? 'This backup was created by another version of Guardinha, whose format this version no longer reads.'
        : `This backup was created by another version of Guardinha (format v${version}), which this version no longer reads.`,
    backupWriteFailed: 'Could not write the file to the destination.',
    internal: 'Internal vault error.',
    /** Guarda de origem do IPC: o emissor não é a página oficial do app. */
    foreignFrame: 'IPC blocked: the request did not come from the app page.',
    containerCorrupted: 'Corrupted vault record.',
    invalidManifest: 'Invalid integrity manifest.',
    invalidKdfParams: 'Invalid KDF parameters.',
    unknownUnlockMethod: (kind: string): string => `Unknown unlock method: ${kind}`,
    truncatedDigest: 'Truncated HMAC digest.',
    shortPhrase: 'Recovery phrase too short.',
  },
};
