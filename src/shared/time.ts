/**
 * Unidades de tempo do app, em milissegundos.
 *
 * Ficam em um módulo próprio porque o mesmo `1000` aparecia no formatador, na
 * trava exponencial, no TOTP e nos temporizadores da interface. Nomear a
 * unidade deixa claro o que está sendo somado (segundos, minutos) e evita que
 * um temporizador seja escrito em segundos por engano.
 */

/** Milissegundos em um segundo. */
export const MS_PER_SECOND = 1_000;

/** Milissegundos em um minuto. */
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
