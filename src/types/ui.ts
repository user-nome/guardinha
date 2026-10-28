/** Tipagem de domínio das telas: contrato entre App, Sidebar e a tela de acesso. */

/** Tela da barra lateral. */
export type TabType = 'home' | 'generator' | 'authenticator' | 'backup' | 'credits' | 'settings';

/** Chave do rótulo de navegação (`m.app.nav[…]`), o mesmo conjunto de `TabType`. */
export type NavLabelKey = TabType;

/** Passo do formulário de criação do cofre. */
export type AuthStep = 'credentials' | 'recovery';

/** Instante da tela de acesso: `pin` e `master` são login, `reset` é redefinição de PIN. */
export type AuthMode = 'pin' | 'master' | 'reset';
