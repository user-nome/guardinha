import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import i18next from 'eslint-plugin-i18next';

/** Módulos do `main` autorizados a tocar `fs` (regra do AGENTS.md). */
const FS_OWNERS = [
  'storage',
  'entries-store',
  'auth-store',
  'structure',
  'settings',
  'shred',
  'erase',
  'protocol',
];

/** Pastas do `main` cujos módulos também tocam `fs` (o pacote `.gbk`). */
const FS_OWNER_DIRS = ['src/main/backup/*.ts'];

const FS_MESSAGE =
  'I/O de disco só nos módulos de persistência do AGENTS.md. Aqui, passe pela VaultStorageFacade.';

const RENDERER_MESSAGE =
  'O renderer e o preload não tocam disco nem Node: o renderer só conhece window.api.';

const ELECTRON_MESSAGE =
  'A superfície do Electron fica com o entrypoint e com os módulos que a usam por natureza (janela/IPC, clipboard, logs, scheme). Um módulo de domínio que precisa de Electron é sinal de que a fronteira mudou.';

const SPAWN_MESSAGE =
  'Só privilege.ts fala com o PolicyKit (pkexec). Qualquer outro módulo que queira elevar privilégio passa por ele.';

const ALIAS_MESSAGE =
  'Dentro de src/ só os aliases @zero/* (AGENTS.md): nada de caminho relativo entre pastas.';

/**
- Módulos de sistema, por capacidade. Um arquivo só toca os que o seu grupo
- concede; o resto entra em `no-restricted-imports` com a mensagem do dono.
 */
const CAPABILITIES = {
  fs: ['fs', 'node:fs', 'fs/promises', 'fs-extra'],
  electron: ['electron', 'node:electron'],
  spawn: ['child_process', 'node:child_process'],
};

const OWNER_MESSAGE = {
  fs: FS_MESSAGE,
  electron: ELECTRON_MESSAGE,
  spawn: SPAWN_MESSAGE,
};

/** Sintaxe banida no repositório inteiro. */
const BANNED_SYNTAX = [
  { selector: 'ForInStatement', message: 'Evite for-in: use Object.entries()/Object.keys().' },
  { selector: 'LabeledStatement', message: 'Labels não são permitidos.' },
  { selector: 'WithStatement', message: 'With não é permitido.' },
];

/**
- Guarda de ambiente: as duas variáveis que movem o cofre são lidas em
- `layout.ts` e reflectidas em `privilege.ts`. Qualquer outro módulo lendo-as
- seria um caminho de redirecionamento do cofre, e é por isso que o dono é
- nomeado em vez de a regra valer para todo o `src/`.
 */
const ENV_GUARD = {
  selector:
    'MemberExpression[computed=false][property.name=/^(GUARDINHA_VAR_LIB|GUARDINHA_VAULT_DIR)$/]',
  message:
    'As variáveis que movem o cofre são lidas em layout.ts (e privilege.ts): em outro módulo, isto é um caminho de redirecionamento.',
};

const ENV_OWNERS = ['src/main/layout.ts', 'src/main/privilege.ts'];

/**
- Aliases que cada camada pode usar, e os que não pode. É a matriz de camadas
- do AGENTS.md (`src/shared` sem Node nem DOM, o renderer só com `window.api`,
- o preload só com `@zero/types`), transformada em regra.
 */
const LAYERS = {
  'src/shared/**/*.ts': {
    allow: ['@zero/shared'],
    deny: ['@zero/types', '@zero/messages', '@zero/main/*', '@zero/preload/*', '@zero/renderer/*'],
    granted: [],
  },
  'src/messages/**/*.ts': {
    allow: ['@zero/messages', '@zero/types'],
    deny: ['@zero/main/*', '@zero/preload/*', '@zero/renderer/*', '@zero/shared'],
    granted: [],
  },
  'src/types/**/*.ts': {
    allow: ['@zero/types', '@zero/shared'],
    deny: ['@zero/main/*', '@zero/preload/*', '@zero/renderer/*', '@zero/messages'],
    granted: [],
  },
  'src/main/**/*.ts': {
    allow: ['@zero/main/*', '@zero/messages', '@zero/shared', '@zero/types'],
    deny: ['@zero/preload/*', '@zero/renderer/*'],
    granted: [],
  },
  'src/preload/**/*.ts': {
    allow: ['@zero/types'],
    deny: ['@zero/main/*', '@zero/messages', '@zero/renderer/*', '@zero/shared'],
    granted: ['electron'],
    messages: { fs: RENDERER_MESSAGE, spawn: RENDERER_MESSAGE },
  },
  'src/renderer/**/*.{ts,tsx}': {
    allow: ['@zero/renderer/*', '@zero/messages', '@zero/shared', '@zero/types'],
    deny: ['@zero/main/*', '@zero/preload/*'],
    granted: [],
    messages: { fs: RENDERER_MESSAGE, spawn: RENDERER_MESSAGE, electron: RENDERER_MESSAGE },
  },
};

