// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  calculateLockout,
  getLockRemainingMs,
  loadAuthState,
  openableUrl,
  registerFailedAttempt,
  resetAttempts,
  validateDomainFormat,
  validateUsernameFormat,
} from '@zero/main/auth';
import { writeVaultContainer } from '@zero/main/storage';

const BASE = new Date('2026-01-01T12:00:00Z').getTime();
const EMPTY_STATE = { attempts: 0, lockUntil: null, attemptsMaster: 0, nukeLimit: 0 };

/**
 * A trava exponencial agora vive dentro do `vault.zkv` (nada de JSON legível);
 * só persiste quando há um cofre. Semeia um container mínimo de forma barata
 * (sem Argon2), já que o estado não depende das credenciais serem válidas.
 */
function seedContainer(): void {
  writeVaultContainer({
    version: 6,
    createdAt: BASE,
    attempts: 0,
    lockUntil: null,
    attemptsMaster: 0,
    nukeLimit: 0,
    methods: {
      master: {
        kdf: { algo: 'argon2id', memoryKiB: 65536, iterations: 3, parallelism: 4 },
        kdfSalt: 'a'.repeat(32),
        payload: {
          salt: 'b'.repeat(32),
          iv: 'c'.repeat(32),
          tag: 'd'.repeat(32),
          encryptedData: 'ee',
        },
      },
    },
    manifest: null,
  });
}

afterEach(() => {
  resetAttempts();
  vi.useRealTimers();
});

describe('trava exponencial', () => {
  beforeAll(() => {
    seedContainer();
  });

  afterAll(() => {
    resetAttempts();
  });
  it('escala 10s, 30s, 1m, 1h, 24h e trava no teto', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    expect(calculateLockout(1)).toBe(BASE + 10_000);
    expect(calculateLockout(2)).toBe(BASE + 30_000);
    expect(calculateLockout(3)).toBe(BASE + 60_000);
    expect(calculateLockout(4)).toBe(BASE + 3_600_000);
    expect(calculateLockout(5)).toBe(BASE + 86_400_000);
    expect(calculateLockout(99)).toBe(BASE + 86_400_000);
  });

  it('usa o primeiro intervalo se a contagem não for um número válido', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);

    expect(calculateLockout(Number.NaN)).toBe(BASE + 10_000);
  });

  it('registerFailedAttempt incrementa e persiste o lockUntil', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    const first = registerFailedAttempt('pin').state;
    expect(first.attempts).toBe(1);
    expect(first.lockUntil).toBe(BASE + 10_000);
    expect(loadAuthState()).toEqual(first);

    vi.setSystemTime(BASE + 15_000);
    const second = registerFailedAttempt('pin').state;
    expect(second.attempts).toBe(2);
    expect(second.lockUntil).toBe(BASE + 15_000 + 30_000);
  });

  it('resetAttempts limpa a trava', () => {
    registerFailedAttempt('pin');
    resetAttempts();
    expect(loadAuthState()).toEqual({
      attempts: 0,
      lockUntil: null,
      attemptsMaster: 0,
      nukeLimit: 0,
    });
  });

  it('getLockRemainingMs zera após o prazo e ignora lockUntil nulo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    registerFailedAttempt('pin');
    expect(getLockRemainingMs(loadAuthState())).toBe(10_000);
    vi.setSystemTime(BASE + 11_000);
    expect(getLockRemainingMs(loadAuthState())).toBe(0);
    expect(getLockRemainingMs(EMPTY_STATE)).toBe(0);
  });

  it('getLockRemainingMs aceita a maior espera legítima (24 h)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    const noTeto = { ...EMPTY_STATE, lockUntil: BASE + 86_400_000 };
    expect(getLockRemainingMs(noTeto)).toBe(86_400_000);
    vi.setSystemTime(BASE + 86_400_000);
    expect(getLockRemainingMs(noTeto)).toBe(0);
  });

  it('getLockRemainingMs trata lockUntil além do teto como vencido', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    // estado adulterado (ou relógio recuado): sem o corte, o cofre ficaria
    // preso para sempre porque a espera nunca começaria a diminuir
    const adulterado = { ...EMPTY_STATE, lockUntil: Number.MAX_SAFE_INTEGER };
    expect(getLockRemainingMs(adulterado)).toBe(0);
    const umMsAcimaDoTeto = { ...EMPTY_STATE, lockUntil: BASE + 86_400_001 };
    expect(getLockRemainingMs(umMsAcimaDoTeto)).toBe(0);
  });
});

