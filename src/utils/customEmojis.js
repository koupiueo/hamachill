import { useState, useEffect } from 'react';
import { api } from './api';

let cachedEmojis = [];
let hasFetched = false;
let inflightPromise = null;
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(cachedEmojis);
}

export async function fetchCustomEmojis(force = false) {
  if (!force && hasFetched) return cachedEmojis;
  if (!force && inflightPromise) return inflightPromise;
  inflightPromise = api
    .get('/custom-emojis')
    .then((data) => {
      cachedEmojis = Array.isArray(data?.emojis) ? data.emojis : [];
      hasFetched = true;
      notify();
      return cachedEmojis;
    })
    .catch(() => cachedEmojis)
    .finally(() => {
      inflightPromise = null;
    });
  return inflightPromise;
}

export function getCustomEmojisSnapshot() {
  return cachedEmojis;
}

export function getCustomEmojiByToken(token) {
  if (typeof token !== 'string' || !token) return null;
  const name = token.startsWith(':') && token.endsWith(':') && token.length > 2
    ? token.slice(1, -1)
    : token;
  return cachedEmojis.find(e => e.name === name) || null;
}

let socketBound = null;

export function useCustomEmojis(socket = null) {
  const [emojis, setEmojis] = useState(cachedEmojis);

  useEffect(() => {
    listeners.add(setEmojis);
    fetchCustomEmojis(false);

    if (socket && socketBound !== socket) {
      socketBound = socket;
      socket.on('custom_emojis_updated', () => {
        fetchCustomEmojis(true);
      });
    }

    return () => {
      listeners.delete(setEmojis);
    };
  }, [socket]);

  return emojis;
}
