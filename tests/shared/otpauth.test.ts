import { describe, expect, it, vi } from 'vitest';
import * as base32 from '@zero/shared/base32';
import {
  buildOtpAuthUri,
  isOtpAlgorithm,
  otpSecretBits,
  parseOtpAuthUri,
} from '@zero/shared/otpauth';

/**
 * O formato `otpauth://` é o que os serviços entregam quando o usuário escolhe
 * "não posso escanear agora". Um parser permissivo demais aqui vira um token
 * silenciosamente errado na tela; um restritivo demais vira "código inválido"
 * num serviço que estava certo. Estes testes travam os dois lados.
 */

const STRONG_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const GITHUB = `otpauth://totp/GitHub:alice@github.com?secret=${STRONG_SECRET}&issuer=GitHub`;

describe('isOtpAlgorithm', () => {
  it('reconhece apenas algoritmos OTP suportados', () => {
    expect(isOtpAlgorithm('SHA1')).toBe(true);
    expect(isOtpAlgorithm('SHA256')).toBe(true);
    expect(isOtpAlgorithm('SHA512')).toBe(true);
    expect(isOtpAlgorithm('sha1')).toBe(false);
    expect(isOtpAlgorithm(null)).toBe(false);
  });
});

describe('otpSecretBits', () => {
  it('mede o segredo em bits', () => {
    expect(otpSecretBits('JBSWY3DPEHPK3PXP')).toBe(80);
    expect(otpSecretBits('A'.repeat(26))).toBe(128);
    expect(otpSecretBits('A'.repeat(32))).toBe(160);
  });

  it('devolve null para o que não é Base32', () => {
    expect(otpSecretBits('')).toBeNull();
    expect(otpSecretBits('1')).toBeNull();
  });

  it('zera o buffer decodificado antes de devolver o tamanho', () => {
    const vistas: Uint8Array[] = [];
    const original = base32.base32Decode.bind(base32);
    vi.spyOn(base32, 'base32Decode').mockImplementation((value: string) => {
      const bytes = original(value);
      if (bytes !== null) vistas.push(bytes);
      return bytes;
    });

    try {
      expect(otpSecretBits('JBSWY3DPEHPK3PXP')).toBe(80);
    } finally {
      vi.restoreAllMocks();
    }

    expect(vistas).toHaveLength(1);
    for (const buffer of vistas) expect(buffer.every((byte) => byte === 0)).toBe(true);
  });
});

/** Nomes dos parâmetros de consulta da URI, na ordem em que saem. */
function parametrosDe(uri: string): string[] {
  const consulta = uri.slice(uri.indexOf('?') + 1);
  return [...new URLSearchParams(consulta).keys()];
}

/**
 * O segredo é decifrado de um Base32 efêmero só para conferir o tamanho mínimo,
 * e o buffer é zerado antes de a função voltar. O `fill(1)` silencioso deixaria
 * o segredo do usuário inteiro na memória até o GC, sem mudar nada no que a
 * função devolve: só a referência capturada denuncia.
 */
describe('o segredo decifrado some da memória', () => {
  it('o buffer do Base32 é zerado depois da checagem de tamanho', () => {
    const vistas: Uint8Array[] = [];
    const original = base32.base32Decode.bind(base32);
    vi.spyOn(base32, 'base32Decode').mockImplementation((value: string) => {
      const bytes = original(value);
      if (bytes !== null) vistas.push(bytes);
      return bytes;
    });

    try {
      expect(parseOtpAuthUri(GITHUB)).not.toBeNull();
    } finally {
      vi.restoreAllMocks();
    }

    expect(vistas.length).toBeGreaterThan(0);
    for (const buffer of vistas) expect(buffer.every((byte) => byte === 0)).toBe(true);
  });
});

