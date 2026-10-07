import { en, type I18nKey } from './en.ts';
import { de } from './de.ts';
import { formatNumber } from '../../shared/format.ts';

export type Lang = 'en' | 'de';
export type LangSetting = Lang | 'auto';
const TABLES: Record<Lang, Record<I18nKey, string>> = { en, de };

let current: Lang = 'en';
/** Language reported by the portal SDK (YouTube / CrazyGames) — wins over the browser for 'auto'. */
let portalHint: string | null = null;
const listeners: (() => void)[] = [];

export function detectLang(hint?: string | null): Lang {
  const l = (hint || (typeof navigator !== 'undefined' ? navigator.language : 'en') || 'en').toLowerCase();
  return l.startsWith('de') ? 'de' : 'en';
}

export function setLang(setting: LangSetting, hint?: string | null): void {
  if (hint) portalHint = hint;
  const next = setting === 'auto' ? detectLang(hint ?? portalHint) : setting;
  if (next === current) return;
  current = next;
  if (typeof document !== 'undefined') document.documentElement.lang = current;
  for (const l of listeners) l();
}

export const lang = (): Lang => current;
export const onLangChange = (fn: () => void): void => {
  listeners.push(fn);
};

export function t(key: I18nKey, params?: Record<string, string | number>): string {
  let s = TABLES[current][key] ?? en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export const fmt = (n: number): string => formatNumber(n, current);
export type { I18nKey };
