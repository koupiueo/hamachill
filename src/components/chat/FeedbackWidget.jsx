import React, { useState } from 'react';
import { Inbox, Send, User, ThumbsUp, ThumbsDown, Quote } from 'lucide-react';
import { t, formatDate } from '../../i18n';

const FeedbackWidget = ({ feedbackData, onSubmitFeedback, onFeedbackReact, currentAccountId, membersCache, messageId }) => {
  const [inputText, setInputText] = useState('');
  const [now, setNow] = useState(Date.now());
  const [sortOrder, setSortOrder] = useState('newest');

  React.useEffect(() => {
    if (!feedbackData || !feedbackData.endTime) return;
    if (Date.now() >= feedbackData.endTime) {
      setNow(feedbackData.endTime);
      return;
    }
    const interval = setInterval(() => {
      const currentNow = Date.now();
      setNow(currentNow);
      if (currentNow >= feedbackData.endTime) {
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [feedbackData]);

  if (!feedbackData) return null;

  const responses = feedbackData.responses || [];
  const isExpired = feedbackData.endTime ? now >= feedbackData.endTime : false;

  let timeStr = '';
  if (feedbackData.endTime) {
    if (isExpired) {
      timeStr = t('feedback.closed');
    } else {
      const diff = feedbackData.endTime - now;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      if (hours >= 24) {
        timeStr = t('time.leftDays', { days: Math.floor(hours / 24) });
      } else if (hours > 0) {
        timeStr = t('time.leftHours', { hours });
      } else {
        timeStr = t('time.leftMinutes', { minutes });
      }
    }
  }

  const sortedResponses = [...responses].sort((a, b) => {
    if (sortOrder === 'newest') return b.timestamp - a.timestamp;
    if (sortOrder === 'oldest') return a.timestamp - b.timestamp;
    if (sortOrder === 'most_upvotes') {
      const diff = (b.upvotes?.length || 0) - (a.upvotes?.length || 0);
      return diff !== 0 ? diff : b.timestamp - a.timestamp;
    }
    if (sortOrder === 'most_downvotes') {
      const diff = (b.downvotes?.length || 0) - (a.downvotes?.length || 0);
      return diff !== 0 ? diff : b.timestamp - a.timestamp;
    }
    return 0;
  });

  return (
    <div className="mt-2 mb-3 bg-white border border-zinc-200 rounded-2xl p-4 max-w-[450px] shadow-sm">
      <div className="flex items-center justify-between mb-3 border-b border-zinc-100 pb-2">
        <div className="flex items-center gap-2 text-zinc-400">
          <Inbox size={16} className="text-[#080a11]" />
          <span className="text-[12px] font-bold tracking-widest uppercase">{t('feedback.title')} {feedbackData.anonymous ? t('common.anonymousParen') : ''}</span>
        </div>
        {timeStr && (
          <span className="text-[11px] font-bold text-zinc-400 bg-zinc-200/50 px-2 py-1 rounded-md">
            {timeStr}
          </span>
        )}
      </div>
      <h3 className="text-[15px] font-bold text-zinc-800 mb-2 whitespace-pre-wrap">{feedbackData.title}</h3>
      
      {responses.length > 0 && (
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[11px] font-bold text-zinc-400">{t('feedback.responseCount', { count: responses.length })}</span>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="text-[11px] font-bold text-zinc-500 bg-zinc-50 rounded border border-zinc-200 px-1 py-1 outline-none cursor-pointer hover:bg-zinc-100 transition-colors"
          >
            <option value="newest">{t('common.newest')}</option>
            <option value="oldest">{t('common.oldest')}</option>
            <option value="most_upvotes">{t('feedback.mostLiked')}</option>
            <option value="most_downvotes">{t('feedback.mostDisliked')}</option>
          </select>
        </div>
      )}

      <div className="space-y-3 mb-4 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
        {responses.length === 0 ? (
          <div className="text-[12px] text-zinc-400 text-center py-4 bg-zinc-50 rounded-xl border border-zinc-100 border-dashed">{t('feedback.empty')}</div>
        ) : (
          sortedResponses.map((res) => {
            const m = feedbackData.anonymous ? null : (membersCache[res.user] || window.__ALL_MEMBERS__?.find(member => member.accountId === res.user));
            const disp = feedbackData.anonymous ? t('feedback.anonymousUser') : (m?.displayName || m?.firstName || m?.name || res.user);
            const av = feedbackData.anonymous ? null : m?.avatarUrl;

            return (
              <div key={res.id} className="bg-zinc-50 rounded-xl p-3 border border-zinc-100 relative group">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded-full bg-zinc-200 flex items-center justify-center overflow-hidden shrink-0">
                    {av ? <img src={av} alt={disp} className="w-full h-full object-cover" /> : <User size={12} className="text-zinc-500" />}
                  </div>
                  <span className="text-[12px] font-bold text-zinc-700">{disp}</span>
                  <span className="text-[10px] text-zinc-400 ml-auto">{formatDate(res.timestamp, { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="text-[13px] text-zinc-600 leading-relaxed whitespace-pre-wrap pl-7">{res.text}</div>
                <div className="flex items-center gap-1 mt-2 pl-7">
                  <button
                    onClick={() => {
                      if (!onFeedbackReact) return;
                      const hasVoted = res.upvotes?.includes(currentAccountId);
                      onFeedbackReact(res.id, hasVoted ? 'none' : 'up');
                    }}
                    className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors ${res.upvotes?.includes(currentAccountId) ? 'bg-[#080a11]/10 border-[#080a11]/30 text-[#080a11]' : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'}`}
                  >
                    <ThumbsUp size={12} className={res.upvotes?.includes(currentAccountId) ? 'fill-[#080a11]' : ''} />
                    <span className="text-[11px] font-bold">{res.upvotes?.length || 0}</span>
                  </button>
                  <button
                    onClick={() => {
                      if (!onFeedbackReact) return;
                      const hasVoted = res.downvotes?.includes(currentAccountId);
                      onFeedbackReact(res.id, hasVoted ? 'none' : 'down');
                    }}
                    className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors ${res.downvotes?.includes(currentAccountId) ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'}`}
                  >
                    <ThumbsDown size={12} className={res.downvotes?.includes(currentAccountId) ? 'fill-red-500' : ''} />
                    <span className="text-[11px] font-bold">{res.downvotes?.length || 0}</span>
                  </button>
                  <button
                    onClick={() => {
                      const safeTitle = feedbackData.title.split('\n')[0].slice(0, 15).replace(/\]/g, '') + (feedbackData.title.length > 15 ? '...' : '');
                      const quoteText = `> [feedback:${messageId}|${res.id}|${res.upvotes?.length || 0}|${res.downvotes?.length || 0}|${feedbackData.anonymous ? '1' : '0'}|${res.user}|${safeTitle}] ${res.text.split('\n').join('\n> ')}\n`;
                      window.dispatchEvent(new CustomEvent('insert_quote', { detail: quoteText }));
                    }}
                    className="flex items-center gap-1 px-2 py-1 ml-auto rounded border bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 transition-colors opacity-0 group-hover:opacity-100"
                    title={t('feedback.quoteReply')}
                  >
                    <Quote size={12} />
                    <span className="text-[11px] font-bold">{t('feedback.quote')}</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {!isExpired ? (
        <div className="flex items-end gap-2 mt-2 pt-3 border-t border-zinc-100">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && inputText.trim()) {
              e.preventDefault();
              onSubmitFeedback && onSubmitFeedback(inputText.trim());
              setInputText('');
            }
          }}
          placeholder={t('feedback.writePlaceholder')}
          className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-[13px] text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-[#080a11] focus:ring-2 focus:ring-[#080a11]/20 transition-all resize-none min-h-[40px] max-h-[120px]"
          rows={1}
        />
        <button
          onClick={() => {
            if (inputText.trim()) {
              onSubmitFeedback && onSubmitFeedback(inputText.trim());
              setInputText('');
            }
          }}
          disabled={!inputText.trim()}
          className="p-2 text-white bg-[#080a11] hover:bg-[#151c2c] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shrink-0 shadow-sm shadow-[#080a11]/20"
        >
          <Send size={16} />
        </button>
      </div>
      ) : (
        <div className="mt-2 pt-3 border-t border-zinc-100 text-center text-[12px] font-bold text-zinc-400">
          {t('feedback.closedNotice')}
        </div>
      )}
    </div>
  );
};

export default FeedbackWidget;