describe('parseOtpAuthUri', () => {
  it('lê o exemplo da wiki do Google Authenticator', () => {
    expect(parseOtpAuthUri(GITHUB)).toEqual({
      issuer: 'GitHub',
      account: 'alice@github.com',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: STRONG_SECRET,
    });
  });

  it('aplica os padrões quando o serviço omite os parâmetros', () => {
    const parsed = parseOtpAuthUri(`otpauth://totp/morgan?secret=${STRONG_SECRET}`);
    // SHA1, 6 dígitos, 30 s: o que GitHub, Discord, Google e AWS usam
    expect(parsed?.algorithm).toBe('SHA1');
    expect(parsed?.digits).toBe(6);
    expect(parsed?.period).toBe(30);
    expect(parsed?.secret).toBe(STRONG_SECRET);
  });

  it('aceita SHA256 e SHA512, os poucos serviços que pedem', () => {
    expect(
      parseOtpAuthUri(`otpauth://totp/Azure:me?secret=${STRONG_SECRET}&algorithm=sha256`)
        ?.algorithm,
    ).toBe('SHA256');
    expect(
      parseOtpAuthUri(`otpauth://totp/OAuth:me?secret=${STRONG_SECRET}&algorithm=SHA512`)
        ?.algorithm,
    ).toBe('SHA512');
  });

  it('aceita 8 dígitos e período de 60 s', () => {
    const parsed = parseOtpAuthUri(
      `otpauth://totp/Servico:me?secret=${STRONG_SECRET}&digits=8&period=60`,
    );
    expect(parsed?.digits).toBe(8);
    expect(parsed?.period).toBe(60);
  });

  it('toma o emissor do prefixo do rótulo quando não vem o parâmetro', () => {
    // é o que o Google Authenticator antigo faz, e o motivo de o formato
    // pedir os dois em concordância
    expect(parseOtpAuthUri(`otpauth://totp/Discord:morgan#4321?secret=${STRONG_SECRET}`)).toEqual({
      issuer: 'Discord',
      account: 'morgan#4321',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: STRONG_SECRET,
    });
  });

  it('normaliza a chave colada com espaços e minúsculas', () => {
    expect(
      parseOtpAuthUri(
        `otpauth://totp/Site:eu?secret=gezd gnbv gy3t qojq gezd gnbv gy3t qojq&issuer=Site`,
      )?.secret,
    ).toBe(STRONG_SECRET);
  });

  it('preserva campos do rótulo cujo escape percentual está malformado', () => {
    expect(parseOtpAuthUri(`otpauth://totp/%ZZ:conta%?secret=${STRONG_SECRET}`)).toMatchObject({
      issuer: '%ZZ',
      account: 'conta%',
    });
  });

  it('recusa emissor que não bate com o rótulo', () => {
    // sinal de endereço remontado ou colado de dois serviços: melhor recusar
    expect(
      parseOtpAuthUri(`otpauth://totp/GitHub:eu?secret=${STRONG_SECRET}&issuer=Discord`),
    ).toBeNull();
  });

  it('recusa esquema, tipo e endereço que não são do formato', () => {
    expect(parseOtpAuthUri('https://exemplo.com/2fa')).toBeNull();
    expect(parseOtpAuthUri(`otpauth://hotp/Banco:eu?secret=${STRONG_SECRET}&counter=1`)).toBeNull();
    expect(parseOtpAuthUri('lixo')).toBeNull();
    expect(parseOtpAuthUri('')).toBeNull();
  });

  it('recusa o URI sem a barra que separa o tipo do rótulo', () => {
    // `otpauth://totpx?...` não tem rótulo nenhum: o que vem depois de `totp`
    // sem barra não é um tipo, é o começo de um rótulo que não existe. Se o
    // tipo fosse lido com o corte trocado, o `totpx` passaria por `totp` e o
    // token inteiro nasceria de uma URI que ninguém emitiu.
    expect(parseOtpAuthUri(`otpauth://totpx?secret=${STRONG_SECRET}`)).toBeNull();
  });

  it('recusa segredo ausente, curto ou fora do alfabeto base32', () => {
    expect(parseOtpAuthUri('otpauth://totp/Site:eu')).toBeNull();
    expect(parseOtpAuthUri('otpauth://totp/Site:eu?secret=')).toBeNull();
    // `1` não existe no alfabeto Base32: o Google usa `1` em nenhum segredo.
    expect(parseOtpAuthUri(`otpauth://totp/Site:eu?secret=${'A'.repeat(15)}1`)).toBeNull();
    // 15 caracteres carregam 9 bytes, um a menos que o piso de 10.
    expect(parseOtpAuthUri('otpauth://totp/Site:eu?secret=JBSWY3DPEHPK3PX')).toBeNull();
    expect(parseOtpAuthUri('otpauth://totp/Site:eu?secret=AA')).toBeNull();
    expect(parseOtpAuthUri(`otpauth://totp/Site:eu?secret=${'A'.repeat(15)}`)).toBeNull();
  });

  it('aceita a chave de 80 bits e os pisos da OWASP', () => {
    // 16 caracteres Base32 carregam 80 bits; 26 carregam 128 bits (mínimo da
    // OWASP) e 32 carregam 160 bits (o recomendado).
    const curta = 'JBSWY3DPEHPK3PXP';
    const owaspMin = 'A'.repeat(26);
    const recommended = 'A'.repeat(32);
    expect(
      parseOtpAuthUri(`otpauth://totp/Servico:eu?secret=${curta}&issuer=Servico`)?.secret,
    ).toBe(curta);
    expect(parseOtpAuthUri(`otpauth://totp/Site:eu?secret=${owaspMin}`)?.secret).toBe(owaspMin);
    expect(parseOtpAuthUri(`otpauth://totp/Site:eu?secret=${recommended}`)?.secret).toBe(
      recommended,
    );
    expect(parseOtpAuthUri(`otpauth://totp/Site:eu?secret=${STRONG_SECRET}`)?.secret).toBe(
      STRONG_SECRET,
    );
  });

  it('recusa parâmetro repetido, em vez de escolher um dos dois', () => {
    expect(
      parseOtpAuthUri(`otpauth://totp/Site:eu?secret=${STRONG_SECRET}&digits=6&digits=8`),
    ).toBeNull();
  });

  it('recusa parâmetro fora da faixa em vez de gerar um token estranho', () => {
    expect(parseOtpAuthUri(`otpauth://totp/Site:eu?secret=${STRONG_SECRET}&digits=7`)).toBeNull();
    expect(parseOtpAuthUri(`otpauth://totp/Site:eu?secret=${STRONG_SECRET}&period=0`)).toBeNull();
    expect(
      parseOtpAuthUri(`otpauth://totp/Site:eu?secret=${STRONG_SECRET}&algorithm=MD5`),
    ).toBeNull();
  });

  it('aceita o período nas duas pontas da faixa e recusa logo fora delas', () => {
    // Os limites são o que separa "token válido" de "token estranho": o serviço
    // usa 30, alguns usam 15, e o teto de 300 é o que impede que a tela mostre
    // um token travado. Fechar a faixa (`<=` no lugar de `<`) recusaria o
    // período que a wiki recomenda; deixá-la aberta aceitaria qualquer número.
    expect(
      parseOtpAuthUri(`otpauth://totp/Site:eu?secret=${STRONG_SECRET}&period=15`)?.period,
    ).toBe(15);
    expect(
      parseOtpAuthUri(`otpauth://totp/Site:eu?secret=${STRONG_SECRET}&period=300`)?.period,
    ).toBe(300);
    expect(parseOtpAuthUri(`otpauth://totp/Site:eu?secret=${STRONG_SECRET}&period=14`)).toBeNull();
    expect(parseOtpAuthUri(`otpauth://totp/Site:eu?secret=${STRONG_SECRET}&period=301`)).toBeNull();
  });

  it('recusa período que não é número, em vez de gerar um NaN que vira tela', () => {
    // `Number('abc')` é NaN, e NaN passa por qualquer comparação: sem o `||` no
    // leitor de inteiro, o token nasceria com período NaN e o contador da tela
    // ficaria sem barra de progresso para sempre.
    expect(parseOtpAuthUri(`otpauth://totp/Site:eu?secret=${STRONG_SECRET}&period=abc`)).toBeNull();
    expect(parseOtpAuthUri(`otpauth://totp/Site:eu?secret=${STRONG_SECRET}&digits=6.5`)).toBeNull();
  });

  it('recusa endereço sem conta nem emissor', () => {
    expect(parseOtpAuthUri(`otpauth://totp/?secret=${STRONG_SECRET}`)).toBeNull();
  });
});

