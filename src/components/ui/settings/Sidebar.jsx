import React from 'react';
import { LogOut } from 'lucide-react';
import { t } from '../../../i18n';

const Sidebar = ({ activeTab, onTabSelect, tabs, onLogout }) => {
  const userTabs = tabs.filter(t => !t.section || t.section === 'user');
  const serverTabs = tabs.filter(t => t.section === 'server');

  return (
    <>
      {/* Mobile: horizontal tab bar */}
      <div className="md:hidden flex items-center bg-zinc-100 dark:bg-[#1e1f22] border-b border-zinc-200 dark:border-white/[0.08] overflow-x-auto no-scrollbar shrink-0 pr-12">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabSelect(tab.id)}
            className={`flex items-center gap-2 px-4 py-3.5 text-[13.5px] font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0 ${
              activeTab === tab.id
                ? 'border-zinc-900 dark:border-white text-zinc-900 dark:text-white'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
        <button
          onClick={onLogout}
          className="flex items-center gap-2 px-4 py-3.5 text-[13.5px] font-semibold whitespace-nowrap border-b-2 border-transparent text-red-500 hover:text-red-600 shrink-0 ml-auto"
        >
          <LogOut size={16} />
          {t('account.logout')}
        </button>
      </div>

      {/* Desktop: vertical sidebar */}
      <div className="hidden md:flex w-[260px] lg:w-[30%] bg-[#f2f3f5] dark:bg-[#1e1f22] border-r border-black/[0.06] dark:border-white/[0.06] justify-end shrink-0 select-none">
        <div className="w-full max-w-[232px] px-3 py-12 flex flex-col gap-0.5">
          <div className="text-[11px] font-bold tracking-wider text-zinc-500 dark:text-zinc-400 uppercase mb-1.5 px-3">
            {t('settings.userSettings')}
          </div>
          {userTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabSelect(tab.id)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-[8px] transition-colors duration-100 text-[14px] font-semibold w-full text-left ${
                activeTab === tab.id
                  ? 'bg-black/[0.08] dark:bg-white/[0.1] text-zinc-900 dark:text-white'
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}

          {serverTabs.length > 0 && (
            <>
              <div className="h-px bg-black/[0.06] dark:bg-white/[0.08] my-3 mx-2" />
              <div className="text-[11px] font-bold tracking-wider text-zinc-500 dark:text-zinc-400 uppercase mb-1.5 px-3">
                {t('settings.serverSettings')}
              </div>
              {serverTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => onTabSelect(tab.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-[8px] transition-colors duration-100 text-[14px] font-semibold w-full text-left ${
                    activeTab === tab.id
                      ? 'bg-black/[0.08] dark:bg-white/[0.1] text-zinc-900 dark:text-white'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </>
          )}
          <div className="mt-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
            <button
              className="flex items-center gap-2.5 px-3 py-2 rounded-[8px] transition-colors duration-100 text-[14px] font-semibold w-full text-left text-red-500 hover:bg-red-500/10"
              onClick={onLogout}
            >
              <LogOut size={18} />
              {t('account.logout')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default React.memo(Sidebar);
