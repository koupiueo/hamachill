// Tiny dependency-free i18n.
//   t('chat.send')                         -> string for the current language
//   t('chat.remaining', { count: 3 })      -> "{{count}}" placeholders are filled in
//   plural forms: a value can be { "one": "...", "other": "..." } (Intl.PluralRules, uses vars.count)
// The language is picked once at startup (localStorage -> navigator.language) and never changes
// while the page is open: setLanguage() saves the choice and reloads, so module-level constants
// that call t() are always in the right language.
import ja from './ja.json';
import en from './en.json';

export const DICTIONARIES = { ja, en };
export const LANGUAGES = [
  { code: 'ja', label: '日本語' }, // i18n-ignore (language name is shown in its own language)
  { code: 'en', label: 'English' },
];
export const DEFAULT_LANGUAGE = 'en';
const STORAGE_KEY = 'hc_lang';

const isSupported = (lang) => Object.prototype.hasOwnProperty.call(DICTIONARIES, lang);

export function detectLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isSupported(saved)) return saved;
  } catch { /* storage unavailable */ }
  const nav = typeof navigator !== 'undefined' ? (navigator.languages?.[0] || navigator.language || '') : '';
  return /^ja\b/i.test(nav) ? 'ja' : DEFAULT_LANGUAGE;
}

let current = detectLanguage();
if (typeof document !== 'undefined') document.documentElement.lang = current;

export const getLanguage = () => current;
/** Saved language setting ('' = follow the browser). */
export const getSavedLanguage = () => { try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; } };

/** Save the language ('' = follow the browser) and reload so every string is re-rendered. */
export function setLanguage(lang) {
  try {
    if (lang && isSupported(lang)) localStorage.setItem(STORAGE_KEY, lang);
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
  const next = detectLanguage();
  if (next === current) return;
  current = next;
  if (typeof window !== 'undefined') window.location.reload();
}

const lookup = (dict, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);
const pluralRules = {};
const pickPlural = (value, count, lang) => {
  if (value == null || typeof value !== 'object' || !('other' in value)) return value;
  const rules = pluralRules[lang] || (pluralRules[lang] = new Intl.PluralRules(lang));
  const form = typeof count === 'number' ? rules.select(count) : 'other';
  return value[form] ?? value.other ?? Object.values(value)[0];
};
const interpolate = (str, vars) => (vars
  ? str.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, name) => (vars[name] === undefined || vars[name] === null ? '' : String(vars[name])))
  : str);

export function t(key, vars) {
  for (const lang of [current, DEFAULT_LANGUAGE, 'ja']) {
    const raw = pickPlural(lookup(DICTIONARIES[lang], key), vars?.count, lang);
    if (typeof raw === 'string') return interpolate(raw, vars);
  }
  if (import.meta.env?.DEV) console.warn('[i18n] missing key:', key);
  return key;
}

/** Does the key exist in the current (or fallback) dictionary? */
export const hasKey = (key) => [current, DEFAULT_LANGUAGE].some((l) => lookup(DICTIONARIES[l], key) !== undefined);

/** BCP 47 tag for Intl APIs. */
export const getLocaleTag = () => (current === 'ja' ? 'ja-JP' : 'en-US');

const DEFAULT_DATETIME = { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
/** Date/time formatted for the current language. `opts` are Intl.DateTimeFormat options. */
export function formatDate(value, opts = DEFAULT_DATETIME) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(getLocaleTag(), opts).format(d);
}

/** "3 minutes ago", "3分前" ... `value` is negative for the past. */
export function formatRelative(value, unit) {
  return new Intl.RelativeTimeFormat(getLocaleTag(), { numeric: 'auto' }).format(value, unit);
}

/** Translate an error returned by the server ({ code, params, error }) or a socket error code. */
export function serverError(errOrCode, fallbackKey = 'errors.generic') {
  const code = typeof errOrCode === 'string' ? errOrCode : errOrCode?.code;
  if (code && hasKey(`serverErrors.${code}`)) return t(`serverErrors.${code}`, errOrCode?.params);
  return t(fallbackKey);
}
