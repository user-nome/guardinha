/**
 * Avaliação de força de credenciais, compartilhada pelo renderer (medidor ao
 * vivo, sem IPC) e pelo main (recusa na criação do cofre: não confia no
 * renderer). Pura e sem estado: só texto de entrada, então roda em qualquer
 * processo (não usa Node nem DOM).
 *
 * Duas decisões ficam separadas de propósito:
 *
 * - `blocked`: regra dura do que é **trivial** (só o degenerado é recusado:
 *   dígito repetido, sequência de ponta a ponta, mesmo bloco repetido, frase
 *   com palavras repetidas demais);
 * - `level` / `score` / `reasons`: heurística para orientar quem digita, mas
 *   nunca bloqueia por si só.
 *
 * Os "bits" são uma estimativa heurística (tamanho × alfabeto, com descontos
 * por padrão): servem para a nota, não para cálculo criptográfico.
 */

export type StrengthLevel = 'veryWeak' | 'weak' | 'fair' | 'strong' | 'veryStrong';

export type StrengthReason =
  | 'allSame'
  | 'sequence'
  | 'repeatedBlock'
  | 'dateLike'
  | 'fewKinds'
  | 'lowVariety'
  | 'commonWord'
  | 'shortWords'
  | 'fewUniqueWords'
  | 'repeatedWords';

export interface StrengthResult {
  level: StrengthLevel;
  /** 0..4: quantos segmentos da barra do medidor ficam acesos. */
  score: number;
  /** true = o app recusa criar/redefinir a credencial com esse valor. */
  blocked: boolean;
  /** Chaves de mensagem (`m.strength.reasons[…]`) explicando a nota. */
  reasons: StrengthReason[];
}

/** Nota bruta: o nível na régua e quantos segmentos da barra acendem. */
interface Grade {
  level: StrengthLevel;
  score: number;
}

/** Quantas categorias de caractere aparecem e o tamanho do alfabeto delas. */
interface CharStats {
  kinds: number;
  size: number;
}

/** Bits por palavra de um vocabulário tipo diceware (~7776). */
const WORDS_BIT = 12.9;
/** Um bloco de até 12 caracteres repetido preenche a string toda = degenerado. */
const MAX_BLOCK = 12;
/** Abaixo disso a entrada ainda está incompleta: nada de bloqueio. */
const MIN_BLOCK_LENGTH = 8;

const LEVELS: readonly StrengthLevel[] = ['veryWeak', 'weak', 'fair', 'strong', 'veryStrong'];

/** Palavras comuns (pt + en) que derrubam a nota de frases e senhas. */
const COMMON_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'de',
  'do',
  'da',
  'das',
  'dos',
  'e',
  'em',
  'for',
  'from',
  'had',
  'has',
  'have',
  'he',
  'her',
  'his',
  'how',
  'i',
  'if',
  'in',
  'is',
  'it',
  'its',
  'mais',
  'na',
  'nao',
  'não',
  'no',
  'not',
  'o',
  'of',
  'on',
  'or',
  'os',
  'para',
  'que',
  'se',
  'ser',
  'she',
  'so',
  'tem',
  'that',
  'the',
  'this',
  'to',
  'um',
  'uma',
  'was',
  'we',
  'with',
  'you',
  'your',
  'banana',
  'bola',
  'cachorro',
  'casa',
  'gato',
  'amor',
  'agua',
  'água',
  'cama',
  'dia',
  'homem',
  'livro',
  'mae',
  'mãe',
  'pai',
  'praia',
  'rio',
  'sao',
  'são',
  'sol',
  'trabalho',
  'vida',
  'password',
  'senha',
  'admin',
  'guardinha',
  'secret',
  'user',
]);

/** Fragmentos que denunciam senha previsível (busca por substring, em minúsculas). */
const COMMON_FRAGMENTS = [
  'senha',
  'password',
  'passwd',
  'guardinha',
  'admin',
  'root',
  'login',
  'qwerty',
  'asdfgh',
  'zxcvbn',
  'letmein',
  'welcome',
  'iloveyou',
  'monkey',
  'dragon',
  'football',
  'baseball',
  'sunshine',
  'princess',
  'starwars',
  'minecraft',
  'abc123',
  '123456',
  '654321',
  '12345',
  'abcdef',
  'changeme',
  'secret',
  'master',
  'trustno1',
];

