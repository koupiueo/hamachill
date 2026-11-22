import { t } from '../../../i18n';
export const Section = ({ title, children }) => (
  <div className="flex flex-col gap-5 mb-10">
    <h2 className="text-[22px] font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight pl-1">{title}</h2>
    {children}
  </div>
);

export const Card = ({ title, children, description }) => (
  <div className="bg-white dark:bg-[#232428] border border-black/[0.07] dark:border-white/[0.08] shadow-xs p-5 sm:p-6 rounded-2xl flex flex-col gap-5">
    {(title || description) && (
      <div className="flex flex-col gap-1.5 pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
        {title && <h3 className="text-[16px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">{title}</h3>}
        {description && <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed">{description}</p>}
      </div>
    )}
    {children}
  </div>
);

export const InputField = ({ label, value, onChange, placeholder, type = "text", multiline = false, setHasChanges, readOnly = false }) => (
  <div className="flex flex-col gap-1.5 w-full">
    <span className="text-[11.5px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-2 pl-1">
      {label}
      {readOnly && <span className="text-[10px] text-zinc-400 dark:text-zinc-500 normal-case tracking-normal font-medium bg-black/[0.05] dark:bg-white/[0.08] px-2 py-0.5 rounded-full">{t('settings.readOnly')}</span>}
    </span>
    {multiline ? (
      <textarea
        value={value}
        onChange={(e) => { onChange(e.target.value); if (setHasChanges) setHasChanges(true); }}
        placeholder={placeholder}
        rows={4}
        className="bg-zinc-50 dark:bg-[#1a1b1e] border border-black/[0.09] dark:border-white/[0.1] rounded-xl px-3.5 py-2.5 text-[14.5px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 dark:focus:ring-white/15 focus:border-zinc-400 dark:focus:border-white/25 focus:bg-white dark:focus:bg-[#1e1f22] transition-[border-color,box-shadow,background-color] duration-120 resize-none"
      />
    ) : (
      <input
        type={type}
        value={value}
        onChange={(e) => { if (!readOnly) { onChange(e.target.value); if (setHasChanges) setHasChanges(true); } }}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`border rounded-xl px-3.5 py-2.5 text-[14.5px] transition-[border-color,box-shadow,background-color] duration-120 focus:outline-none ${
          readOnly
            ? 'bg-black/[0.04] dark:bg-white/[0.04] border-transparent text-zinc-400 dark:text-zinc-500 cursor-not-allowed select-all'
            : 'bg-zinc-50 dark:bg-[#1a1b1e] border-black/[0.09] dark:border-white/[0.1] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-zinc-950/10 dark:focus:ring-white/15 focus:border-zinc-400 dark:focus:border-white/25 focus:bg-white dark:focus:bg-[#1e1f22]'
        }`}
      />
    )}
  </div>
);
