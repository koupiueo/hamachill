import { ShieldAlert } from 'lucide-react';
import PanelHeader from '../ui/PanelHeader';
import { t } from '../../i18n';

export default function RulesPage() {
  return (
    <main className="flex-1 flex flex-col min-w-0 bg-transparent relative overflow-hidden">
      <PanelHeader title={t('channels.rules')} borderVar="--border-chat" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl mx-auto flex flex-col gap-6 mt-4">

          <div className="flex items-center gap-3">
            <ShieldAlert size={28} className="text-indigo-400 shrink-0" />
            <h1 className="text-2xl font-black text-zinc-900 tracking-tight">{t('rules.title')}</h1>
          </div>

          <div className="flex flex-col gap-6 mt-2">
            <div>
              <h2 className="text-sm font-bold text-zinc-900/40 uppercase tracking-widest mb-4">{t('rules.important')}</h2>
              <ul className="flex flex-col gap-3 pl-1">
                {[
                  t('rules.noPasswords'),
                  t('rules.noPersonalInfo'),
                  t('rules.carefulPhotos'),
                  t('rules.noTrolling'),
                ].map((rule, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="text-zinc-900/30 font-bold mt-1">{i + 1}.</span>
                    <span className="text-zinc-900/80 text-[15px]">{rule}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-sm font-bold text-zinc-900/40 uppercase tracking-widest mb-3">{t('common.other')}</h2>
              <p className="text-zinc-900/70 text-[15px] leading-relaxed pl-1">
                {t('rules.commonSense')}<br />
                {t('rules.askAdmin')}
              </p>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
