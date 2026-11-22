import { useState, useEffect, useRef, useSyncExternalStore, lazy, Suspense } from 'react';
import { SmilePlus, Reply, Trash2, Pencil, Bookmark, Pin, MoreHorizontal, Link as LinkIcon, Check, Plus } from 'lucide-react';
import { getTwemojiUrl } from '../../utils/emojiMap';
const loadEmojiPicker = () => import('./EmojiPicker');
const EmojiPicker = lazy(loadEmojiPicker);
const warmEmojiPicker = () => {
  loadEmojiPicker().then(m => m.preloadEmojiAssets?.()).catch(() => {});
};
import { EMOJI_REV, getQuickEmojis, subscribeQuickEmojis, updateRecentEmojis } from '../../utils/quickEmojis';

import usePresence from '../../hooks/usePresence';
import { t } from '../../i18n';

let globalTooltipWarmTimer = null;
let isGlobalTooltipWarm = false;

function setGlobalTooltipWarm() {
  isGlobalTooltipWarm = true;
  if (globalTooltipWarmTimer) clearTimeout(globalTooltipWarmTimer);
  globalTooltipWarmTimer = setTimeout(() => {
    isGlobalTooltipWarm = false;
  }, 500);
}

const Tooltip = ({ children, text, emojiTitle }) => {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  const handleMouseEnter = () => {
    if (isGlobalTooltipWarm) {
      setVisible(true);
      setGlobalTooltipWarm();
    } else {
      timerRef.current = setTimeout(() => {
        setVisible(true);
        setGlobalTooltipWarm();
      }, 400);
    }
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    setGlobalTooltipWarm();
  };

  return (
    <div
      className="relative flex items-center justify-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      <div
        className={`absolute bottom-full mb-2 pointer-events-none flex flex-col items-center transition-opacity duration-100 z-[9999] ${
          visible ? 'opacity-100 visible' : 'opacity-0 invisible'
        }`}
      >
        <div className="bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-[12px] font-bold px-3 py-2 rounded-lg shadow-xl whitespace-nowrap flex flex-col items-center gap-1 border border-zinc-200 dark:border-white/10">
          {emojiTitle && <span className="text-[13px]">{emojiTitle}</span>}
          <span>{text}</span>
        </div>
        <div className="w-2.5 h-2.5 bg-white dark:bg-zinc-800 border-b border-r border-zinc-200 dark:border-white/10 rotate-45 -mt-1.5 z-10 rounded-sm"></div>
      </div>
    </div>
  );
};