describe('contadores separados por método (atemptsMaster)', () => {
  beforeAll(() => {
    seedContainer();
  });

  afterAll(() => {
    resetAttempts();
  });

  it('falha da senha mestra soma em attemptsMaster', () => {
    resetAttempts();
    const first = registerFailedAttempt('master').state;
    expect(first.attempts).toBe(1);
    expect(first.attemptsMaster).toBe(1);

    const second = registerFailedAttempt('master').state;
    expect(second.attempts).toBe(2);
    expect(second.attemptsMaster).toBe(2);
  });

  it('falha de PIN não soma em attemptsMaster', () => {
    resetAttempts();
    registerFailedAttempt('master');
    const afterPin = registerFailedAttempt('pin').state;
    expect(afterPin.attempts).toBe(2); // o contador geral anda
    expect(afterPin.attemptsMaster).toBe(1); // o da senha mestra, não
  });

  it('resetAttempts zera os dois contadores', () => {
    registerFailedAttempt('master');
    registerFailedAttempt('pin');
    resetAttempts();
    const state = loadAuthState();
    expect(state.attempts).toBe(0);
    expect(state.attemptsMaster).toBe(0);
  });

  it('nukeLimit desligado nunca cruza o corte', () => {
    resetAttempts();
    let crossed = false;
    for (let i = 0; i < 200; i++) {
      crossed = registerFailedAttempt('master', 0).crossed || crossed;
    }
    expect(crossed).toBe(false);
  });

  it('cruza o corte exatamente no limite, só com falha da senha mestra', () => {
    resetAttempts();
    const limit = 3;
    expect(registerFailedAttempt('master', limit).crossed).toBe(false);
    expect(registerFailedAttempt('master', limit).crossed).toBe(false);
    expect(registerFailedAttempt('master', limit).crossed).toBe(true);
  });

  it('PIN errado não cruza o limite, mesmo com o limite armado', () => {
    resetAttempts();
    let crossed = false;
    for (let i = 0; i < 10; i++) {
      crossed = registerFailedAttempt('pin', 2).crossed || crossed;
    }
    expect(crossed).toBe(false);
  });
});

describe('validações de formato', () => {
  it('usuário: palavra, kebab-case ou snake_case', () => {
    expect(validateUsernameFormat('')).toBe(true);
    expect(validateUsernameFormat('otaku')).toBe(true);
    expect(validateUsernameFormat('otaku-delirante')).toBe(true);
    expect(validateUsernameFormat('otaku_delirante')).toBe(true);
    expect(validateUsernameFormat('Otaku Delirante')).toBe(false);
    expect(validateUsernameFormat('-inválido')).toBe(false);
  });

  it('domínio: hostname simples ou URL', () => {
    expect(validateDomainFormat('')).toBe(true);
    expect(validateDomainFormat('example.com')).toBe(true);
    expect(validateDomainFormat('sub.example.com.br')).toBe(true);
    expect(validateDomainFormat('https://example.com/path')).toBe(true);
    expect(validateDomainFormat('não é domínio')).toBe(false);
  });

  it('URL para abrir preserva o https:// já escrito e prefixa o hostname nu', () => {
    // O caminho com esquema explícito não pode virar `https://https://...`
    expect(openableUrl('https://example.com/path')).toBe('https://example.com/path');
    expect(openableUrl('example.com')).toBe('https://example.com');
    expect(() => openableUrl('http://example.com')).toThrow();
  });
});

describe('contador de tentativas', () => {
  it('só cruza o limite de autodestruição quando o limite está ligado', () => {
    // `nukeLimit > 0` é o que separa "sem limite" de "com limite": com o `> 0`
    // virando `>= 1` (ou o `0` virando `1`), um cofre sem limite cruzaria na
    // primeira tentativa de senha mestra errada.
    const desligado = registerFailedAttempt('master', 0);
    expect(desligado.crossed).toBe(false);

    const ligado = registerFailedAttempt('master', 3);
    expect(ligado.crossed).toBe(false);

    const noLimite = registerFailedAttempt('master', 3);
    expect(noLimite.crossed).toBe(true);
  });
});
