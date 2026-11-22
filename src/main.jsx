import React from 'react'
import ReactDOM from 'react-dom/client'
// i18n を最初に読み込む（言語の決定と <html lang> の設定）
import './i18n'
import I18nProvider from './i18n/I18nProvider'
import App from './App'
// フォントは自前で配信する（Google Fonts は使わない）
import '@fontsource-variable/inter'
import '@fontsource-variable/noto-sans-jp'
import './index.css'

const reloadOnceOnChunkError = () => {
  try {
    const key = 'hc_chunk_reload_at';
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last > 10000) {
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    }
  } catch {
    window.location.reload();
  }
};

window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  reloadOnceOnChunkError();
});

window.addEventListener('unhandledrejection', (e) => {
  const msg = String(e?.reason?.message || e?.reason || '');
  if (msg.includes('Failed to fetch dynamically imported module') || msg.includes('Importing a module script failed')) {
    reloadOnceOnChunkError();
  }
});

const theme = localStorage.getItem('hc_theme') || 'light';
document.documentElement.dataset.theme = theme;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
)