function emptyResult(): StrengthResult {
  return { level: 'veryWeak', score: 0, blocked: false, reasons: [] };
}

function grade(bits: number, cap = 4): Grade {
  const raw = bits < 28 ? 0 : bits < 36 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  const score = Math.max(0, Math.min(raw, cap, 4));
  return { level: LEVELS[score] ?? 'veryWeak', score };
}

/** Nota do PIN: 8 dígitos nunca passam de "razoável" (o formato não é força). */
function gradePin(bits: number): Grade {
  const score = bits >= 24 ? 2 : bits >= 16 ? 1 : 0;
  return { level: LEVELS[score] ?? 'veryWeak', score };
}

function isAllSame(text: string): boolean {
  return text.length > 0 && new Set(text).size === 1;
}

/** Maior trecho em passos de ±1 (ex.: `1234`, `abcd`, `8765`). */
function longestRun(text: string): number {
  if (text.length < 2) return text.length;
  let up = 1;
  let down = 1;
  let best = 1;
  for (let i = 1; i < text.length; i++) {
    const delta = text.charCodeAt(i) - text.charCodeAt(i - 1);
    up = delta === 1 ? up + 1 : 1;
    down = delta === -1 ? down + 1 : 1;
    best = Math.max(best, up, down);
  }
  return best;
}

/** Tamanho do bloco se o texto for só a repetição dele (`ababab` → 2), senão 0. */
function repeatedBlock(text: string): number {
  const max = Math.min(MAX_BLOCK, Math.floor(text.length / 2));
  for (let size = 2; size <= max; size++) {
    const block = text.slice(0, size);
    if (text === block.repeat(Math.ceil(text.length / size)).slice(0, text.length)) return size;
  }
  return 0;
}

/** 8 dígitos com cara de data: DDMMAAAA ou AAAAMMDD com ano plausível. */
function looksLikeDate(digits: string): boolean {
  if (!/^\d{8}$/.test(digits)) return false;
  const validYear = (year: number): boolean => year >= 1900 && year <= 2099;
  const validDayMonth = (day: number, month: number): boolean =>
    month >= 1 && month <= 12 && day >= 1 && day <= 31;
  const ddmm = validDayMonth(Number(digits.slice(0, 2)), Number(digits.slice(2, 4)));
  const yyyymmdd = validDayMonth(Number(digits.slice(6, 8)), Number(digits.slice(4, 6)));
  return (
    (validYear(Number(digits.slice(4, 8))) && ddmm) ||
    (validYear(Number(digits.slice(0, 4))) && yyyymmdd)
  );
}

function charStats(text: string): CharStats {
  let kinds = 0;
  let size = 0;
  if (/[a-z]/.test(text)) {
    kinds += 1;
    size += 26;
  }
  if (/[A-Z]/.test(text)) {
    kinds += 1;
    size += 26;
  }
  if (/\d/.test(text)) {
    kinds += 1;
    size += 10;
  }
  if (/[^a-zA-Z0-9]/.test(text)) {
    kinds += 1;
    size += 33;
  }
  return { kinds, size: Math.max(size, 2) };
}

