// ブックマーク（localStorage）。アカウントごとにキーを分ける: bookmarks:<accountId>
// 以前の共通キー 'bookmarks' は、最初に読んだアカウントへ1回だけ移す。
const LEGACY_KEY = 'bookmarks';
const keyFor = (accountId) => `bookmarks:${accountId || 'anonymous'}`;

let cacheAccount = null;
let cacheList = null;
let cacheIds = null;
let cacheAt = 0;

function safeParse(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(b => b && typeof b === 'object' && b.id) : [];
  } catch {
    return [];
  }
}

function migrateLegacy(accountId) {
  if (!accountId) return;
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy === null) return;
    if (localStorage.getItem(keyFor(accountId)) === null) {
      localStorage.setItem(keyFor(accountId), JSON.stringify(safeParse(legacy)));
    }
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* ignore */ }
}

export function getBookmarks(accountId) {
  if (cacheList && cacheAccount === accountId && Date.now() - cacheAt < 1000) return cacheList;
  migrateLegacy(accountId);
  let list = [];
  try { list = safeParse(localStorage.getItem(keyFor(accountId))); } catch { /* ignore */ }
  cacheAccount = accountId;
  cacheList = list;
  cacheIds = new Set(list.map(b => b.id));
  cacheAt = Date.now();
  return list;
}

export function isBookmarkedId(accountId, id) {
  getBookmarks(accountId);
  return cacheIds.has(id);
}

export function saveBookmarks(accountId, list) {
  const clean = Array.isArray(list) ? list : [];
  try { localStorage.setItem(keyFor(accountId), JSON.stringify(clean)); } catch { /* ignore */ }
  cacheAccount = accountId;
  cacheList = clean;
  cacheIds = new Set(clean.map(b => b.id));
  cacheAt = Date.now();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('bookmarks_updated'));
}
