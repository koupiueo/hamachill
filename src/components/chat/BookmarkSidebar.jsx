import { useState, useEffect } from 'react';
import { X, Bookmark } from 'lucide-react';
import { getNameStyle } from '../../utils/nameStyle';
import { getBookmarks, saveBookmarks } from '../../utils/bookmarks';
import { SidebarImagePreview } from './SpoilerMosaic';
import { t } from '../../i18n';
import { localizeSystemText } from '../../utils/systemMessages';

export default function BookmarkSidebar({ accountId, onClose, onJumpToMessage, isClosing = false, onlineAccountIds }) {
  const [bookmarks, setBookmarks] = useState([]);

  useEffect(() => {
    const loadBookmarks = () => setBookmarks(getBookmarks(accountId));
    loadBookmarks();
    window.addEventListener('bookmarks_updated', loadBookmarks);
    return () => window.removeEventListener('bookmarks_updated', loadBookmarks);
  }, [accountId]);

  const handleRemove = (e, id) => {
    e.stopPropagation();
    const updated = bookmarks.filter(b => b.id !== id);
    setBookmarks(updated);
    saveBookmarks(accountId, updated); // bookmarks_updated でメッセージ側のアイコンも外れる
  };

  return (
    <div className={`sidebar-content w-[85vw] md:w-[400px] max-h-[80vh] border border-zinc-950/10 bg-white shadow-2xl rounded-xl flex flex-col absolute right-4 top-2 z-50 ${isClosing ? 'sidebar-slide-out' : 'sidebar-slide-in'}`}>
      <div className="h-12 flex items-center justify-between px-4 border-b">
        <h3 className="font-bold text-sm flex items-center gap-2"><Bookmark size={16} /> {t('bookmarks.title')}</h3>
        <button onClick={onClose} className="p-1 hover:bg-black/5 rounded-md"><X size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {bookmarks.length === 0 ? (
          <div className="text-black/30 text-xs text-center mt-10">{t('bookmarks.empty')}</div>
        ) : (
          bookmarks.map((msg) => (
            <div
              key={msg.id}
              onClick={() => onJumpToMessage(msg.id, msg.channelId)}
              className="group p-3 bg-white border border-zinc-950/5 hover:border-zinc-400/50 hover:shadow-md transition-all rounded-xl cursor-pointer flex flex-col gap-2 relative"
            >
              <button 
                onClick={(e) => handleRemove(e, msg.id)}
                className="absolute top-2 right-2 p-1 text-zinc-900/20 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                title={t('bookmarks.remove')}
              >
                <X size={14} />
              </button>
              
              <div className="flex items-center gap-2 pr-6">
                <div className="relative shrink-0">
                  <div className="w-6 h-6 rounded-full bg-zinc-950/10 overflow-hidden border border-zinc-950/5">
                    {msg.avatarUrl ? (
                      <img src={msg.avatarUrl} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-black text-zinc-900/30 text-[10px]">
                        {msg.user?.[0] || '?'}
                      </div>
                    )}
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--theme-secondary)] ${onlineAccountIds?.includes(msg.msgAccountId || msg.user) ? 'bg-green-500' : 'bg-[#80848e]'}`} />
                </div>
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="font-bold text-[13px] truncate">{msg.user}</span>
                  <span className="text-[10px] text-zinc-900/40 shrink-0">{msg.time}</span>
                </div>
              </div>
              {msg.isDeleted ? (
                <p className="text-[13px] text-zinc-900/60 leading-relaxed italic underline">
                  {t('message.deleted')}
                </p>
              ) : (
                <p className="text-[13px] text-zinc-900/80 leading-relaxed whitespace-pre-wrap line-clamp-4">
                  {localizeSystemText(msg.text, msg.msgAccountId || msg.user)}
                </p>
              )}
              {!msg.isDeleted && msg.imageUrl && (
                <SidebarImagePreview imageUrl={msg.imageUrl} />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
