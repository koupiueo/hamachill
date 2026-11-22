import React, { useState } from 'react';
import { Inbox } from 'lucide-react';
import ModalWrapper from '../ui/ModalWrapper';
import { t } from '../../i18n';

export default function FeedbackModal({ isOpen, onClose, onSend }) {
  const [title, setTitle] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [duration, setDuration] = useState(24 * 60 * 60 * 1000);

  const DURATIONS = [
    { label: t('duration.30s'), value: 30 * 1000 },
    { label: t('duration.5m'), value: 5 * 60 * 1000 },
    { label: t('duration.10m'), value: 10 * 60 * 1000 },
    { label: t('duration.1h'), value: 60 * 60 * 1000 },
    { label: t('duration.3h'), value: 3 * 60 * 60 * 1000 },
    { label: t('duration.12h'), value: 12 * 60 * 60 * 1000 },
    { label: t('duration.1d'), value: 24 * 60 * 60 * 1000 },
    { label: t('duration.2d'), value: 48 * 60 * 60 * 1000 },
    { label: t('duration.unlimited'), value: 0 },
  ];


  const handleSend = () => {
    if (!title.trim()) {
      alert(t('feedback.enterTopic'));
      return;
    }
    onSend({ 
      title: title.trim(), 
      anonymous, 
      endTime: duration === 0 ? null : Date.now() + duration, 
      responses: [] 
    });
    onClose();
    setTitle('');
    setAnonymous(false);
  };

  const footer = (
    <>
      <button onClick={onClose} className="px-4 py-2 text-[14px] font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200/50 dark:hover:bg-zinc-700 dark:hover:text-zinc-200 rounded-xl transition-colors">
        {t('common.cancel')}
      </button>
      <button onClick={handleSend} className="px-4 py-2 text-[14px] font-bold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white rounded-xl transition-colors shadow-sm">
        {t('common.create')}
      </button>
    </>
  );

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title={t('feedback.createTitle')} icon={Inbox} footer={footer}>
      <div className="space-y-4">
        <div>
          <label className="block text-[12px] font-bold text-zinc-500 dark:text-zinc-400 mb-2 ml-1">{t('feedback.topic')}</label>
          <textarea 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('feedback.topicPlaceholder')}
            className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-[14px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-zinc-900 dark:focus:border-white focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 transition-all resize-none h-24"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer group mt-2">
          <input 
            type="checkbox" 
            checked={anonymous} 
            onChange={(e) => setAnonymous(e.target.checked)}
            className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 text-zinc-900 focus:ring-zinc-900/20 transition-all cursor-pointer"
          />
          <span className="text-[13px] font-bold text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">{t('feedback.anonymous')}</span>
        </label>
        <div>
          <label className="block text-[12px] font-bold text-zinc-500 dark:text-zinc-400 mb-2 ml-1 mt-3">{t('common.duration')}</label>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-[14px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 focus:border-zinc-900 dark:focus:border-white transition-all"
          >
            {DURATIONS.map((d) => (
              <option key={d.value} value={d.value} className="bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">{d.label}</option>
            ))}
          </select>
        </div>
      </div>
    </ModalWrapper>
  );
}