function hasCommonFragment(text: string): boolean {
  const lower = text.toLowerCase();
  return COMMON_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

function containsDate(text: string): boolean {
  const run = /\d{8}/.exec(text);
  return run !== null && looksLikeDate(run[0]);
}

/**
 * Senha qualquer: usada para a senha mestra (24 caracteres), para a senha de
 * uma credencial salva e para a saída do gerador.
 */
export function evaluatePassword(password: string): StrengthResult {
  if (password === '') return emptyResult();
  const reasons: StrengthReason[] = [];
  const { kinds, size } = charStats(password);
  const distinct = new Set(password).size;
  const same = isAllSame(password);
  const block = repeatedBlock(password);
  const run = longestRun(password);
  const common = hasCommonFragment(password);

  let bits = password.length * Math.log2(size);
  if (same) {
    reasons.push('allSame');
    bits = 0;
  }
  if (block >= 2 && password.length >= MIN_BLOCK_LENGTH) {
    reasons.push('repeatedBlock');
    bits = Math.min(bits, 10);
  }
  if (run >= 8) {
    reasons.push('sequence');
    bits = Math.min(bits, 10);
  } else if (run >= 4) {
    reasons.push('sequence');
    bits = Math.min(bits, 30);
  }
  if (common) {
    reasons.push('commonWord');
    bits = Math.min(bits, 30);
  }
  if (password.length >= MIN_BLOCK_LENGTH && distinct <= 6) {
    reasons.push('lowVariety');
    bits = Math.min(bits, 40);
  }
  if (password.length >= 6 && kinds <= 1) {
    reasons.push('fewKinds');
    bits = Math.min(bits, 45);
  }
  if (containsDate(password)) {
    reasons.push('dateLike');
    bits = Math.min(bits, 25);
  }

  const blocked = password.length >= MIN_BLOCK_LENGTH && (same || block >= 2 || run >= 8);
  const { level, score } = grade(bits);
  return { level, score, blocked, reasons };
}

/** Senha mestra: régua da senha qualquer (o formato de 24 é validado à parte). */
export function evaluateMaster(password: string): StrengthResult {
  return evaluatePassword(password);
}

/**
 * PIN de 8 dígitos: o segredo mais fraco do cofre (10^8 candidatas). A nota
 * nunca passa de "razoável" e o bloqueio cobre só o degenerado.
 */
export function evaluatePin(pin: string): StrengthResult {
  if (pin === '') return emptyResult();
  const reasons: StrengthReason[] = [];
  const digitsOnly = /^\d+$/.test(pin);
  const complete = /^\d{8}$/.test(pin);
  const distinct = new Set(pin).size;
  const run = longestRun(pin);

  if (!digitsOnly) {
    reasons.push('fewKinds');
  } else {
    if (looksLikeDate(pin)) reasons.push('dateLike');
    if (distinct <= 2 && complete) {
      reasons.push(distinct === 1 ? 'allSame' : 'repeatedBlock');
    } else if (distinct <= 4 && complete) {
      reasons.push('lowVariety');
    }
    if (run >= 8) reasons.push('sequence');
  }

  let bits: number;
  if (!digitsOnly) {
    bits = 0;
  } else if (distinct <= 2) {
    bits = 4;
  } else if (run >= 8) {
    bits = 8;
  } else {
    bits = pin.length * Math.log2(Math.max(distinct, 1));
    if (looksLikeDate(pin)) bits = Math.min(bits, 15);
    if (distinct <= 4) bits = Math.min(bits, 16);
  }

  const blocked = complete && digitsOnly && (distinct <= 2 || run >= 8);
  const { level, score } = gradePin(bits);
  return { level, score, blocked, reasons };
}

/**
 * Frase de recuperação (12+ palavras, escrita pelo usuário): o que importa é
 * variedade, já que palavra repetida não acrescenta entropia.
 */
export function evaluatePhrase(phrase: string): StrengthResult {
  const words = phrase
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '');
  if (words.length === 0) return emptyResult();

  const reasons: StrengthReason[] = [];
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  const unique = counts.size;
  const total = words.length;
  const complete = total >= 12;
  const commonCount = words.filter((word) => COMMON_WORDS.has(word)).length;
  const averageLength = words.reduce((sum, word) => sum + word.length, 0) / total;

  if (complete && unique < 8) reasons.push('fewUniqueWords');
  if ([...counts.values()].some((count) => count >= 3)) reasons.push('repeatedWords');
  if (total >= 4 && commonCount * 2 >= total) reasons.push('commonWord');
  if (total >= 4 && averageLength <= 3) reasons.push('shortWords');

  let bits = Math.max(0, unique * WORDS_BIT - (total - unique) * 4);
  if (reasons.includes('commonWord')) bits = Math.min(bits, 60);
  if (reasons.includes('shortWords')) bits = Math.min(bits, 45);

  const blocked = complete && unique <= 4;
  const { level, score } = grade(bits);
  return { level, score, blocked, reasons };
}