/**
- `no-restricted-imports` de uma camada: barra caminho relativo, barra os
- aliases das outras camadas e barra os módulos de sistema que a camada não
- recebeu por `granted`.
 */
const layerImports = (label, { allow, deny, granted, messages = {} }) => [
  'error',
  {
    patterns: [
      { group: ['../*', '../../*', '../../../*', '../../../../*'], message: ALIAS_MESSAGE },
      ...deny.map((name) => ({
        group: [name],
        message: `Fronteira de camada: ${label} só importa ${allow.join(', ')}. O grafo de módulos do AGENTS.md é contrato, não sugestão.`,
      })),
    ],
    paths: Object.entries(CAPABILITIES)
      .filter(([capability]) => !granted.includes(capability))
      .flatMap(([capability, modules]) =>
        modules.map((name) => ({
          name,
          message: messages[capability] ?? OWNER_MESSAGE[capability],
        })),
      ),
  },
];

export default tseslint.config(
  {
    ignores: ['out/**', 'release/**', 'node_modules/**', 'build/**', 'coverage/**'],
  },
  // Configuração específica do i18next adicionada como objeto no array principal
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    plugins: {
      i18next,
    },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          markupOnly: true,
          validateTemplate: true,
          ignoreAttribute: ['className', 'id', 'type'],
        },
      ],
    },
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ----- type-safety máximo -----
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      'no-restricted-syntax': ['error', ...BANNED_SYNTAX],
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unnecessary-template-expression': 'error',
      '@typescript-eslint/no-array-delete': 'error',
      '@typescript-eslint/no-duplicate-type-constituents': 'error',
      '@typescript-eslint/no-implied-eval': 'error',
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/restrict-plus-operands': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/unbound-method': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/prefer-find': 'error',
      '@typescript-eslint/prefer-includes': 'error',
      '@typescript-eslint/prefer-string-starts-ends-with': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/no-meaningless-void-operator': 'error',
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],
      '@typescript-eslint/no-deprecated': 'error',
      '@typescript-eslint/no-unnecessary-type-parameters': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowDirectConstAssertionInArrowFunctions: true,
        },
      ],
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        { accessibility: 'explicit', overrides: { constructors: 'no-public' } },
      ],
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: false,
          allowNullableBoolean: false,
          allowNullableString: false,
          allowNullableNumber: false,
          allowAny: false,
        },
      ],
      '@typescript-eslint/no-unused-expressions': [
        'error',
        { allowShortCircuit: true, allowTernary: true, allowTaggedTemplates: false },
      ],
      // ----- escapes de type-safety que ninguém deve usar -----
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/prefer-ts-expect-error': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
          disallowTypeAnnotations: false,
        },
      ],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/no-var-requires': 'error',
      '@typescript-eslint/no-invalid-void-type': 'error',
      '@typescript-eslint/no-wrapper-object-types': 'error',
      '@typescript-eslint/no-unsafe-declaration-merging': 'error',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
      '@typescript-eslint/no-confusing-non-null-assertion': 'error',
      '@typescript-eslint/no-duplicate-enum-values': 'error',
      '@typescript-eslint/no-loss-of-precision': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
      '@typescript-eslint/no-unnecessary-parameter-property-assignment': 'error',
      '@typescript-eslint/no-unnecessary-qualifier': 'error',
      '@typescript-eslint/prefer-return-this-type': 'error',
      '@typescript-eslint/no-unused-private-class-members': 'error',
      '@typescript-eslint/no-useless-default-assignment': 'error',
      '@typescript-eslint/no-useless-empty-export': 'error',
      '@typescript-eslint/no-mixed-enums': 'error',
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: false }],
      '@typescript-eslint/no-empty-object-type': 'error',
      '@typescript-eslint/no-restricted-types': [
        'error',
        {
          types: {
            String: 'Tipo objeto String: use o primitivo string.',
            Number: 'Tipo objeto Number: use o primitivo number.',
            Boolean: 'Tipo objeto Boolean: use o primitivo boolean.',
            Symbol: 'Tipo objeto Symbol: use o primitivo symbol.',
            Function: 'Function é sem tipo: descreva a assinatura.',
            Object: 'Object não é o mesmo que unknown: use unknown.',
          },
        },
      ],

      // ----- o que se lança -----
      '@typescript-eslint/only-throw-error': 'error',

      // ----- boas práticas gerais -----
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-wrappers': 'error',
      'no-throw-literal': 'error',
      'no-void': ['error', { allowAsStatement: true }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': ['error', 'properties'],
      'prefer-template': 'error',
      'prefer-arrow-callback': 'error',
      curly: ['error', 'all'],
      'dot-notation': 'error',
      'no-implicit-coercion': ['error', { boolean: false, number: false, string: false }],
      'no-lonely-if': 'error',
      'no-unneeded-ternary': 'error',
      'no-useless-rename': 'error',
      'no-duplicate-imports': 'off',

      // ----- armadilhas clássicas -----
      'accessor-pairs': 'error',
      'array-callback-return': ['error', { allowImplicit: true }],
      'block-scoped-var': 'error',
      'default-case': 'error',
      'default-case-last': 'error',
      'func-name-matching': 'error',
      'getter-return': 'error',
      'guard-for-in': 'error',
      'grouped-accessor-pairs': 'error',
      'no-array-constructor': 'error',
      'no-const-assign': 'error',
      'no-constructor-return': 'error',
      'no-dupe-args': 'error',
      'no-dupe-class-members': 'error',
      'no-dupe-keys': 'error',
      'no-empty-function': ['error', { allow: ['arrowFunctions', 'functions', 'methods'] }],
      'no-extend-native': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-invalid-this': 'error',
      'no-iterator': 'error',
      'no-label-var': 'error',
      'no-loop-func': 'error',
      'no-lone-blocks': 'error',
      'no-misleading-character-class': 'error',
      'no-multi-assign': 'error',
      'no-new-func': 'error',
      'no-new-native-nonconstructor': 'error',
      'no-new-object': 'error',
      'no-new-symbol': 'error',
      'no-object-constructor': 'error',
      'no-octal-escape': 'error',
      'no-path-concat': 'error',
      'no-proto': 'error',
      'no-return-assign': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-setter-return': 'error',
      'no-underscore-dangle': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unreachable-loop': 'error',
      'no-unsafe-negation': 'error',
      'no-useless-catch': 'error',
      'no-useless-computed-key': 'error',
      'no-useless-concat': 'error',
      'no-useless-constructor': 'error',
      'no-useless-return': 'error',
      'prefer-exponentiation-operator': 'error',
      'prefer-object-spread': 'error',
      'prefer-promise-reject-errors': 'error',
      'prefer-regex-literals': 'error',
      radix: 'error',
      'require-yield': 'error',
      'symbol-description': 'error',

      // ----- limites estruturais -----
      'max-depth': ['error', 4],
      'max-nested-callbacks': ['error', 4],
      'max-params': ['error', 5],
      'default-param-last': 'error',
      'no-else-return': 'error',
      '@typescript-eslint/require-array-sort-compare': ['error', { ignoreStringArrays: true }],
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat['recommended-latest'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/exhaustive-effect-dependencies': 'error',
      'react-hooks/memo-dependencies': 'error',
      'react-hooks/memoized-effect-dependencies': 'error',
      'react-hooks/no-deriving-state-in-effects': 'error',
      'react-hooks/rule-suppression': 'error',
      'react-hooks/invariant': 'error',
    },
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'electron.vite.config.mts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      'max-lines': ['error', { max: 520, skipBlankLines: true, skipComments: true }],
      'no-restricted-syntax': ['error', ...BANNED_SYNTAX, ENV_GUARD],
      '@typescript-eslint/no-shadow': 'error',
      'no-process-exit': 'error',
      'no-script-url': 'error',
      'no-restricted-globals': [
        'error',
        { name: 'eval', message: 'eval é execução de código arbitrário.' },
        { name: 'Function', message: 'Construtor Function é eval disfarçado.' },
        { name: 'WebAssembly', message: 'WASM não faz parte do app empacotado.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'binding',
          message: 'API interna de Node, sem aviso de remoção.',
        },
        {
          object: 'process',
          property: 'dlopen',
          message: 'API interna de Node, sem aviso de remoção.',
        },
      ],
    },
  },
  {
    files: ENV_OWNERS,
    rules: {
      'no-restricted-syntax': ['error', ...BANNED_SYNTAX],
    },
  },
  ...Object.entries(LAYERS).map(([files, spec]) => ({
    files: [files],
    rules: { 'no-restricted-imports': layerImports(files, spec) },
  })),
  {
    files: ['src/main/{index,clipboard,logging,protocol}.ts'],
    rules: {
      'no-restricted-imports': layerImports('src/main', {
        ...LAYERS['src/main/**/*.ts'],
        granted: ['electron'],
      }),
    },
  },
  {
    files: [
      `src/main/{${FS_OWNERS.filter((name) => name !== 'protocol').join(',')}}.ts`,
      ...FS_OWNER_DIRS,
    ],
    rules: {
      'no-restricted-imports': layerImports('src/main', {
        ...LAYERS['src/main/**/*.ts'],
        granted: ['fs'],
      }),
    },
  },
  {
    files: ['src/main/protocol.ts'],
    rules: {
      'no-restricted-imports': layerImports('src/main', {
        ...LAYERS['src/main/**/*.ts'],
        granted: ['fs', 'electron'],
      }),
    },
  },
  {
    files: ['src/main/privilege.ts'],
    rules: {
      'no-restricted-imports': layerImports('src/main', {
        ...LAYERS['src/main/**/*.ts'],
        granted: ['spawn'],
      }),
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      'no-throw-literal': 'off',
      '@typescript-eslint/only-throw-error': [
        'error',
        { allowThrowingAny: false, allowThrowingUnknown: true },
      ],
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}', 'tools/**/*.ts'],
    rules: {
      'max-lines': ['error', { max: 750, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['*.mjs', '*.js'],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
  prettier,
);