describe('buildOtpAuthUri', () => {
  it('é o inverso exato do parser, para exportar e reler', () => {
    const parsed = parseOtpAuthUri(GITHUB);
    expect(parsed).not.toBeNull();
    if (parsed === null) throw new Error('o exemplo da wiki deveria ter parseado');
    expect(parseOtpAuthUri(buildOtpAuthUri(parsed))).toEqual(parsed);
  });

  it('escreve o rótulo do jeito da wiki do Google, separador cru e @ visível', () => {
    const parsed = parseOtpAuthUri(GITHUB);
    if (parsed === null) throw new Error('o exemplo da wiki deveria ter parseado');
    const uri = buildOtpAuthUri(parsed);
    expect(uri.startsWith('otpauth://totp/GitHub:alice@github.com?')).toBe(true);
    expect(uri).toContain(`secret=${STRONG_SECRET}`);
    // os parâmetros que a wiki deixa de fora por serem padrão saem explícitos:
    // é o mesmo token e o outro autenticator não precisa adivinhar
    expect(uri).toContain('&algorithm=SHA1&digits=6&period=30');
  });

  it('sobrevive a conta e emissor com acento ou espaço', () => {
    const uri = buildOtpAuthUri({
      issuer: 'Banco do Brasil',
      account: 'joão.silva@exemplo.com.br',
      algorithm: 'SHA256',
      digits: 8,
      period: 60,
      secret: STRONG_SECRET,
    });
    expect(parseOtpAuthUri(uri)).toEqual({
      issuer: 'Banco do Brasil',
      account: 'joão.silva@exemplo.com.br',
      algorithm: 'SHA256',
      digits: 8,
      period: 60,
      secret: STRONG_SECRET,
    });
  });

  it('mantém o segredo fora do rótulo, só nos parâmetros', () => {
    const uri = buildOtpAuthUri({
      issuer: 'GitHub',
      account: 'alice',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: STRONG_SECRET,
    });
    expect(uri).toContain(`secret=${STRONG_SECRET}`);
    expect(uri.indexOf(STRONG_SECRET)).toBeGreaterThan(uri.indexOf('?'));
    // os parâmetros saem com o nome que a wiki usa, e nenhum a mais
    expect(parametrosDe(uri)).toEqual(['secret', 'issuer', 'algorithm', 'digits', 'period']);
  });
});

