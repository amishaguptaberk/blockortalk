// Normalization for the leak check (SPEC: Policy and scoring): spoken numbers to digits,
// spacing and punctuation removed, month names to numbers, house number + street for addresses.
// "eight three oh two" matches 8302; "July twenty-second, nineteen ninety-four" matches 1994-07-22.

const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ORD_UNITS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9 };
const ORD_TEENS = {
  tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14,
  fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19,
};
const ORD_TENS = { twentieth: 20, thirtieth: 30 };
const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
// Words that may sit inside a spoken number without ending it.
const FILLERS = new Set(['and', 'uh', 'um', 'er', 'dash', 'hyphen', 'comma', 'of', 'the', 'then', 'space']);

const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/(\d)(st|nd|rd|th)\b/g, '$1')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isNumberWord(word) {
  if (word === undefined) return false;
  return /^\d+$/.test(word) || own(UNITS, word) || own(TEENS, word) || own(TENS, word)
    || own(ORD_UNITS, word) || own(ORD_TEENS, word) || own(ORD_TENS, word)
    || word === 'oh' || word === 'o' || word === 'double' || word === 'triple';
}

/**
 * Splits text into runs of numeric tokens. Each run is a list of digit strings that were spoken or
 * typed together, e.g. "three one eight, nine oh two" -> [["3","1","8","9","0","2"]].
 */
export function numberRuns(text) {
  const toks = tokenize(text);
  const runs = [];
  let cur = [];
  const flush = () => {
    if (cur.length) runs.push(cur);
    cur = [];
  };
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i];
    const next = toks[i + 1];
    if (/^\d+$/.test(w)) { cur.push(w); continue; }
    if (own(TENS, w)) {
      if (own(UNITS, next) && next !== 'zero') { cur.push(String(TENS[w] + UNITS[next])); i++; continue; }
      if (own(ORD_UNITS, next)) { cur.push(String(TENS[w] + ORD_UNITS[next])); i++; continue; }
      cur.push(String(TENS[w]));
      continue;
    }
    if (own(TEENS, w)) { cur.push(String(TEENS[w])); continue; }
    if (own(ORD_TEENS, w)) { cur.push(String(ORD_TEENS[w])); continue; }
    if (own(ORD_TENS, w)) { cur.push(String(ORD_TENS[w])); continue; }
    if (w === 'oh' || w === 'o') {
      // "nine oh two" is a zero; "oh, okay" is not.
      if (cur.length || isNumberWord(next)) { cur.push('0'); continue; }
      flush();
      continue;
    }
    if (own(UNITS, w)) { cur.push(String(UNITS[w])); continue; }
    if (own(ORD_UNITS, w)) {
      // "July second" is a day; "one second" mid-sentence is harmless either way.
      if (cur.length) { cur.push(String(ORD_UNITS[w])); continue; }
      flush();
      continue;
    }
    if ((w === 'double' || w === 'triple') && own(UNITS, next)) {
      cur.push(String(UNITS[next]).repeat(w === 'double' ? 2 : 3));
      i++;
      continue;
    }
    if (own(MONTHS, w)) {
      // Month names count only next to a number, so "may I ask" stays a word.
      if (cur.length || isNumberWord(next)) { cur.push(String(MONTHS[w])); continue; }
      flush();
      continue;
    }
    if (FILLERS.has(w) && cur.length) continue;
    flush();
  }
  flush();
  return runs;
}

/** True if some consecutive tokens of a run concatenate exactly to one of the targets. */
export function runsMatch(runs, targets) {
  const set = new Set(targets);
  const maxLen = Math.max(...targets.map((t) => t.length));
  for (const run of runs) {
    for (let s = 0; s < run.length; s++) {
      let acc = '';
      for (let e = s; e < run.length; e++) {
        acc += run[e];
        if (set.has(acc)) return true;
        if (acc.length >= maxLen) break;
      }
    }
  }
  return false;
}

export function digitsOf(value) {
  return String(value).replace(/\D/g, '');
}

export function alnumOf(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** All digit strings that count as saying a date (ISO yyyy-mm-dd): m d y, d m y, y m d with 2- or 4-digit years. */
export function dateTargets(iso) {
  const [y, m, d] = String(iso).split('-').map((p) => p.trim());
  const months = [String(Number(m)), m.padStart(2, '0')];
  const days = [String(Number(d)), d.padStart(2, '0')];
  const years = [y, y.slice(-2)];
  const out = new Set();
  for (const mm of months) for (const dd of days) for (const yy of years) {
    out.add(mm + dd + yy);
    out.add(dd + mm + yy);
    if (yy.length === 4) out.add(yy + mm + dd);
  }
  return [...out];
}

/** Address secrets match on house number plus the first word of the street name. */
export function addressParts(address) {
  const m = String(address).trim().match(/^(\d+)\s+([A-Za-z]+)/);
  if (!m) return null;
  return { number: m[1], street: m[2].toLowerCase() };
}

/** Does this text say the secret? Secret kind is inferred from its key and value. */
export function mentionsSecret(text, key, value) {
  if (value === undefined || value === null || value === '') return false;
  if (key === 'date_of_birth' || /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return runsMatch(numberRuns(text), dateTargets(value));
  }
  if (key === 'home_address') {
    const parts = addressParts(value);
    if (!parts) return alnumOf(text).includes(alnumOf(value));
    return runsMatch(numberRuns(text), [parts.number]) && tokenize(text).includes(parts.street);
  }
  const digits = digitsOf(value);
  if (digits.length && digits.length === alnumOf(value).length) {
    return runsMatch(numberRuns(text), [digits]);
  }
  return alnumOf(text).includes(alnumOf(value));
}

/** Does this text cite a known detail (a plain phrase, or a number like 4471 or $86.12)? */
export function mentionsDetail(text, detail) {
  const digits = digitsOf(detail);
  if (digits.length >= 3 && /^[\d\s$.,:-]+$/.test(String(detail))) {
    return runsMatch(numberRuns(text), [digits]) || alnumOf(text).includes(digits);
  }
  return ` ${tokenize(text).join(' ')} `.includes(` ${tokenize(detail).join(' ')} `);
}
