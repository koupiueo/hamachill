import React, { useState } from 'react';
import { Moon, Sun, Leaf, Citrus, Trees, CloudRain, Languages } from 'lucide-react';
import { Section, Card } from './SharedComponents';
import { t } from '../../../i18n';
import { useI18n } from '../../../i18n/context';

const THEMES = [
  { id: 'light', name: t('appearance.themes.light'), desc: t('appearance.themes.lightDesc'), icon: Sun, swatch: '#fbfbfb', activeClass: 'border-zinc-900 dark:border-white bg-zinc-100 dark:bg-white/[0.08] text-zinc-900 dark:text-white', iconActive: 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' },
  { id: 'dark', name: t('appearance.themes.dark'), desc: t('appearance.themes.darkDesc'), icon: Moon, swatch: '#18181b', activeClass: 'border-zinc-900 dark:border-white bg-zinc-100 dark:bg-white/[0.08] text-zinc-900 dark:text-white', iconActive: 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' },
  { id: 'mint', name: 'Mint', desc: t('appearance.themes.mintDesc'), icon: Leaf, swatch: '#6ee7b7', activeClass: 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', iconActive: 'bg-emerald-500 text-white' },
  { id: 'citrus', name: t('appearance.themes.citrus'), desc: t('appearance.themes.citrusDesc'), icon: Citrus, swatch: '#fb923c', activeClass: 'border-orange-500 bg-orange-50/70 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300', iconActive: 'bg-orange-500 text-white' },
  { id: 'forest', name: t('appearance.themes.forest'), desc: t('appearance.themes.forestDesc'), icon: Trees, swatch: '#14532d', activeClass: 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-600/20 text-emerald-700 dark:text-emerald-300', iconActive: 'bg-emerald-600 text-white' },
  { id: 'raincloud', name: t('appearance.themes.raincloud'), desc: t('appearance.themes.raincloudDesc'), icon: CloudRain, swatch: '#60a5fa', activeClass: 'border-blue-500 bg-blue-50/70 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300', iconActive: 'bg-blue-500 text-white' },
];

function AppearanceTab() {
  const [theme, setTheme] = useState(() => localStorage.getItem('hc_theme') || 'light');
  const { savedLang, setLang, languages } = useI18n();

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('hc_theme', newTheme);
    document.documentElement.dataset.theme = newTheme;
  };

  return (
    <Section title={t('settings.tabs.appearance')}>
      <Card title={t('appearance.theme')} description={t('appearance.themeDesc')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {THEMES.map((opt) => {
            const Icon = opt.icon;
            const isSelected = theme === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => handleThemeChange(opt.id)}
                className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border-2 transition-colors duration-120 text-left cursor-pointer ${
                  isSelected
                    ? opt.activeClass
                    : 'border-black/[0.07] dark:border-white/[0.08] hover:border-black/[0.18] dark:hover:border-white/[0.2] text-zinc-700 dark:text-zinc-200 bg-zinc-50/50 dark:bg-[#1a1b1e]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    isSelected ? opt.iconActive : 'bg-black/[0.06] dark:bg-white/[0.08] text-zinc-500 dark:text-zinc-400'
                  }`}>
                    <Icon size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-[14px] truncate">{opt.name}</div>
                    <div className="text-[12px] opacity-75 mt-0.5 truncate">{opt.desc}</div>
                  </div>
                </div>
                <span
                  className="w-4 h-4 rounded-full border border-black/15 dark:border-white/20 shrink-0"
                  style={{ backgroundColor: opt.swatch }}
                />
              </button>
            );
          })}
        </div>
      </Card>
      <Card title={t('appearance.language')} description={t('appearance.languageDesc')}>
        <label className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-black/[0.06] dark:bg-white/[0.08] text-zinc-500 dark:text-zinc-400">
            <Languages size={20} />
          </span>
          <select
            value={savedLang}
            onChange={(e) => setLang(e.target.value)}
            aria-label={t('appearance.language')}
            className="flex-1 min-w-0 bg-zinc-50 dark:bg-[#1a1b1e] border border-black/[0.09] dark:border-white/[0.1] rounded-xl px-3.5 py-2.5 text-[14.5px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 dark:focus:ring-white/15 cursor-pointer"
          >
            <option value="">{t('appearance.languageAuto')}</option>
            {languages.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
      </Card>
    </Section>
  );
}

export default React.memo(AppearanceTab);
