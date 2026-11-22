import React, { useState } from 'react';
import { BarChart3, Plus, Trash2 } from 'lucide-react';
import ModalWrapper from '../ui/ModalWrapper';
import { t } from '../../i18n';

export default function PollModal({ isOpen, onClose, onSend }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [duration, setDuration] = useState(60 * 60 * 1000);
  const [multipleChoice, setMultipleChoice] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [allowAddOptions, setAllowAddOptions] = useState(false);

  const DURATIONS = [
    { label: t('duration.30s'), value: 30 * 1000 },
    { label: t('duration.5m'), value: 5 * 60 * 1000 },
    { label: t('duration.10m'), value: 10 * 60 * 1000 },
    { label: t('duration.1h'), value: 60 * 60 * 1000 },
    { label: t('duration.3h'), value: 3 * 60 * 60 * 1000 },
    { label: t('duration.12h'), value: 12 * 60 * 60 * 1000 },
    { label: t('duration.1d'), value: 24 * 60 * 60 * 1000 },
    { label: t('duration.2d'), value: 48 * 60 * 60 * 1000 },
  ];

  const handleOptionChange = (index, value) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleAddOption = () => {
    if (options.length < 10) {
      setOptions([...options, '']);
    }
  };

  const handleRemoveOption = (index) => {
    if (options.length > 2) {
      const newOptions = options.filter((_, i) => i !== index);
      setOptions(newOptions);
    }
  };

  const handleSend = () => {
    if (!question.trim()) {
      alert(t('poll.enterQuestion'));
      return;
    }
    const validOptions = options.filter(o => o.trim());
    if (validOptions.length < 2) {
      alert(t('poll.needTwoOptions'));
      return;
    }
    onSend({ question: question.trim(), options: validOptions, endTime: Date.now() + duration, multipleChoice, anonymous, allowAddOptions });
    onClose();
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
    <ModalWrapper isOpen={isOpen} onClose={onClose} title={t('poll.createTitle')} icon={BarChart3} footer={footer}>
      <div className="space-y-4">
        <div>
          <label className="block text-[12px] font-bold text-zinc-500 dark:text-zinc-400 mb-2 ml-1">{t('poll.question')}</label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t('poll.questionPlaceholder')}
            className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-[14px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 focus:border-zinc-900 dark:focus:border-white transition-all"
          />
        </div>

        <div>
          <label className="block text-[12px] font-bold text-zinc-500 dark:text-zinc-400 mb-2 ml-1">{t('common.duration')}</label>
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

        <div>
          <label className="block text-[12px] font-bold text-zinc-500 dark:text-zinc-400 mb-2 ml-1">{t('poll.options')}</label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => handleOptionChange(i, e.target.value)}
                  placeholder={t('poll.optionN', { n: i + 1 })}
                  className="flex-1 px-4 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-[14px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20 focus:border-zinc-900 dark:focus:border-white transition-all"
                />
                {options.length > 2 && (
                  <button onClick={() => handleRemoveOption(i)} className="p-2 text-zinc-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < 10 && (
            <button onClick={handleAddOption} className="mt-3 flex items-center gap-2 px-3 py-2 text-[13px] font-bold text-zinc-900 dark:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors">
              <Plus size={16} /> {t('poll.addOption')}
            </button>
          )}
        </div>
        
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
          <label className="flex items-center gap-2 cursor-pointer group mt-2">
            <input 
              type="checkbox" 
              checked={multipleChoice} 
              onChange={(e) => setMultipleChoice(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 text-zinc-900 focus:ring-zinc-900/20 transition-all cursor-pointer"
            />
            <span className="text-[13px] font-bold text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">{t('poll.allowMultiple')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer group mt-2">
            <input 
              type="checkbox" 
              checked={anonymous} 
              onChange={(e) => setAnonymous(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 text-zinc-900 focus:ring-zinc-900/20 transition-all cursor-pointer"
            />
            <span className="text-[13px] font-bold text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">{t('poll.anonymousMode')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer group mt-2">
            <input 
              type="checkbox" 
              checked={allowAddOptions} 
              onChange={(e) => setAllowAddOptions(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 text-zinc-900 focus:ring-zinc-900/20 transition-all cursor-pointer"
            />
            <span className="text-[13px] font-bold text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">{t('poll.allowAddOptions')}</span>
          </label>
        </div>
      </div>
    </ModalWrapper>
  );
}