export default function ChatControls({ messageId, channelId, onReact, onReply, onDelete, onEdit, isOwn, canDelete = isOwn, onOpenChange, onBookmark, isBookmarked, isPinned, onTogglePin, isVoiceMessage, onAddToSoundboard }) {
  const quickEmojis = useSyncExternalStore(subscribeQuickEmojis, getQuickEmojis);
  const [showPicker, setShowPicker] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [pickerDirection, setPickerDirection] = useState('up');
  const [copiedLink, setCopiedLink] = useState(false);
  const containerRef = useRef(null);

  const pickerPresence = usePresence(showPicker, 140);
  const moreMenuPresence = usePresence(showMoreMenu, 100);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowPicker(false);
        setShowMoreMenu(false);
        if (onOpenChange) onOpenChange(false);
      }
    };

    if (showPicker || showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPicker, showMoreMenu, onOpenChange]);

  const togglePicker = () => {
    const nextState = !showPicker;
    if (nextState) setShowMoreMenu(false);
    if (nextState && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceAbove = rect.top;
      setPickerDirection(spaceAbove >= 420 ? 'up' : 'down');
    }
    setShowPicker(nextState);
    if (onOpenChange) onOpenChange(nextState);
  };

  const toggleMoreMenu = () => {
    const nextState = !showMoreMenu;
    if (nextState) setShowPicker(false);
    if (nextState && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceAbove = rect.top;
      setPickerDirection(spaceAbove >= 180 ? 'up' : 'down');
    }
    setShowMoreMenu(nextState);
    if (onOpenChange) onOpenChange(nextState);
  };

  const handleEmojiSelect = (emoji) => {
    updateRecentEmojis(emoji);

    setShowPicker(false);
    if (onOpenChange) onOpenChange(false);

    if (onReact) {
      onReact(emoji);
    }
  };

  const handleCopyLink = () => {
    if (messageId) {
      const textToCopy = channelId ? `<${messageId}_${channelId}>` : `<${messageId}>`;
      navigator.clipboard.writeText(textToCopy);
      setCopiedLink(true);
      setTimeout(() => {
        setCopiedLink(false);
        setShowMoreMenu(false);
        if (onOpenChange) onOpenChange(false);
      }, 1000);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative"
    >
      {pickerPresence.mounted && (
        <div
          style={{ zIndex: 999 }}
          className={`absolute right-0 ${
            pickerPresence.state === 'exit' ? 'hc-scale-out pointer-events-none' : 'hc-scale-in'
          } ${
            pickerDirection === 'down'
               ? 'top-full mt-2 origin-top-right'
               : 'bottom-full mb-2 origin-bottom-right'
          }`}
        >
          <Suspense fallback={null}>
            <EmojiPicker onSelect={handleEmojiSelect} />
          </Suspense>
        </div>
      )}

      {moreMenuPresence.mounted && (
        <div
          style={{ zIndex: 999 }}
          className={`absolute right-0 w-40 bg-white border border-zinc-200 shadow-xl rounded-lg overflow-hidden chat-message-controls ${
            moreMenuPresence.state === 'exit' ? 'hc-fade-out' : 'hc-scale-in'
          } ${
            pickerDirection === 'down'
               ? 'top-full mt-2 origin-top-right'
               : 'bottom-full mb-2 origin-bottom-right'
          }`}
        >
          <div className="flex flex-col p-1 gap-1">
            <button onClick={() => { onBookmark(); setShowMoreMenu(false); if (onOpenChange) onOpenChange(false); }} className={`flex items-center gap-2 px-2 py-2 text-[12px] font-bold rounded-md hover:bg-zinc-950/5 transition-colors ${isBookmarked ? 'text-zinc-900' : 'text-zinc-900/70 hover:text-zinc-900'}`}>
              <Bookmark size={14} fill={isBookmarked ? "currentColor" : "none"} />
              {isBookmarked ? t('controls.removeBookmark') : t('bookmarks.title')}
            </button>
            {onTogglePin && (
              <button onClick={() => { onTogglePin(!isPinned); setShowMoreMenu(false); if (onOpenChange) onOpenChange(false); }} className={`flex items-center gap-2 px-2 py-2 text-[12px] font-bold rounded-md hover:bg-zinc-950/5 transition-colors ${isPinned ? 'text-zinc-900' : 'text-zinc-900/70 hover:text-zinc-900'}`}>
                <Pin size={14} className={isPinned ? "fill-zinc-900" : ""} />
                {isPinned ? t('common.unpin') : t('common.pin')}
              </button>
            )}
            <button onClick={handleCopyLink} className={`flex items-center gap-2 px-2 py-2 text-[12px] font-bold rounded-md hover:bg-zinc-950/5 transition-colors ${copiedLink ? 'text-emerald-500' : 'text-zinc-900/70 hover:text-zinc-900'}`}>
              {copiedLink ? <Check size={14} /> : <LinkIcon size={14} />}
              {copiedLink ? t('controls.copied') : t('controls.copyLink')}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 bg-white/95 backdrop-blur-xl border border-zinc-200 rounded-xl shadow-sm px-1 py-1 h-8 chat-message-controls">
        <div className="flex items-center px-1 border-r border-zinc-950/10 mr-1 gap-1">
          {quickEmojis.map((emoji, i) => (
            <Tooltip key={i} emojiTitle={`:${EMOJI_REV.get(emoji) || emoji}:`} text={t('controls.clickToReact')}>
              <button
                className="w-7 h-7 flex items-center justify-center rounded transition-all active:scale-90 hover:scale-110 p-1 opacity-70 hover:opacity-100"
                onClick={() => handleEmojiSelect(emoji)}
              >
                <img
                  src={getTwemojiUrl(emoji)}
                  alt=""
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              </button>
            </Tooltip>
          ))}
        </div>

        <div className="flex items-center gap-1 pr-1">
          <Tooltip text={t('controls.addReaction')}>
            <button
              onClick={togglePicker}
              onPointerEnter={warmEmojiPicker}
              className={`p-1 rounded transition-all active:scale-90 hover:scale-110 reaction-add-trigger ${showPicker ? 'text-zinc-900' : 'text-zinc-900/40 hover:text-zinc-900'}`}
            >
              <SmilePlus size={16} />
            </button>
          </Tooltip>
          <Tooltip text={t('controls.reply')}>
            <button onClick={onReply} className="p-1 rounded transition-all text-zinc-900/40 hover:text-zinc-900 active:scale-90 hover:scale-110">
              <Reply size={16} />
            </button>
          </Tooltip>
          {isOwn && onEdit && (
            <Tooltip text={t('controls.edit')}>
              <button onClick={onEdit} className="p-1 rounded transition-all text-zinc-900/40 hover:text-zinc-900 active:scale-90 hover:scale-110">
                <Pencil size={16} />
              </button>
            </Tooltip>
          )}
          {canDelete && (
            <Tooltip text={t('common.delete')}>
              <button onClick={onDelete} className="p-1 rounded transition-all text-red-500/50 hover:text-red-500 active:scale-90 hover:scale-110">
                <Trash2 size={16} />
              </button>
            </Tooltip>
          )}
          {isVoiceMessage && onAddToSoundboard && (
            <Tooltip text={t('controls.addToSoundboard')}>
              <button onClick={onAddToSoundboard} className="p-1 rounded transition-all text-emerald-500/70 hover:text-emerald-500 active:scale-90 hover:scale-110">
                <Plus size={16} strokeWidth={3} />
              </button>
            </Tooltip>
          )}
        </div>
        
        <div className="w-px h-4 bg-zinc-950/10 mx-1"></div>
        
        <Tooltip text={t('common.other')}>
          <button
            onClick={toggleMoreMenu}
            className={`p-1 rounded transition-all active:scale-90 hover:scale-110 ${showMoreMenu ? 'text-zinc-900' : 'text-zinc-900/40 hover:text-zinc-900'}`}
          >
            <MoreHorizontal size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
