import { EMOJI_MAP } from './emojiMap';

export const EMOJI_REV = new Map(Object.entries(EMOJI_MAP).map(([k, v]) => [v, k]));
const DEFAULTS = ['❤️', '👍', '😂', '🥺', '✨', '🔥'];
let cache = null;
const subs = new Set();

function read() {
  try {
    const recent = JSON.parse(localStorage.getItem('recent_emojis') || '[]');
    const quick = recent.map(k => EMOJI_MAP[k] || k).filter(Boolean).slice(0, 6);
    for (const d of DEFAULTS) {
      if (quick.length >= 6) break;
      if (!quick.includes(d)) quick.push(d);
    }
    return quick;
  } catch {
    return DEFAULTS;
  }
}

export function getQuickEmojis() {
  return cache || (cache = read());
}

export function subscribeQuickEmojis(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function updateRecentEmojis(emoji) {
  let recent;
  try {
    recent = JSON.parse(localStorage.getItem('recent_emojis') || '[]');
  } catch {
    recent = [];
  }
  if (!Array.isArray(recent)) recent = [];
  const updated = [emoji, ...recent.filter(e => e !== emoji)].slice(0, 32);
  localStorage.setItem('recent_emojis', JSON.stringify(updated));
  cache = read();
  subs.forEach(f => f());
}
