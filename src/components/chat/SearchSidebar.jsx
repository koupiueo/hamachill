import { useState, useEffect } from 'react';
import { Search, X, Calendar, User, Loader2, Filter, Paperclip, Pin, AtSign, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { parseMessage } from '../../utils/parseMessage';
import { SidebarImagePreview } from './SpoilerMosaic';
import { t, formatDate, serverError } from '../../i18n';

const DAY_MS = 24 * 60 * 60 * 1000;
// 'YYYY-MM-DD' → その日の 0 時（JST）の epoch ms。端末やサーバーのタイムゾーンに依存しない
const jstDayStart = (dateStr) => {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dateStr || '');
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) - 9 * 60 * 60 * 1000;
};

// 検索結果の本文を表示用テキストにする（__POLL__ や <user_x> を生で出さない）
const previewText = (msg, nameOf) => {
  const parsed = parseMessage(msg.id, msg.updatedAt, msg.text || '', msg.user);
  const sp = parsed.special || {};
  const head = [];
  if (sp.isPoll && sp.pollData) head.push(t('search.pollPreview', { question: String(sp.pollData.question || '') }));
  if (sp.isFeedback && sp.feedbackData) head.push(t('search.feedbackPreview', { title: String(sp.feedbackData.title || '') }));
  const body = (parsed.tokens || []).map((tok) => {
    switch (tok.type) {
      case 'text': return tok.content;
      case 'markdown': return (tok.subTokens || []).map(st => st.content ?? st.text ?? '').join('');
      case 'user_mention': return `@${tok.userId === 'everyone' ? 'everyone' : nameOf(tok.userId)}`;
      case 'channel_mention': return `#${tok.name}`;
      case 'msg_link': return t('search.messageLink');
      case 'pin_list': return tok.text || '';
      default: return tok.value || '';
    }
  }).join('');
  return [...head, body].filter(Boolean).join('\n');
};