describe('cantos do rótulo e dos parâmetros', () => {
  const base = (extra: string): string => `otpauth://totp/Conta?secret=${STRONG_SECRET}${extra}`;

  it('rótulo sem separador vira conta inteira e emissor vazio', () => {
    // `otpauth://totp/so-a-conta` é aceito pela wiki. Sem o `:` não há emissor
    // no rótulo, e é o parâmetro `issuer` que decide se ele existe.
    const token = parseOtpAuthUri(base(''));

    expect(token).toMatchObject({ account: 'Conta', issuer: '' });
  });

  it('rótulo com %3A separa no lugar certo, antes de decodificar', () => {
    // Se o corte viesse depois do `decodeURIComponent`, o `%3A` viraria `:` e
    // partiria o rótulo no meio de um nome que continha a sequência.
    const token = parseOtpAuthUri(`otpauth://totp/Acme%3ACorp%3Aconta?secret=${STRONG_SECRET}`);

    expect(token).toMatchObject({ issuer: 'Acme', account: 'Corp:conta' });
  });

  it('dígitos fora de 1 a 9 recusam a URI em vez de adivinhar', () => {
    // `0` ainda casa com `\d{1,9}`, então o que recusa é o tamanho. Um serviço
    // não devolve 10 dígitos, e aceitar o valor abriria mão do código que o
    // serviço espera.
    for (const digitos of ['1234567890', '12345678901234567890']) {
      expect(parseOtpAuthUri(base(`&digits=${digitos}`))).toBeNull();
    }
  });

  it('período e dígitos ausentes assumem o padrão do serviço', () => {
    const token = parseOtpAuthUri(base(''));

    expect(token).toMatchObject({ digits: 6, period: 30, algorithm: 'SHA1' });
  });

  it('token sem emissor não escreve parâmetro issuer na URI', () => {
    const uri = buildOtpAuthUri({
      issuer: '',
      account: 'alice@github.com',
      secret: STRONG_SECRET,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });

    expect(uri.startsWith('otpauth://totp/alice@github.com?')).toBe(true);
    expect(uri).not.toContain('issuer=');
    // o nome do parâmetro importa tanto quanto a ausência dele: um `set` com o
    // nome trocado sai como `=&GitHub`, que nenhum outro authenticator lê
    expect(parametrosDe(uri)).toEqual(['secret', 'algorithm', 'digits', 'period']);
  });
});
