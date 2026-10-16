/**
 * Tipagem de domínio das telas.
 *
 * Mora em `src/types/` e não dentro do componente porque `TabType` é contrato
 * entre `App.tsx` e a `Sidebar`, e porque as uniões de método da tela de acesso
 * descrevem o mesmo cofre que o main grava: nomear uma vez impede que a
 * interface e o processo principal contem histórias diferentes sobre o que é
 * login, o que é criação e o que é redefinição de PIN.
 */

/** Tela da barra lateral. */
export type TabType = 'home' | 'generator' | 'authenticator' | 'backup' | 'credits' | 'settings';

/**
 * Chave do rótulo de navegação (`m.app.nav[…]`).
 *
 * É o mesmo conjunto de `TabType`: uma entrada da barra lateral é uma tela e o
 * texto dela, então duplicar a união aqui só criaria dois lugares para
 * esquecer de acrescentar a tela nova.
 */
export type NavLabelKey = TabType;

/** Passo do formulário de criação do cofre. */
export type AuthStep = 'credentials' | 'recovery';

/**
 * Como a tela de acesso está naquele instante.
 *
 * `pin` e `master` são as duas formas de login (`UnlockKind`, e só a senha
 * mestra aparece depois de 3 falhas de PIN); `reset` é a redefinição de PIN pela
 * frase de recuperação, que nunca é login.
 */
export type AuthMode = 'pin' | 'master' | 'reset';
