import { useState } from 'react';
import { api, saveToken } from '../../utils/api';
import { t } from '../../i18n';

export default function LoginPage({ onLogin }) {
  const [accountId, setAccountId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [shake, setShake] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, profile } = await api.login(accountId.trim(), password);
      saveToken(token);
      onLogin(profile);
    } catch (err) {
      setShake(true);
      setTimeout(() => setShake(false), 320);
      const errorMsg = err.message || '';
      if (err.code === 'request_blocked') {
        setError(t('auth.requestBlocked'));
      } else if (errorMsg.includes('Failed to fetch') || errorMsg.includes('Network')) {
        setError(t('auth.networkError'));
      } else if (err.status === 429 || err.code === 'rate_limited' || err.code === 'login_rate_limited') {
        setError(t('auth.tooManyAttempts'));
      } else {
        setError(t('auth.invalidCredentials'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-zinc-50 font-sans">
      <div className="w-full max-w-[440px] px-6">
        <div className={`bg-white border border-zinc-200 rounded-lg p-10 shadow-sm flex flex-col gap-6 hc-login-card ${shake ? 'hc-shake' : ''}`}>
          <div className="flex flex-col gap-3 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{t('auth.login')}</h1>
            <p className="text-[15px] text-zinc-500">{t('auth.loginTo')}</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-zinc-950">
                ID
              </label>
              <input
                type="text"
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                autoComplete="username"
                required
                className="flex h-12 w-full rounded-md border border-zinc-200 bg-white px-4 py-3 text-[15px] ring-offset-white placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-140"
              />
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-zinc-950">
                {t('auth.password')}
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="flex h-12 w-full rounded-md border border-zinc-200 bg-white px-4 py-3 text-[15px] ring-offset-white placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-140"
              />
            </div>

            {error && (
              <p className="text-[14px] font-medium text-red-500 bg-red-50/50 border border-red-200 rounded-md px-4 py-3 hc-fade-in">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 relative inline-flex items-center justify-center whitespace-nowrap rounded-md text-[15px] font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-zinc-950 text-zinc-50 hover:bg-zinc-900/90 h-12 px-6 py-3 w-full hc-press"
            >
              <span className={`inline-flex items-center justify-center transition-opacity duration-140 ${loading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                {t('auth.login')}
              </span>
              <span className={`absolute inset-0 inline-flex items-center justify-center gap-3 transition-opacity duration-140 ${loading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="w-5 h-5 border-2 border-zinc-50/30 border-t-zinc-50 rounded-full animate-spin" />
                <span>{t('auth.loggingIn')}</span>
              </span>
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
