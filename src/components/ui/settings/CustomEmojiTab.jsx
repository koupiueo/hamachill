import { useState, useRef } from 'react';
import { SmilePlus, Upload, Trash2, AlertCircle } from 'lucide-react';
import { useCustomEmojis, fetchCustomEmojis } from '../../../utils/customEmojis';
import { isAdmin, useServerConfig } from '../../../utils/permissions';
import { t, serverError } from '../../../i18n';

const MAX_PER_USER = 15;
const NAME_RE = /^[a-zA-Z0-9_]{2,24}$/;

export default function CustomEmojiTab({ socket, currentUserState }) {
  useServerConfig();
  const emojis = useCustomEmojis(socket);
  const myAccountId = currentUserState?.accountId;
  const myEmojis = emojis.filter(e => e.ownerAccountId === myAccountId);
  const otherEmojis = emojis.filter(e => e.ownerAccountId !== myAccountId);
  const isUnlimited = isAdmin(myAccountId);
  const isAtLimit = !isUnlimited && myEmojis.length >= MAX_PER_USER;

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [name, setName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setError(t('customEmoji.chooseImageFormat'));
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError(t('customEmoji.fileTooLarge'));
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setError('');
    if (!name.trim()) {
      const autoName = f.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 24);
      if (autoName.length >= 2) setName(autoName);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (isAtLimit) {
      setError(t('customEmoji.limitReached', { max: MAX_PER_USER }));
      return;
    }
    const cleanName = name.trim().replace(/^:+|:+$/g, '');
    if (!file) {
      setError(t('customEmoji.chooseImage'));
      return;
    }
    if (!NAME_RE.test(cleanName)) {
      setError(t('customEmoji.invalidName'));
      return;
    }

    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('name', cleanName);
      fd.append('emoji', file);
      const token = localStorage.getItem('hc_token');
      const res = await fetch('/api/custom-emojis', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(serverError(data, 'common.uploadFailedDot'));
        return;
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(null);
      setPreviewUrl('');
      setName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchCustomEmojis(true);
    } catch {
      setError(t('errors.connection'));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (emoji) => {
    try {
      const token = localStorage.getItem('hc_token');
      const res = await fetch(`/api/custom-emojis/${encodeURIComponent(emoji.id)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        await fetchCustomEmojis(true);
      }
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-bold text-zinc-900 dark:text-zinc-100">{t('emoji.custom')}</h2>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
            {t('customEmoji.description', { max: MAX_PER_USER })}
          </p>
        </div>
        <div className={`px-3 py-1 rounded-full text-[12px] font-bold shrink-0 ${
          isAtLimit
            ? 'bg-red-500/10 text-red-500 border border-red-500/20'
            : 'bg-zinc-950/5 dark:bg-white/10 text-zinc-700 dark:text-zinc-200'
        }`}>
          {isUnlimited ? t('customEmoji.countUnlimited', { count: myEmojis.length }) : t('customEmoji.countOfMax', { count: myEmojis.length, max: MAX_PER_USER })}
        </div>
      </div>

      {/* Add Form */}
      <form onSubmit={handleUpload} className="p-4 rounded-xl bg-white dark:bg-[#1e1f22] border border-black/[0.08] dark:border-white/[0.08] space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-20 h-20 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 dark:hover:border-zinc-500 bg-zinc-50 dark:bg-zinc-900 flex flex-col items-center justify-center gap-1 overflow-hidden shrink-0 transition-colors"
            title={t('customEmoji.selectImage')}
          >
            {previewUrl ? (
              <img src={previewUrl} alt="preview" className="w-14 h-14 object-contain" />
            ) : (
              <>
                <Upload size={18} className="text-zinc-400" />
                <span className="text-[10px] font-bold text-zinc-400">{t('customEmoji.imageSelect')}</span>
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex-1 w-full space-y-2">
            <label className="block text-[12px] font-bold text-zinc-600 dark:text-zinc-300">
              {t('customEmoji.nameLabelPrefix')}<code className="font-mono">{t('customEmoji.nameToken')}</code> {t('customEmoji.nameLabelSuffix')}
            </label>
            <div className="flex items-center gap-2">
              <div className="flex items-center flex-1 bg-zinc-100 dark:bg-[#2b2d31] border border-black/[0.08] dark:border-white/[0.08] rounded-lg px-3 py-2">
                <span className="text-zinc-400 font-mono text-sm">:</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my_emoji"
                  maxLength={24}
                  className="flex-1 bg-transparent outline-none text-[13.5px] font-mono text-zinc-900 dark:text-zinc-100 px-1"
                />
                <span className="text-zinc-400 font-mono text-sm">:</span>
              </div>
              <button
                type="submit"
                disabled={uploading || isAtLimit}
                className="px-4 py-2 rounded-lg bg-zinc-900 hover:bg-black dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 shrink-0"
              >
                <SmilePlus size={15} />
                {uploading ? t('customEmoji.adding') : t('common.add')}
              </button>
            </div>
            <p className="text-[11px] text-zinc-400">{t('customEmoji.nameRules')}</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-[12px] font-semibold text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </form>

      {/* My Emojis */}
      <div className="space-y-2.5">
        <h3 className="text-[13px] font-bold text-zinc-700 dark:text-zinc-300">
          {t('customEmoji.yours')}{isUnlimited ? t('customEmoji.count', { count: myEmojis.length }) : `${myEmojis.length} / ${MAX_PER_USER}`})
        </h3>
        {myEmojis.length === 0 ? (
          <div className="p-6 text-center rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 text-[12.5px] text-zinc-400">
            {t('customEmoji.noneYet')}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {myEmojis.map((emoji) => (
              <div
                key={emoji.id}
                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white dark:bg-[#1e1f22] border border-black/[0.08] dark:border-white/[0.08] group"
              >
                <img src={emoji.url} alt={emoji.name} className="w-8 h-8 object-contain shrink-0" />
                <span className="flex-1 min-w-0 text-[12.5px] font-mono font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                  :{emoji.name}:
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(emoji)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
                  title={t('common.delete')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Other Users' Emojis */}
      {otherEmojis.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="text-[13px] font-bold text-zinc-700 dark:text-zinc-300">
            {t('customEmoji.everyones')}{otherEmojis.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {otherEmojis.map((emoji) => (
              <div
                key={emoji.id}
                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white dark:bg-[#1e1f22] border border-black/[0.08] dark:border-white/[0.08]"
              >
                <img src={emoji.url} alt={emoji.name} className="w-8 h-8 object-contain shrink-0" />
                <span className="flex-1 min-w-0 text-[12.5px] font-mono font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                  :{emoji.name}:
                </span>
                {isAdmin(myAccountId) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(emoji)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
                    title={t('customEmoji.adminDelete')}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
