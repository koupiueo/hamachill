import { useState, useEffect } from 'react';
import { X, Pin, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { getNameStyle } from '../../utils/nameStyle';
import { isAdmin } from '../../utils/permissions';
import { SidebarImagePreview } from './SpoilerMosaic';
import { t, formatDate } from '../../i18n';
import { localizeSystemText } from '../../utils/systemMessages';

export default function PinSidebar({ channel, socket, currentAccountId, onClose, onJumpToMessage, isClosing = false, onlineAccountIds }) {
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const limit = 25;

  useEffect(() => {
    if (!socket || !channel) return;
    
    setLoading(true);
    socket.emit('get_pinned_messages', { channelId: channel.id }, (res) => {
      if (res && res.success) {
        setPinnedMessages(res.messages);
      }
      setLoading(false);
    });

    const handleMessagePinned = ({ messageId, isPinned, channelId: pinnedChannelId, message }) => {
      if (pinnedChannelId && pinnedChannelId !== channel.id) return;
      if (isPinned && message) {
        setPinnedMessages(prev => (prev.some(m => m.id === messageId) ? prev : [message, ...prev]));
      } else if (!isPinned) {
        setPinnedMessages(prev => prev.filter(m => m.id !== messageId));
      }
    };

    // 削除されたメッセージはピン一覧から消す
    const handleMessageDeleted = ({ messageId }) => {
      setPinnedMessages(prev => prev.filter(m => m.id !== messageId));
    };

    socket.on('message_pinned', handleMessagePinned);
    socket.on('message_deleted', handleMessageDeleted);
    return () => {
      socket.off('message_pinned', handleMessagePinned);
      socket.off('message_deleted', handleMessageDeleted);
    };
  }, [socket, channel]);

  const handleRemovePin = (e, id) => {
    e.stopPropagation();
    socket.emit('toggle_pin', { messageId: id, channelId: channel.id, isPinned: false });
  };

  const totalPages = Math.ceil(pinnedMessages.length / limit) || 1;
  const paginatedMessages = pinnedMessages.slice((page - 1) * limit, page * limit);

  return (
    <div className={`sidebar-content w-[85vw] md:w-[400px] max-h-[80vh] border border-zinc-950/10 bg-white shadow-2xl rounded-xl flex flex-col absolute right-4 top-2 z-50 ${isClosing ? 'sidebar-slide-out' : 'sidebar-slide-in'}`}>
      <div className="h-12 flex items-center justify-between px-4 border-b">
        <h3 className="font-bold text-sm flex items-center gap-2"><Pin size={16} className="fill-zinc-800 text-zinc-800" /> {t('common.pin')}</h3>
        <button onClick={onClose} className="p-1 hover:bg-black/5 rounded-md"><X size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {loading ? (
          <div className="flex justify-center mt-10">
            <div className="w-5 h-5 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin" />
          </div>
        ) : pinnedMessages.length === 0 ? (
          <div className="text-black/30 text-xs text-center mt-10">{t('pins.empty')}</div>
        ) : (
          paginatedMessages.map((msg) => (
            <div
              key={msg.id}
              onClick={() => onJumpToMessage(msg.id, msg.channelId)}
              className="group p-3 bg-white border border-zinc-950/5 hover:border-zinc-400/50 hover:shadow-md transition-all rounded-xl cursor-pointer flex flex-col gap-2 relative"
            >
              {(msg.user === currentAccountId || isAdmin(currentAccountId)) && (
              <button 
                onClick={(e) => handleRemovePin(e, msg.id)}
                className="absolute top-2 right-2 p-1 text-zinc-900/20 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                title={t('common.unpin')}
              >
                <X size={14} />
              </button>
              )}
              
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
                  <span className="text-[10px] text-zinc-900/40 shrink-0">{formatDate(msg.timestamp)}</span>
                </div>
              </div>
              {msg.isDeleted === 1 ? (
                <p className="text-[13px] text-zinc-900/60 leading-relaxed italic underline">
                  {t('message.deleted')}
                </p>
              ) : (
                <p className="text-[13px] text-zinc-900/80 leading-relaxed whitespace-pre-wrap line-clamp-4">
                  {localizeSystemText(msg.text, msg.user)}
                </p>
              )}
              {msg.isDeleted !== 1 && msg.imageUrl && (
                <SidebarImagePreview imageUrl={msg.imageUrl} />
              )}
            </div>
          ))
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1 mt-4 mb-2">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="p-1 rounded-md hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent"
              title={t('pagination.first')}
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 1}
              className="p-1 rounded-md hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent"
              title={t('pagination.prev')}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-medium text-black/50 px-2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page === totalPages}
              className="p-1 rounded-md hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent"
              title={t('pagination.next')}
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="p-1 rounded-md hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent"
              title={t('pagination.last')}
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
