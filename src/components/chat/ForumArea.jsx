import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Plus, MessageSquare, ChevronLeft, Search, ArrowDownUp, ChevronDown, User } from 'lucide-react';
import ThreadIcon from '../ui/ThreadIcon';
import ChatArea from './ChatArea';
import { getNameStyle } from '../../utils/nameStyle';
import { globalMessageCache, sendMessage, preloadRoomsOnce, fetchForumThreads } from '../../utils/messageCache';
import { api } from '../../utils/api';
import { t, formatRelative } from '../../i18n';
import { localizeSystemText } from '../../utils/systemMessages';

export default function ForumArea({ channel, socket, currentUserState, onlineAccountIds, onOpenMenu, unreadCounts = {} }) {
  const navigate = useNavigate();
  const [threads, setThreads] = useState([]);
  const [members, setMembers] = useState(window.__ALL_MEMBERS__ || []);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState('recent'); // 'recent' or 'creation'
  const [viewType, setViewType] = useState('list'); // 'list' or 'grid'
  const [showSortMenu, setShowSortMenu] = useState(false);

  // メンバー一覧を読み込み
  useEffect(() => {
    api.members().then(({ members: list }) => {
      if (list) {
        setMembers(list);
        window.__ALL_MEMBERS__ = list;
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onProfileUpdated = () => {
      api.members().then(({ members: list }) => {
        if (list) {
          setMembers(list);
          window.__ALL_MEMBERS__ = list;
        }
      }).catch(() => {});
    };
    socket.on('profile_updated', onProfileUpdated);
    return () => socket.off('profile_updated', onProfileUpdated);
  }, [socket]);

  const findMemberByAccountOrAuthor = (creatorAccountId, author) => {
    const list = members.length > 0 ? members : (window.__ALL_MEMBERS__ || []);
    // 1. creatorAccountId で照合
    if (creatorAccountId) {
      if (currentUserState?.accountId === creatorAccountId) return currentUserState;
      const found = list.find(m => m.accountId === creatorAccountId);
      if (found) return found;
    }
    // 2. author.accountId で照合
    if (author?.accountId) {
      if (currentUserState?.accountId === author.accountId) return currentUserState;
      const found = list.find(m => m.accountId === author.accountId);
      if (found) return found;
    }
    // 3. author.name / displayName / firstName で照合
    if (author?.name) {
      if (currentUserState?.name === author.name || currentUserState?.displayName === author.name || currentUserState?.accountId === author.name) {
        return currentUserState;
      }
      const found = list.find(m => m.displayName === author.name || m.firstName === author.name || m.name === author.name || m.accountId === author.name);
      if (found) return found;
    }
    return null;
  };

  const updateThreadsFromCache = () => {
    const msgs = globalMessageCache['forum_metadata'] || [];
    const missing = [];
    const parsedThreads = msgs.map(m => {
      try {
        const t = JSON.parse(m.text);
        if (t && t.id && t.title) {
          // まだ履歴が無いスレッドだけ、1 セッション 1 回だけ読み込む
          if (!globalMessageCache[`thread_${t.id}`]) missing.push(`thread_${t.id}`);
          return {
            ...t,
            creatorAccountId: m.user || t.author?.accountId,
          };
        }
      } catch (e) {
        return null;
      }
      return null;
    }).filter(Boolean);
    if (missing.length && socket) preloadRoomsOnce(socket, missing);
    
    setThreads(parsedThreads.reverse());
    setIsLoading(false);
  };

  useEffect(() => {
    if (!socket) return;
    
    // 一覧は 30 件制限のある履歴ではなく、専用イベントで全件取る
    if (globalMessageCache['forum_metadata']) updateThreadsFromCache();
    fetchForumThreads(socket);
    
    const onCacheUpdate = (e) => {
      if (e.detail?.all || e.detail?.channelId === 'forum_metadata' || e.detail?.channelId?.startsWith('thread_')) {
        updateThreadsFromCache();
      }
    };
    
    window.addEventListener('cache_updated', onCacheUpdate);
    return () => window.removeEventListener('cache_updated', onCacheUpdate);
  }, [socket]);

  const handleCreate = (e) => {
    e.preventDefault();
    const titleToUse = newTitle.trim();
    if (!titleToUse) return;
    
    const messageId = Date.now().toString();
    const t = {
      id: messageId,
      title: titleToUse,
      author: {
        name: currentUserState.name,
        accountId: currentUserState.accountId,
        avatarUrl: currentUserState.avatarUrl,
        profileColor1: currentUserState.profileColor1,
        profileColor2: currentUserState.profileColor2
      },
      createdAt: new Date().toISOString()
    };
    
    const newMessage = {
      id: messageId,
      user: currentUserState.accountId,
      timestamp: Date.now(),
      text: JSON.stringify(t),
      channelId: 'forum_metadata',
    };
    
    sendMessage(socket, { ...newMessage, clientTempId: messageId });
    
    setIsCreating(false);
    setSearchQuery('');
    setNewTitle('');
    navigate(`/c/thread_${t.id}`);
  };

  // Filter and sort threads
  const processedThreads = [...threads].filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase())).sort((a, b) => {
    if (sortBy === 'recent') {
      const aMsgs = globalMessageCache[`thread_${a.id}`] || [];
      const bMsgs = globalMessageCache[`thread_${b.id}`] || [];
      const aTime = aMsgs.length > 0 ? aMsgs[aMsgs.length - 1].timestamp : new Date(a.createdAt).getTime();
      const bTime = bMsgs.length > 0 ? bMsgs[bMsgs.length - 1].timestamp : new Date(b.createdAt).getTime();
      return bTime - aTime;
    } else {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  const isThreadOpen = channel.id.startsWith('thread_');

  return (
    <div className="flex flex-1 h-full bg-[var(--bg-chat)] relative z-0 flex-row">
      <div className={`flex flex-col h-full bg-[var(--bg-chat)] ${isThreadOpen ? 'hidden lg:flex w-[360px] xl:w-[420px] shrink-0 border-r border-zinc-200 dark:border-zinc-800' : 'flex-1'}`}>
        <div className="h-12 shrink-0 border-b flex items-center px-4 justify-between select-none" style={{ borderColor: 'var(--border-channel, #e3e5e8)' }}>
          <div className="flex items-center min-w-0">
            <button onClick={onOpenMenu} className="md:hidden mr-3 p-1 -ml-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-md">
              <Menu size={20} />
            </button>
            <ThreadIcon size={18} className="text-zinc-400 mr-2 shrink-0" />
            <h2 className="font-extrabold text-[15px] truncate text-zinc-900 dark:text-zinc-100">{t('channels.threads')}</h2>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-[var(--bg-chat)]">
          <div className={`w-full mx-auto p-4 ${!isThreadOpen ? 'max-w-[1000px] md:px-6 py-6' : ''}`}>
            
            {/* Controls Bar */}
            <div className={`flex items-center gap-2 mb-4 ${isThreadOpen ? 'flex-col items-stretch' : ''}`}>
              <div className="relative flex-1 flex items-center bg-zinc-100/50 dark:bg-[#111214] border border-zinc-200 dark:border-transparent rounded-lg p-1 group focus-within:ring-1 focus-within:ring-zinc-900/20 dark:focus-within:ring-white/20">
                <Search size={18} className="absolute left-3 text-zinc-400 dark:text-zinc-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder={t('forum.searchPlaceholder')}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent border-none pl-9 pr-4 py-2 text-[15px] font-medium text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 outline-none"
                />
              </div>
              <button 
                onClick={() => setIsCreating(true)}
                className={`flex items-center justify-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-lg text-[13px] font-bold transition-all shrink-0 shadow-sm active:scale-95 ${isThreadOpen ? 'w-full' : ''}`}
              >
                <ThreadIcon size={16} className="shrink-0" />
                {t('forum.newPost')}
              </button>
            </div>

          <div className="flex items-center justify-between mb-6">
            <div className="relative">
              <button 
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="flex items-center gap-2 px-3 py-2 bg-transparent hover:bg-zinc-200/50 dark:hover:bg-[#2b2d31]/50 border border-zinc-200 dark:border-zinc-700/80 rounded-md text-[13px] font-bold text-zinc-700 dark:text-zinc-300 transition-colors"
              >
                <ArrowDownUp size={14} />
                {t('forum.sortAndView')}
                <ChevronDown size={14} />
              </button>
              {showSortMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)}></div>
                  <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-[#2b2d31] border border-zinc-200 dark:border-zinc-700/50 rounded-lg shadow-xl py-2 z-20 text-[13px] font-bold">
                    <div className="px-3 py-1 text-[11px] text-zinc-500 uppercase">{t('forum.sort')}</div>
                    <button onClick={() => { setSortBy('recent'); setShowSortMenu(false); }} className={`w-full text-left px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${sortBy === 'recent' ? 'text-zinc-900 dark:text-zinc-100 font-bold' : 'text-zinc-700 dark:text-zinc-300'}`}>{t('forum.sortActivity')}</button>
                    <button onClick={() => { setSortBy('creation'); setShowSortMenu(false); }} className={`w-full text-left px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${sortBy === 'creation' ? 'text-zinc-900 dark:text-zinc-100 font-bold' : 'text-zinc-700 dark:text-zinc-300'}`}>{t('forum.sortCreated')}</button>
                    <div className="my-1 border-t border-zinc-200 dark:border-zinc-700/50" />
                    <div className="px-3 py-1 text-[11px] text-zinc-500 uppercase">{t('forum.view')}</div>
                    <button onClick={() => { setViewType('list'); setShowSortMenu(false); }} className={`w-full text-left px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${viewType === 'list' ? 'text-zinc-900 dark:text-zinc-100 font-bold' : 'text-zinc-700 dark:text-zinc-300'}`}>{t('forum.viewList')}</button>
                    <button onClick={() => { setViewType('grid'); setShowSortMenu(false); }} className={`w-full text-left px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${viewType === 'grid' ? 'text-zinc-900 dark:text-zinc-100 font-bold' : 'text-zinc-700 dark:text-zinc-300'}`}>{t('forum.viewGrid')}</button>
                  </div>
                </>
              )}
            </div>
            <div className="text-[13px] font-bold text-zinc-500 dark:text-zinc-400">
              {t('forum.threadCount', { count: processedThreads.length })}
            </div>
          </div>

          {/* Creation Modal / Inline Form */}
          {isCreating && (
            <div className="mb-6 p-4 bg-white dark:bg-[#1e1f22] border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-2">
              <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 mb-3">{t('forum.createThread')}</h3>
              <form onSubmit={handleCreate}>
                <input
                  type="text"
                  autoFocus
                  placeholder={t('forum.titlePlaceholder')}
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full px-4 py-2 bg-zinc-100 dark:bg-[#2b2d31] border border-transparent rounded-lg focus:ring-1 focus:ring-zinc-900/20 dark:focus:ring-white/20 outline-none text-[15px] font-medium mb-4 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setIsCreating(false)} className="px-4 py-2 text-xs font-bold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">{t('common.cancel')}</button>
                  <button type="submit" disabled={!newTitle.trim()} className="px-4 py-2 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:hover:bg-zinc-900 dark:disabled:hover:bg-white text-white dark:text-zinc-900 rounded-lg text-xs font-bold transition-colors shadow-sm">{t('forum.createButton')}</button>
                </div>
              </form>
            </div>
          )}

          {/* Threads List */}
          {isLoading ? (
            <div className="text-center text-sm font-bold text-zinc-400 py-10">{t('common.loading')}</div>
          ) : processedThreads.length === 0 ? (
            <div className="text-center py-20 flex flex-col items-center">
              <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800/50 rounded-full flex items-center justify-center mb-4 text-zinc-300 dark:text-zinc-600">
                <ThreadIcon size={28} />
              </div>
              <h3 className="text-zinc-900 dark:text-zinc-100 font-bold mb-1">{t('forum.noThreads')}</h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">{t('forum.noThreadsHint')}</p>
            </div>
          ) : (
            <div className={viewType === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : "flex flex-col gap-2"}>
              {processedThreads.map(th => {
                const threadMsgs = globalMessageCache[`thread_${th.id}`] || [];
                const latestMsg = threadMsgs.length > 0 ? threadMsgs[threadMsgs.length - 1] : null;
                
                let msgPreviewAuthor = th.author?.name || 'Unknown';
                let msgPreviewText = t('forum.threadCreated');
                let authorStyle = th.author ? getNameStyle(th.author) : {};

                if (latestMsg) {
                  const authorObj = findMemberByAccountOrAuthor(latestMsg.user, null);
                  msgPreviewAuthor = authorObj?.displayName || authorObj?.firstName || authorObj?.name || latestMsg.user;
                  if (authorObj) authorStyle = getNameStyle(authorObj);
                  msgPreviewText = latestMsg.text ? localizeSystemText(latestMsg.text, latestMsg.user) : (latestMsg.imageUrl ? t('forum.sentImage') : t('forum.sentMessage'));
                }

                const lastMsgTime = latestMsg ? latestMsg.timestamp : th.createdAt;
                let timeStr = '';
                if (lastMsgTime) {
                  const diffMs = new Date() - new Date(lastMsgTime);
                  const diffMin = Math.floor(diffMs / (1000 * 60));
                  const diffHour = Math.floor(diffMin / 60);
                  const diffDays = Math.floor(diffHour / 24);
                  
                  if (diffMin < 1) timeStr = t('time.justNow');
                  else if (diffMin < 60) timeStr = formatRelative(-diffMin, 'minute');
                  else if (diffHour < 24) timeStr = formatRelative(-diffHour, 'hour');
                  else timeStr = formatRelative(-diffDays, 'day');
                }

                const unread = unreadCounts[`thread_${th.id}`] || 0;

                return (
                  <div 
                    key={th.id} 
                    onClick={() => navigate(`/c/thread_${th.id}`)}
                    className={`bg-transparent hover:bg-zinc-50/50 dark:hover:bg-[#2b2d31]/30 border rounded-lg p-3 sm:p-4 cursor-pointer transition-colors group flex flex-col h-full relative ${channel.id === `thread_${th.id}` ? 'border-zinc-900 dark:border-white ring-1 ring-zinc-900/10 dark:ring-white/10 bg-zinc-50/80 dark:bg-[#2b2d31]/80' : 'border-zinc-200 dark:border-zinc-800/80'}`}
                  >
                    {unread > 0 && (
                      <div className="absolute top-0 right-0 -mt-2 -mr-2 bg-[#f97316] text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md z-10 animate-in zoom-in">
                        {unread > 99 ? '99+' : unread}
                      </div>
                    )}
                    <div className="flex items-center gap-3 mb-2 min-w-0">
                      {(() => {
                        const authorMember = findMemberByAccountOrAuthor(th.creatorAccountId, th.author);
                        const avatarUrl = authorMember?.avatarUrl || th.author?.avatarUrl;
                        const authorName = authorMember?.displayName || authorMember?.firstName || th.author?.name || 'Unknown';
                        return (
                          <div className="w-7 h-7 rounded-full shrink-0 overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/80 shadow-xs flex items-center justify-center">
                            {avatarUrl ? (
                              <img src={avatarUrl} alt={authorName} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-300">
                                <User size={14} />
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      <h3 className={`font-bold text-zinc-900 dark:text-zinc-100 leading-snug group-hover:opacity-75 transition-opacity flex-1 min-w-0 truncate ${viewType === 'grid' && !isThreadOpen ? 'text-[15px]' : 'text-[15px] sm:text-[16px]'} ${unread > 0 ? 'text-zinc-950 dark:text-white' : ''}`}>
                        {th.title}
                      </h3>
                    </div>
                    
                    <div className="flex items-center gap-2 mb-2 text-[12px] sm:text-[13px] flex-1">
                      <span className={`font-bold truncate max-w-[100px] sm:max-w-[150px] ${unread > 0 ? 'text-zinc-900 dark:text-white' : 'text-zinc-700 dark:text-zinc-300'}`} style={authorStyle}>
                        {msgPreviewAuthor}
                      </span>
                      <span className={`font-medium truncate ${unread > 0 ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        : {msgPreviewText}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between mt-auto pt-1">
                      <div className="flex items-center gap-2 text-[11px] sm:text-[12px] font-bold text-zinc-500 dark:text-zinc-400">
                        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                          <MessageSquare size={12} className="fill-zinc-400 dark:fill-zinc-500" />
                          <span>{threadMsgs.length}</span>
                        </div>
                        <span className="text-zinc-300 dark:text-zinc-600">・</span>
                        <span>{timeStr}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      </div>
      
      {isThreadOpen && (
        <div className="flex-1 flex flex-col min-w-0 h-full relative border-l border-zinc-200 dark:border-zinc-800">
          <ChatArea 
            channel={{ ...channel, type: 'text' }} 
            socket={socket} 
            currentUser={currentUserState.name} 
            currentUserState={currentUserState} 
            onlineAccountIds={onlineAccountIds} 
            allChannels={[]} 
          />
        </div>
      )}
    </div>
  );
}
