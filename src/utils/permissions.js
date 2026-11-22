// サーバーの設定（GET /api/config）をもとに権限を判定する。
// 管理者はサーバーの .env の ADMIN_IDS（空なら最初に作られたアカウント）で決まる。
import { useSyncExternalStore } from 'react';
import { setMaxUploadBytes } from '../constants/limits';

let config = { iceServers: [], gifEnabled: false, me: null };
const listeners = new Set();

export function getServerConfig() {
  return config;
}

export function setServerConfig(next) {
  config = {
    iceServers: Array.isArray(next?.iceServers) ? next.iceServers : [],
    gifEnabled: !!next?.gifEnabled,
    maxUploadBytes: Number(next?.maxUploadBytes) || null,
    me: next?.me && typeof next.me === 'object' ? next.me : null,
  };
  if (config.maxUploadBytes) setMaxUploadBytes(config.maxUploadBytes);
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useServerConfig() {
  return useSyncExternalStore(subscribe, getServerConfig, getServerConfig);
}

export async function loadServerConfig() {
  try {
    const headers = {};
    const token = localStorage.getItem('hc_token');
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch('/api/config', { headers, cache: 'no-store' });
    if (res.ok) setServerConfig(await res.json());
  } catch (e) {
    console.warn('[Config] failed to load server config:', e);
  }
  return config;
}

// 自分（ログイン中のアカウント）が管理者か
export function isAdmin(accountId) {
  return !!accountId && !!config.me && config.me.accountId === accountId && !!config.me.isAdmin;
}

export function canSeeChannel(accountId, channelId) {
  if (channelId === 'logs') return isAdmin(accountId);
  return true;
}
