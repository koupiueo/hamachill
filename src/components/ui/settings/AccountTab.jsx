import React from 'react';
import { LogOut } from 'lucide-react';
import { Section, Card } from './SharedComponents';
import { clearToken } from '../../../utils/api';
import { t } from '../../../i18n';

const AccountTab = ({ userState, onLogout }) => {
  const handleLogout = () => {
    clearToken();
    onLogout?.();
  };

  return (
    <Section title={t('settings.tabs.account')}>
      {userState && (
        <Card title={t('account.info')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="flex flex-col gap-1 bg-zinc-50 dark:bg-[#1a1b1e] border border-black/[0.06] dark:border-white/[0.08] rounded-xl px-4 py-3">
              <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t('account.displayName')}</span>
              <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate">{userState.name || t('common.notSet')}</span>
            </div>
            <div className="flex flex-col gap-1 bg-zinc-50 dark:bg-[#1a1b1e] border border-black/[0.06] dark:border-white/[0.08] rounded-xl px-4 py-3">
              <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t('account.accountId')}</span>
              <span className="font-medium text-zinc-700 dark:text-zinc-300 select-all truncate">{userState.accountId || userState.id || '-'}</span>
            </div>
          </div>
        </Card>
      )}

      <Card title={t('account.session')} description={t('account.logoutHint')}>
        <button
          onClick={handleLogout}
          className="w-fit flex items-center gap-2 px-5 py-2.5 bg-red-500/10 hover:bg-red-500 text-red-600 dark:text-red-400 hover:text-white border border-red-500/20 hover:border-red-500 rounded-xl text-sm font-bold transition-colors cursor-pointer"
        >
          <LogOut size={16} /> {t('account.logout')}
        </button>
      </Card>
    </Section>
  );
};

export default React.memo(AccountTab);
