import { describe, expect, it } from 'vitest';
import { isRecord } from '@zero/shared/record';

describe('isRecord', () => {
  it('aceita objetos e rejeita valores que não são registros', () => {
    expect(isRecord({ value: 1 })).toBe(true);
    expect(isRecord({})).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord('texto')).toBe(false);
    expect(isRecord(1)).toBe(false);
  });
});
