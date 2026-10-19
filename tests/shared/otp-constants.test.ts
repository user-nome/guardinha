// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  OTP_ALGORITHMS,
  OTP_DEFAULT_ALGORITHM,
  OTP_DEFAULT_DIGITS,
  OTP_DEFAULT_PERIOD,
  OTP_DIGIT_CHOICES,
  OTP_SECRET_MIN_BYTES,
  OTP_PERIOD_RANGE,
} from '@zero/shared/otp-constants';
import type { OtpAlgorithm } from '@zero/shared/otp-constants';

/**
 * As constantes do TOTP são usadas pelo `otpauth.ts`, `totp.ts` e pela UI.
 * Este teste garante que os valores exportados existem e têm o formato esperado.
 */

describe('otp-constants', () => {
  it('OTP_ALGORITHMS contém os três algoritmos suportados', () => {
    expect(OTP_ALGORITHMS).toEqual(['SHA1', 'SHA256', 'SHA512']);
  });

  it('OtpAlgorithm é o tipo união dos algoritmos', () => {
    const algo: OtpAlgorithm = 'SHA1';
    expect(OTP_ALGORITHMS.includes(algo)).toBe(true);
  });

  it('OTP_DEFAULT_ALGORITHM é SHA1', () => {
    expect(OTP_DEFAULT_ALGORITHM).toBe('SHA1');
  });

  it('OTP_DEFAULT_DIGITS é 6', () => {
    expect(OTP_DEFAULT_DIGITS).toBe(6);
  });

  it('OTP_DEFAULT_PERIOD é 30', () => {
    expect(OTP_DEFAULT_PERIOD).toBe(30);
  });

  it('OTP_DIGIT_CHOICES contém 6 e 8', () => {
    expect(OTP_DIGIT_CHOICES).toEqual([6, 8]);
  });

  it('OTP_SECRET_MIN_BYTES é 10 (80 bits)', () => {
    expect(OTP_SECRET_MIN_BYTES).toBe(10);
  });

  it('OTP_PERIOD_RANGE é [15, 300]', () => {
    expect(OTP_PERIOD_RANGE).toEqual([15, 300]);
  });
});
