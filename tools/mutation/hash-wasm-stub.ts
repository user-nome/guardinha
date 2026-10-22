import { pbkdf2Sync } from 'node:crypto';

/**
 * Doppelgänger de `hash-wasm` para a varredura de mutação.
 *
 * A suíte real deriva chaves com Argon2id de produção (128 MiB e 256 MiB), e
 * por isso `unlock.test.ts`, `panic.test.ts` e `vault.test.ts` levam mais de
 * dois minutos cada. Como um mutante roda a suíte de novo, esse custo domina a
 * varredura inteira. Aqui `argon2id` vira um PBKDF2 com o número de iterações do
 * próprio pedido: some em milissegundos e continua sendo determinístico,
 * sensível à senha, ao salt e **aos parâmetros**, que é tudo que
 * `tests/main/crypto.test.ts` verifica (mesma senha e mesmo salt dão a mesma
 * chave; senha, salt ou custo diferentes, não).
 *
 * A troca só vale se a suíte continuar verde sem mutante: o runner exige esse
 * baseline antes de confiar em qualquer veredito. E como nenhum teste compara a
 * saída com um vetor do Argon2id, a derivação real continua coberta por
 * `npm test`.
 *
 * Nada aqui protege segredo: isto roda só sob `vitest.mutation.config.mts`, que
 * aponta `hash-wasm` para cá. O Argon2id de verdade está em
 * `src/main/crypto.ts`, importado do `hash-wasm` como qualquer outro módulo.
 */

interface Argon2Options {
  password: string;
  salt: Uint8Array;
  parallelism: number;
  iterations: number;
  hashLength: number;
  memorySize: number;
  outputType?: 'hex' | 'binary';
}

/** O que o `hash-wasm` de verdade aceita em `outputType`. */
const OUTPUT_TYPES = new Set(['hex', 'binary', 'encoded']);

export function argon2id(options: Argon2Options): Promise<Uint8Array | string> {
  // O doppelgänger não pode ser mais permissivo que a biblioteca real: um
  // `outputType` inválido é erro lá, e aceitar aqui esconderia um mutante que
  // a suíte tem como matar (o `outputType: 'binary'` de `deriveKey`).
  if (options.outputType !== undefined && !OUTPUT_TYPES.has(options.outputType)) {
    throw new Error(`Insupported output type ${options.outputType}`);
  }
  // `memorySize` e `parallelism` entram no salt porque o PBKDF2 não os tem:
  // sem isso, dois coframes com custos diferentes e o mesmo salt dariam a mesma
  // chave, e a suíte não veria a diferença entre eles.
  const salt = Buffer.concat([
    Buffer.from(options.salt),
    Buffer.from(`:${options.memorySize}:${options.parallelism}`, 'utf8'),
  ]);
  // `iterations` vira a contagem do próprio PBKDF2, com piso em 1. Os perfis do
  // app usam 3 e 4, o que é instantâneo.
  const iterations = Math.max(1, options.iterations | 0);
  const length = Math.max(1, options.hashLength | 0);
  const digest = pbkdf2Sync(options.password, salt, iterations, length, 'sha512');

  const output = options.outputType === 'binary' ? new Uint8Array(digest) : digest.toString('hex');
  return Promise.resolve(output);
}

export default { argon2id };