export default function SearchSidebar({ channelId, socket, onClose, onJumpToMessage, membersCache, onlineAccountIds, isClosing = false }) {
  const [query, setQuery] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [limit, setLimit] = useState(25);
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);

  const [hasMedia, setHasMedia] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' 最新順 / 'asc' 古い順

  const handleSearch = (targetPage = 1) => {
    if (!socket) return;
    setIsLoading(true);
    setError(null);
    setPage(targetPage);

    let finalQuery = query;
    if (hasMedia) finalQuery += ` has:${hasMedia}`;
    if (pinnedOnly) finalQuery += ` pinned:true`;

    // メンションは <accountId> で保存されているので、表示名なら accountId に変換して送る
    let mention = mentionFilter.trim().replace(/^[@＠]/, '');
    if (mention) {
      const list = window.__ALL_MEMBERS__ || Object.values(membersCache?.current || {});
      const hit = list.find(m => m && (m.accountId === mention || m.displayName === mention || m.firstName === mention));
      if (hit?.accountId) mention = hit.accountId;
    }

    // 日付は JST 基準の epoch ms。〜まで は「翌日 0 時より前」
    const fromMs = jstDayStart(dateFrom);
    const toStart = jstDayStart(dateTo);

    const currentOffset = (targetPage - 1) * limit;

    socket.timeout(10000).emit('search_messages', {
      channelId,
      query: finalQuery.trim(),
      user: userFilter || null,
      mention: mention || null,
      dateFrom: fromMs ?? undefined,
      dateTo: toStart !== null ? toStart + DAY_MS : undefined,
      limit,
      offset: currentOffset,
      sortOrder
    }, (err, res) => {
      setIsLoading(false);
      if (err) { setError(t('search.timeout')); return; }
      if (res && res.success) {
        setResults(Array.isArray(res.messages) ? res.messages : []);
        setTotalCount(res.totalCount || 0);
      } else {
        setError(serverError(res?.error, 'search.failed'));
      }
    });
  };

  const totalPages = Math.ceil(totalCount / limit) || 1;

  return (
    <div className={`sidebar-content w-[85vw] md:w-[400px] max-h-[80vh] border border-zinc-950/10 bg-white shadow-2xl rounded-xl flex flex-col absolute right-4 top-2 z-50 ${isClosing ? 'sidebar-slide-out' : 'sidebar-slide-in'}`}>
      <div className="h-12 flex items-center justify-between px-4 border-b">
        <h3 className="font-bold text-sm">{t('common.search')}</h3>
        <button onClick={onClose} className="p-1 hover:bg-black/5 rounded-md"><X size={16} /></button>
      </div>

      <div className="p-4 border-b flex flex-col gap-3 text-sm">
        <div className="flex items-center bg-black/5 rounded-md px-3 py-2 focus-within:ring-2 ring-zinc-400/30 transition-all">
          <Search size={14} className="text-black/40 mr-2 shrink-0" />
          <input
            type="text"
            placeholder={t('search.placeholder')}
            className="bg-transparent outline-none w-full placeholder:text-black/30"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <div className="flex items-center bg-black/5 rounded-md px-3 py-2 focus-within:ring-2 ring-zinc-400/30 transition-all">
          <User size={14} className="text-black/40 mr-2 shrink-0" />
          <input
            type="text"
            placeholder={t('search.fromPlaceholder')}
            className="bg-transparent outline-none w-full placeholder:text-black/30"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch(1)}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-black/50 px-1">
          <button 
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 hover:text-zinc-900 transition-colors"
          >
            <Filter size={14} />
            {showAdvanced ? t('search.closeAdvanced') : t('search.openAdvanced')}
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <span>{t('search.order')}</span>
              <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="bg-black/5 rounded border-none outline-none py-1">
                <option value="desc">{t('common.newest')}</option>
                <option value="asc">{t('common.oldest')}</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <span>{t('search.perPage')}</span>
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="bg-black/5 rounded border-none outline-none py-1">
                <option value={10}>{t('search.n10')}</option>
                <option value={25}>{t('search.n25')}</option>
                <option value={50}>{t('search.n50')}</option>
                <option value={100}>{t('search.n100')}</option>
              </select>
            </div>
          </div>
        </div>

        {showAdvanced && (
          <div className="flex flex-col gap-2 p-3 bg-black/5 rounded-md border border-black/5 text-xs animate-in fade-in slide-in-from-top-2 duration-200">
            {/* メンション */}
            <div className="flex items-center gap-2">
              <AtSign size={14} className="text-black/40 shrink-0" />
              <input
                type="text"
                placeholder={t('search.mentionsPlaceholder')}
                className="bg-white px-2 py-2 rounded border border-black/10 outline-none flex-1 placeholder:text-black/30"
                value={mentionFilter}
                onChange={(e) => setMentionFilter(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch(1)}
              />
            </div>

            {/* メディア */}
            <div className="flex items-center gap-2">
              <Paperclip size={14} className="text-black/40 shrink-0" />
              <select
                value={hasMedia}
                onChange={(e) => setHasMedia(e.target.value)}
                className="bg-white px-2 py-2 rounded border border-black/10 outline-none flex-1 text-black/70"
              >
                <option value="">{t('search.anyMedia')}</option>
                <option value="image">{t('search.imagesOnly')}</option>
                <option value="video">{t('search.videosOnly')}</option>
                <option value="audio">{t('search.audioOnly')}</option>
                <option value="file">{t('search.filesOnly')}</option>
                <option value="link">{t('search.linksOnly')}</option>
              </select>
            </div>

            {/* 日付 */}
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-black/40 shrink-0" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-white px-2 py-2 rounded border border-black/10 outline-none flex-1 w-0 text-black/70"
              />
              <span className="text-black/40">〜</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-white px-2 py-2 rounded border border-black/10 outline-none flex-1 w-0 text-black/70"
              />
            </div>

            {/* ピン留め */}
            <label className="flex items-center gap-2 cursor-pointer mt-1 px-1">
              <Pin size={14} className="text-black/40 shrink-0" />
              <input
                type="checkbox"
                checked={pinnedOnly}
                onChange={(e) => setPinnedOnly(e.target.checked)}
                className="rounded border-black/20 text-zinc-800 focus:ring-zinc-800 w-3.5 h-3.5"
              />
              <span className="text-black/70 font-medium">{t('search.pinnedOnly')}</span>
            </label>
          </div>
        )}
        <button
          onClick={() => handleSearch(1)}
          disabled={isLoading}
          className="w-full bg-zinc-800 hover:bg-zinc-900 text-white rounded-md py-2 text-xs font-bold transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {t('search.submit')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {error && <div className="text-red-500 text-xs p-2 text-center bg-red-50 rounded-md">{error}</div>}
        {!isLoading && results.length === 0 && !error && (
          <div className="text-black/30 text-xs text-center p-4">{t('search.resultsHere')}</div>
        )}
        <div className="flex flex-col gap-2">
          {results.map((msg) => {
            const nameOf = (id) => {
              const mem = membersCache?.current?.[id] || window.__ALL_MEMBERS__?.find(m => m.accountId === id);
              return mem?.displayName || mem?.firstName || id;
            };
            const member = membersCache?.current?.[msg.user] || window.__ALL_MEMBERS__?.find(m => m.accountId === msg.user);
            const displayName = member?.displayName || member?.firstName || msg.user;
            const avatarUrl = member?.avatarUrl;

            return (
              <div
                key={msg.id}
                onClick={() => onJumpToMessage(msg.id, msg.channelId)}
                className="group p-3 bg-white border border-zinc-950/5 hover:border-zinc-400/50 hover:shadow-md transition-all rounded-xl cursor-pointer flex flex-col gap-2"
              >
                <div className="flex items-center gap-2 pr-6">
                  <div className="relative shrink-0">
                    <div className="w-6 h-6 rounded-full bg-zinc-950/10 overflow-hidden border border-zinc-950/5">
                      {avatarUrl ? (
                        <img src={avatarUrl} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-black text-zinc-900/30 text-[10px]">
                          {displayName[0]}
                        </div>
                      )}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--theme-secondary)] ${onlineAccountIds?.includes(msg.user) ? 'bg-green-500' : 'bg-[#80848e]'}`} />
                  </div>
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="font-bold text-[13px] truncate">{displayName}</span>
                    <span className="text-[10px] text-zinc-900/40 shrink-0">
                      {formatDate(msg.timestamp, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <p className="text-[13px] text-zinc-900/80 leading-relaxed whitespace-pre-wrap line-clamp-4">
                  {previewText(msg, nameOf) || (msg.fileName ? `📎 ${msg.fileName}` : t('search.media'))}
                </p>
                {msg.imageUrl && (
                  <SidebarImagePreview imageUrl={msg.imageUrl} />
                )}
              </div>
            );
          })}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1 mt-4 mb-2">
            <button
              onClick={() => handleSearch(1)}
              disabled={page === 1 || isLoading}
              className="p-1 rounded-md hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent"
              title={t('pagination.first')}
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              onClick={() => handleSearch(page - 1)}
              disabled={page === 1 || isLoading}
              className="p-1 rounded-md hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent"
              title={t('pagination.prev')}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-medium text-black/50 px-2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => handleSearch(page + 1)}
              disabled={page === totalPages || isLoading}
              className="p-1 rounded-md hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent"
              title={t('pagination.next')}
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => handleSearch(totalPages)}
              disabled={page === totalPages || isLoading}
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
