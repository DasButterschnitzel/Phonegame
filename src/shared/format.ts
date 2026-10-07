const SUFFIX = ['', 'K', 'M', 'B', 'T'];

function letterSuffix(i: number): string {
  // i = 0 → "aa", 1 → "ab", … 25 → "az", 26 → "ba"
  const a = Math.floor(i / 26);
  const b = i % 26;
  return String.fromCharCode(97 + a) + String.fromCharCode(97 + b);
}

/** Big-number formatting: 999 → "999", 1234 → "1.23K", 45600000 → "45.6M"; German uses a decimal comma. */
export function formatNumber(n: number, lang: 'en' | 'de' = 'en'): string {
  if (!Number.isFinite(n)) return '∞';
  const neg = n < 0;
  let v = Math.abs(n);
  if (v < 1000) {
    const s = String(Math.floor(v));
    return neg ? `-${s}` : s;
  }
  let tier = 0;
  while (v >= 1000 && tier < 400) {
    v /= 1000;
    tier++;
  }
  // Rounding can push 999.95 → 1000.
  let digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  let fixed = v.toFixed(digits);
  if (Number(fixed) >= 1000) {
    v /= 1000;
    tier++;
    digits = 2;
    fixed = v.toFixed(digits);
  }
  const suffix = tier < SUFFIX.length ? SUFFIX[tier] : letterSuffix(tier - SUFFIX.length);
  const body = lang === 'de' ? fixed.replace('.', ',') : fixed;
  return `${neg ? '-' : ''}${body}${suffix}`;
}

/** mm:ss for short timers, h:mm:ss for long ones. */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const tail = `${mm}:${String(r).padStart(2, '0')}`;
  return h > 0 ? `${h}:${tail}` : tail;
}
