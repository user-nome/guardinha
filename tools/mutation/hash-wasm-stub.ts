import { pbkdf2Sync } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

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
 * baseline antes de confiar em qualquer veredito. Os vetores conhecidos têm
 * saídas fixas para manter os testes de compatibilidade no plano; a suíte
 * regular também os verifica contra o Argon2id real. O atraso do canário só
 * verifica o perfil configurado do PIN, não mede o custo real do Argon2id.
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

interface KnownVector {
  password: string;
  saltHex: string;
  memorySize: number;
  iterations: number;
  parallelism: number;
  outputHex: string;
}

// Mantém os vetores conhecidos verdes sob o substituto; a suíte regular testa
// esses vetores contra o Argon2id real.
const KNOWN_VECTORS: KnownVector[] = [
  {
    password: 'password',
    saltHex: Buffer.from('somesalt').toString('hex'),
    memorySize: 65_536,
    iterations: 2,
    parallelism: 1,
    outputHex: '09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7',
  },
  {
    password: 'senha-de-teste',
    saltHex: '00112233445566778899aabbccddeeff',
    memorySize: 16_384,
    iterations: 1,
    parallelism: 1,
    outputHex: '6a6a4602564a88abf89b86737494151372106a7ad1eced5aa40d9504bc0d902e',
  },
];

/** O que o `hash-wasm` de verdade aceita em `outputType`. */
const OUTPUT_TYPES = new Set(['hex', 'binary', 'encoded']);

export async function argon2id(options: Argon2Options): Promise<Uint8Array | string> {
  // O doppelgänger não pode ser mais permissivo que a biblioteca real: um
  // `outputType` inválido é erro lá, e aceitar aqui esconderia um mutante que
  // a suíte tem como matar (o `outputType: 'binary'` de `deriveKey`).
  if (options.outputType !== undefined && !OUTPUT_TYPES.has(options.outputType)) {
    throw new Error(`Insupported output type ${options.outputType}`);
  }
  const knownVector = KNOWN_VECTORS.find(
    (vector) =>
      options.outputType === 'binary' &&
      options.hashLength === vector.outputHex.length / 2 &&
      options.password === vector.password &&
      Buffer.from(options.salt).toString('hex') === vector.saltHex &&
      options.memorySize === vector.memorySize &&
      options.iterations === vector.iterations &&
      options.parallelism === vector.parallelism,
  );
  if (knownVector !== undefined) return new Uint8Array(Buffer.from(knownVector.outputHex, 'hex'));

  // O substituto reflete o perfil configurado do PIN no canário de custo; a
  // suíte regular verifica o tempo do Argon2id real.
  if (
    options.memorySize === 262_144 &&
    options.iterations === 4 &&
    options.parallelism === 4
  ) {
    await delay(260);
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
  return output;
}

export default { argon2id };
