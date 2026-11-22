import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { navigateTo } from '../../utils/nav';
import ChatControls from './ChatControls';
import { getTwemojiUrl } from '../../utils/emojiMap';
import { getNameStyle } from '../../utils/nameStyle';
import { Plus, Loader2, CornerUpRight, Users, ChevronDown, BarChart3, Hash, MessageCircle, File as FileIcon, Download, Clock, ThumbsUp, ThumbsDown, Inbox, User } from 'lucide-react';
import SpoilerMosaic from './SpoilerMosaic';
import FeedbackWidget from './FeedbackWidget';
const loadEmojiPicker = () => import('./EmojiPicker');
const EmojiPicker = React.lazy(loadEmojiPicker);
const warmEmojiPicker = () => {
  loadEmojiPicker().then(m => m.preloadEmojiAssets?.()).catch(() => {});
};
import YouTubeEmbed from './YouTubeEmbed';
import UserProfileCard from '../ui/UserProfileCard';
import TwitchEmbed from './TwitchEmbed';
import YTChannelEmbed from './YTChannelEmbed';
import { AnimatedShrug, AnimatedTableflip, AnimatedMagic, AnimatedParty, AnimatedThinking, AnimatedDance, AnimatedSleep, AnimatedLove, AnimatedCry } from './AnimatedKaomoji';
import VoiceMessagePlayer from './VoiceMessagePlayer';
import { parseMessage } from '../../utils/parseMessage';
import { isAdmin } from '../../utils/permissions';
import { getBookmarks, isBookmarkedId, saveBookmarks } from '../../utils/bookmarks';
import { useCustomEmojis } from '../../utils/customEmojis';
import { MAX_MESSAGE_CHARS } from '../../constants/limits';
import usePresence from '../../hooks/usePresence';
import { t, formatDate } from '../../i18n';
import { localizeSystemText } from '../../utils/systemMessages';

// Module-level cache so once an image/GIF is loaded in session, it never blinks, reloads or shows skeleton
const loadedMediaCache = new Set();

const SequentialMedia = ({ src, isVideo, alt, className = '', onClick, onError }) => {
  const isCached = loadedMediaCache.has(src);
  const [loaded, setLoaded] = useState(isCached);
  const imgRef = useRef(null);
  
  let w = null, h = null, thumb = null;
  try {
    const url = new URL(src, 'http://localhost');
    w = url.searchParams.get('w');
    h = url.searchParams.get('h');
    const rawThumb = url.searchParams.get('t');
    if (rawThumb && /^\/uploads\/[A-Za-z0-9_]+_w1280\.webp$/.test(rawThumb)) {
      thumb = rawThumb;
    }
  } catch {}

  const isStamp = src?.includes('/stumps/') || src?.includes('/stump/');
  const isGif = src?.includes('.gif') || src?.includes('tenor.com') || src?.includes('giphy.com') || src?.includes('klipy.com');

  useEffect(() => {
    if (!isVideo && imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      loadedMediaCache.add(src);
      setLoaded(true);
    }
  }, [src, isVideo]);

  const wrapperClass = className.replace('object-contain', '').replace('cursor-pointer', '').replace('transition-all', '');

  if (isVideo) {
    return (
      <div 
        className={`relative overflow-hidden flex items-center justify-center ${!loaded ? 'bg-zinc-100 rounded-xl' : ''} ${!loaded && (!w || !h) ? wrapperClass : ''}`} 
        style={!loaded && (!w || !h) ? { minWidth: '280px', minHeight: '180px' } : {}}
      >
        {!loaded && !isCached && <Loader2 className="absolute text-zinc-400 animate-spin z-0" size={24} />}
        {w && h && (
          <img src={`data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'/%3E`} className={className} style={{ visibility: 'hidden' }} alt="spacer" />
        )}
        <video 
          src={src} 
          controls 
          preload="metadata"
          className={`${className} ${w && h ? 'absolute inset-0 w-full h-full object-contain' : 'relative z-10'} ${loaded ? 'opacity-100' : 'opacity-0'} ${isCached ? '' : 'transition-opacity duration-150'}`}
          onLoadedData={() => {
            loadedMediaCache.add(src);
            setLoaded(true);
          }}
          onError={(e) => { 
            setLoaded(true); 
            if (onError) onError(e); 
          }}
        />
      </div>
    );
  }

  return (
    <div 
      className={`relative overflow-hidden flex items-center justify-center ${!loaded && !isStamp ? 'bg-zinc-100/70 rounded-xl' : ''} ${!loaded && (!w || !h) && !isStamp ? wrapperClass : ''}`} 
      style={!loaded && (!w || !h) && !isStamp && isGif ? { minWidth: '240px', minHeight: '160px' } : {}} 
      onClick={!loaded ? undefined : onClick}
    >
      {w && h && (
        <img src={`data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'/%3E`} className={className} style={{ visibility: 'hidden' }} alt="spacer" />
      )}
      <img 
        ref={imgRef}
        src={thumb || src} 
        alt={alt}
        // サイズが分からない画像（GIF・スタンプ・外部画像）は先に読み込む。
        // lazy だと画面に入った瞬間に読み込まれて、読んでいる場所で高さが変わってガクッとなる。
        loading={w && h ? 'lazy' : 'eager'}
        decoding="async"
        className={`${className} ${w && h ? 'absolute inset-0 w-full h-full object-contain' : 'relative z-10'} ${loaded ? 'opacity-100' : 'opacity-0'} ${isCached ? '' : 'transition-opacity duration-150'}`}
        onClick={onClick}
        onLoad={() => {
          loadedMediaCache.add(src);
          setLoaded(true);
        }}
        onError={(e) => { 
          setLoaded(true); 
          if (onError) onError(e); 
        }}
      />
    </div>
  );
};

const PollWidget = ({ pollData, pollVotes, currentAccountId, onVote, onAddOption, membersCache, messageId }) => {
  const [now, setNow] = useState(Date.now());
  const [newOption, setNewOption] = useState('');

  useEffect(() => {
    if (!pollData) return;
    if (Date.now() >= pollData.endTime) {
      setNow(pollData.endTime);
      return;
    }
    const interval = setInterval(() => {
      const currentNow = Date.now();
      setNow(currentNow);
      if (currentNow >= pollData.endTime) {
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [pollData]);

  if (!pollData) return null;

  const allVotes = Object.values(pollVotes).reduce((acc, v) => acc.concat(Array.isArray(v) ? v : [v]), []);
  const totalVotes = allVotes.length;
  
  const isExpired = now >= pollData.endTime;
  
  let timeStr = '';
  if (isExpired) {
    timeStr = t('poll.ended');
  } else {
    const diff = pollData.endTime - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    if (hours >= 24) {
      timeStr = t('time.leftDays', { days: Math.floor(hours / 24) });
    } else if (hours > 0) {
      timeStr = t('time.leftHours', { hours });
    } else if (minutes > 0) {
      timeStr = t('time.leftMinutes', { minutes });
    } else {
      timeStr = t('time.leftSeconds', { seconds });
    }
  }

  return (
    <div className="mt-2 mb-3 bg-white border border-zinc-200 rounded-2xl p-4 max-w-[400px] poll-widget">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-zinc-400">
          <BarChart3 size={16} />
          <span className="text-[12px] font-bold tracking-widest uppercase">{t('poll.title')} {pollData.anonymous ? t('common.anonymousParen') : ''} {pollData.multipleChoice ? t('poll.multipleAllowed') : ''}</span>
        </div>
        <span className="text-[11px] font-bold text-zinc-400 bg-zinc-200/50 px-2 py-1 rounded-md">
          {timeStr}
        </span>
      </div>
      <h3 className="text-[16px] font-bold text-zinc-900 mb-4 whitespace-pre-wrap">{pollData.question}</h3>
      <div className="space-y-2">
        {pollData.options.map((opt, i) => {
          const count = allVotes.filter(v => v === i).length;
          const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const optionVoters = Object.entries(pollVotes).filter(([u, votes]) => {
            if (Array.isArray(votes)) return votes.includes(i);
            return votes === i;
          }).map(([u]) => u);
          const userVotes = pollVotes[currentAccountId];
          const hasVoted = Array.isArray(userVotes) ? userVotes.includes(i) : userVotes === i;
          
          return (
            <div 
              key={i}
              onClick={() => !isExpired && onVote && onVote(i)}
              className={`group relative overflow-hidden rounded-xl border transition-all ${isExpired ? 'cursor-default' : 'cursor-pointer'} ${hasVoted ? 'border-[#080a11] bg-[#080a11]/5' : 'border-zinc-200 poll-option'}`}
            >
              <div 
                className="absolute left-0 top-0 bottom-0 bg-[#080a11]/10 transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
              <div className="relative p-3 flex flex-col z-10">
                <div className="flex items-center justify-between">
                  <span className={`text-[14px] font-bold ${hasVoted ? 'text-[#080a11]' : 'text-zinc-700'}`}>
                    {opt} {hasVoted && <span className="text-[12px] opacity-70 ml-1">{t('poll.voted')}</span>}
                  </span>
                  <div className="flex items-center gap-2 text-[12px] font-bold text-zinc-500">
                    {optionVoters.length > 0 && !pollData.anonymous && (
                      <div className="flex -space-x-1.5 mr-1">
                        {optionVoters.slice(0, 5).map((voter, idx) => {
                          const m = Object.values(membersCache).find(member => member.name === voter || member.accountId === voter) || window.__ALL_MEMBERS__?.find(member => member.name === voter || member.accountId === voter);
                          const av = m?.avatarUrl || null;
                          const disp = m?.displayName || m?.firstName || m?.name || voter;
                          return (
                            <div key={idx} className="w-[18px] h-[18px] rounded-full bg-zinc-100 border-[1.5px] border-white overflow-hidden shrink-0 shadow-sm" title={disp}>
                              {av ? (
                                <img src={av} alt={disp} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center font-black text-zinc-400 text-[8px]">
                                  {disp[0]?.toUpperCase()}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {optionVoters.length > 5 && (
                          <div className="w-[18px] h-[18px] rounded-full bg-zinc-100 border-[1.5px] border-white overflow-hidden shrink-0 shadow-sm flex items-center justify-center font-bold text-[8px] text-zinc-500">
                            +{optionVoters.length - 5}
                          </div>
                        )}
                      </div>
                    )}
                    {count > 0 && <span>{t('poll.votesPercent', { count, percent })}</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {pollData.allowAddOptions && !isExpired && pollData.options.length < 10 && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-100">
          <input
            type="text"
            value={newOption}
            onChange={(e) => setNewOption(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newOption.trim()) {
                onAddOption && onAddOption(newOption.trim());
                setNewOption('');
              }
            }}
            placeholder={t('poll.addOptionPlaceholder')}
            className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-[13px] text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-[#080a11] focus:ring-2 focus:ring-[#080a11]/20 transition-all"
            maxLength={50}
          />
          <button
            onClick={() => {
              if (newOption.trim()) {
                onAddOption && onAddOption(newOption.trim());
                setNewOption('');
              }
            }}
            disabled={!newOption.trim()}
            className="px-3 py-2 text-white bg-[#080a11] hover:bg-[#151c2c] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold text-[13px] transition-colors shadow-sm shadow-[#080a11]/20"
          >
            {t('common.add')}
          </button>
        </div>
      )}
      <div className="mt-3 text-[11px] font-bold text-zinc-400 text-right">
        {t('poll.total', { count: totalVotes })}
      </div>
    </div>
  );
};

const LiveFeedbackQuote = ({ messageId, responseId, initialUpvotes, initialDownvotes, initialIsAnon, initialUserId, safeTitle, text, channelId, socket, membersCache }) => {
  const [upvotes, setUpvotes] = useState(initialUpvotes);
  const [downvotes, setDownvotes] = useState(initialDownvotes);
  const [isAnon, setIsAnon] = useState(initialIsAnon);
  const [userId, setUserId] = useState(initialUserId);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('request_message_data', {
      detail: {
        messageId,
        callback: (msg) => {
          if (msg && msg.text.startsWith('__FEEDBACK__')) {
            const data = JSON.parse(msg.text.replace('__FEEDBACK__', ''));
            const res = data.responses?.find(r => r.id === responseId);
            if (res) {
              setUpvotes(res.upvotes?.length || 0);
              setDownvotes(res.downvotes?.length || 0);
              setIsAnon(data.anonymous ? '1' : '0');
              setUserId(res.user || '');
            }
          }
        }
      }
    }));
    
    if (!socket) return;
    const handleMessageEdited = (msg) => {
      if (msg.id === messageId && msg.text.startsWith('__FEEDBACK__')) {
        const data = JSON.parse(msg.text.replace('__FEEDBACK__', ''));
        const res = data.responses?.find(r => r.id === responseId);
        if (res) {
          setUpvotes(res.upvotes?.length || 0);
          setDownvotes(res.downvotes?.length || 0);
          setIsAnon(data.anonymous ? '1' : '0');
          setUserId(res.user || '');
        }
      }
    };
    socket.on('message_edited', handleMessageEdited);
    return () => socket.off('message_edited', handleMessageEdited);
  }, [messageId, responseId, socket]);

  let userInfo = null;
  if (isAnon === '0' && userId) {
    const m = membersCache[userId] || window.__ALL_MEMBERS__?.find(mem => mem.accountId === userId);
    const disp = m?.displayName || m?.firstName || m?.name || userId;
    const av = m?.avatarUrl;
    userInfo = (
      <div className="flex flex-col items-center shrink-0 w-10 mt-1">
        <div className="w-7 h-7 rounded-full bg-zinc-200 flex items-center justify-center overflow-hidden shrink-0 shadow-sm border border-zinc-100">
          {av ? <img src={av} alt={disp} className="w-full h-full object-cover" /> : <User size={14} className="text-zinc-400" />}
        </div>
        <span className="text-[9px] font-bold text-zinc-400 truncate w-full text-center mt-1" title={disp}>{disp}</span>
      </div>
    );
  } else if (isAnon === '1') {
    userInfo = (
      <div className="flex flex-col items-center shrink-0 w-10 mt-1">
        <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center overflow-hidden shrink-0 border border-zinc-200 border-dashed">
          <User size={14} className="text-zinc-400 opacity-50" />
        </div>
        <span className="text-[9px] font-bold text-zinc-400 truncate w-full text-center mt-1">{t('common.anonymous')}</span>
      </div>
    );
  }

  return (
    <blockquote className="border-l-[3px] border-zinc-300 pl-3 pr-4 py-2 my-1 text-zinc-600 bg-zinc-50/50 rounded-r-lg shadow-sm w-fit min-w-[280px] max-w-full relative overflow-hidden">
      <div className="flex items-center gap-2 mb-2 text-zinc-500 font-bold text-[11px] select-none border-b border-zinc-200/50 pb-2">
        <Inbox size={12} className="text-[#080a11] shrink-0" />
        <span className="text-zinc-700 truncate max-w-[150px]">{safeTitle}</span>
        <span className="flex items-center gap-2 ml-auto text-zinc-500 bg-zinc-100 px-2 py-1 rounded-md border border-zinc-200/50">
          <span className="flex items-center gap-1"><ThumbsUp size={10} className="text-zinc-500" /> {upvotes}</span>
          <span className="w-px h-2.5 bg-zinc-500/30"></span>
          <span className="flex items-center gap-1"><ThumbsDown size={10} className="text-zinc-500" /> {downvotes}</span>
        </span>
        <div className="text-zinc-700 cursor-pointer hover:bg-zinc-200/60 px-2 py-1 rounded transition-colors flex items-center gap-1 ml-1 shrink-0" onClick={() => window.dispatchEvent(new CustomEvent('fetch_and_jump_message', { detail: { msgId: messageId, channelId } }))}>
          <CornerUpRight size={10} /> {t('message.toQuoteSource')}
        </div>
      </div>
      <div className="flex gap-3 items-start mt-2">
        {userInfo}
        <div className="text-zinc-700 italic leading-relaxed text-[13px] whitespace-pre-wrap flex-1 pt-1">{text}</div>
      </div>
    </blockquote>
  );
};

const MessageLink = ({ fullMsgId, timestampId, initialTargetChannelId, channelId, socket }) => {
  const [targetChannelId, setTargetChannelId] = useState(initialTargetChannelId);

  useEffect(() => {
    if (!targetChannelId && socket) {
      socket.emit('get_message', { messageId: timestampId }, (msg) => {
        if (msg && msg.channelId) {
          setTargetChannelId(msg.channelId);
        }
      });
    }
  }, [timestampId, targetChannelId, socket]);

  let channelName = '';
  if (targetChannelId) {
    if (targetChannelId.includes('__dm__')) {
      channelName = 'DM';
    } else {
      const commonChannels = {
        general: t('channels.general'),
        threads: t('channels.threads'),
        kikisen: t('channels.kikisen'),
        vc1: 'VC 1',
        vc2: 'VC 2',
        vc3: 'VC 3'
      };
      channelName = commonChannels[targetChannelId] || targetChannelId;
    }
  }

  return (
    <span
      onClick={() => {
        // 同じチャンネル内なら MessagePane のジャンプに任せる（smooth スクロールは位置補正とぶつかるので使わない）
        if (!targetChannelId || targetChannelId === channelId) {
          window.dispatchEvent(new CustomEvent('fetch_and_jump_message', { detail: { msgId: timestampId } }));
        } else {
          const newFullMsgId = targetChannelId ? `${timestampId}_${targetChannelId}` : fullMsgId;
          window.dispatchEvent(new CustomEvent('fetch_and_jump_message', { detail: { msgId: newFullMsgId } }));
        }
      }}
      className="text-[#5865F2] bg-[#5865F2]/10 px-2 py-0 rounded-xl cursor-pointer hover:bg-[#5865F2]/20 hover:underline transition-all mx-1 font-medium inline-flex items-center gap-1"
      title={t('message.jumpToMessage')}
    >
      <span className="opacity-70 text-[12px]">#</span>
      <span>{channelName || '...'}</span>
      <span className="opacity-50 text-[12px]">›</span>
      <MessageCircle size={12} fill="currentColor" strokeWidth={0} className="opacity-70" />
    </span>
  );
};

const MediaExpirationBadge = React.memo(({ timestamp, className }) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!timestamp) return;
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
    
    const updateTimeLeft = () => {
      const now = Date.now();
      const diff = timestamp + THREE_DAYS - now;
      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft('');
      } else {
        setIsExpired(false);
        const days = Math.floor(diff / (24 * 60 * 60 * 1000));
        const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
        
        if (days > 0) setTimeLeft(t('time.leftDaysHours', { days, hours }));
        else if (hours > 0) setTimeLeft(t('time.leftHoursMinutes', { hours, mins }));
        else setTimeLeft(t('time.leftMins', { mins }));
      }
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 60000); // update every minute
    return () => clearInterval(interval);
  }, [timestamp]);

  if (!timeLeft) return null;

  return (
    <div className={`mb-1 px-2 py-1 bg-zinc-800/80 text-zinc-300 text-[10px] rounded-md flex w-fit items-center gap-2 shadow-sm border border-white/5 ${className || ''}`}>
      <Clock size={12} className="text-zinc-400" />
      <span>{timeLeft}</span>
    </div>
  );
});

const FileAttachment = React.memo(({ fileUrl, fileName, fileSize, uploadProgress, isUploading, timestamp }) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [isExpired, setIsExpired] = useState(false);



  useEffect(() => {
    if (!timestamp || isUploading) return;
    
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
    const ONE_HOUR = 60 * 60 * 1000;
    let timerId = null;
    
    const updateTimeLeft = () => {
      const now = Date.now();
      const diff = timestamp + THREE_DAYS - now;
      
      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft('');
        return;
      }
      setIsExpired(false);
      const days = Math.floor(diff / (24 * 60 * 60 * 1000));
      const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
      const secs = Math.floor((diff % (60 * 1000)) / 1000);
      
      if (days > 0) setTimeLeft(t('time.leftDaysHoursMinutes', { days, hours, mins }));
      else if (hours > 0) setTimeLeft(t('time.leftHoursMinutes', { hours, mins }));
      else setTimeLeft(t('time.leftMinutesSeconds', { mins, secs }));

      const delay = diff > ONE_HOUR ? 60000 : 1000;
      timerId = setTimeout(updateTimeLeft, delay);
    };

    updateTimeLeft();
    return () => { if (timerId) clearTimeout(timerId); };
  }, [timestamp, isUploading]);

  if (!fileUrl && !isUploading && !fileName) return null; // If no file data at all
  if (!fileUrl && !fileName && !fileSize) return null;

  if (isExpired) {
    return (
      <div className="mt-1 flex items-center gap-3 px-4 py-3 bg-zinc-100 rounded-xl border border-zinc-200">
        <FileIcon className="text-zinc-400" size={24} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-zinc-500 truncate line-through">{fileName || t('common.file')}</div>
          <div className="text-[11px] text-red-500 font-bold mt-1">{t('message.fileGone')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1 relative flex items-center gap-3 px-4 py-3 bg-zinc-50 hover:bg-zinc-100 transition-colors rounded-xl border border-zinc-200 group/file w-fit min-w-[250px] max-w-full">
      <div className="w-10 h-10 rounded-lg bg-zinc-200 flex items-center justify-center shrink-0">
        <FileIcon className="text-zinc-700" size={20} />
      </div>
      <div className="flex-1 min-w-0 pr-4">
        <div className="text-[13px] font-bold text-zinc-800 truncate">{fileName || t('common.file')}</div>
        <div className="flex items-center gap-2 mt-1">
          {fileSize && <span className="text-[11px] text-zinc-500">{(fileSize / 1024 / 1024).toFixed(2)} MB</span>}
          {!isUploading && timeLeft && (
            <>
              {fileSize && <span className="w-1 h-1 rounded-full bg-zinc-300"></span>}
              <span className="text-[11px] text-zinc-600 font-medium">{timeLeft}</span>
            </>
          )}
        </div>
      </div>
      
      {!isUploading && fileUrl ? (
        <a href={fileUrl} download={fileName} target="_blank" rel="noopener noreferrer" className="shrink-0 p-2 bg-white hover:bg-zinc-100 text-zinc-700 rounded-full shadow-sm border border-zinc-200 transition-colors">
          <Download size={18} />
        </a>
      ) : isUploading ? (
        <div className="shrink-0 flex items-center gap-2 pr-2">
          <div className="text-[11px] font-bold text-zinc-500">{uploadProgress || 0}%</div>
          <Loader2 className="animate-spin text-zinc-400" size={18} />
        </div>
      ) : null}
      {isUploading && (
        <div className="absolute bottom-0 left-0 h-1 bg-zinc-200 w-full rounded-b-xl overflow-hidden">
          <div className="h-full bg-zinc-700 transition-all duration-300" style={{ width: `${uploadProgress || 0}%` }} />
        </div>
      )}
    </div>
  );
});
// 数字が増えたら下から、減ったら上から入れ替わる小さなカウンター
function RollingCount({ value, className = '' }) {
  const [prev, setPrev] = useState(value);
  const [dir, setDir] = useState('up');
  if (value !== prev) {
    setDir(value > prev ? 'up' : 'down');
    setPrev(value);
  }
  return (
    <span className="hc-count-window">
      <span key={value} className={`${className} ${dir === 'down' ? 'hc-count-roll-down' : 'hc-count-roll-up'}`}>
        {value}
      </span>
    </span>
  );
}

export const Message = React.memo(({ id, user, msgAccountId, authorProfile, time, timestamp, text, avatarUrl, imageUrl, fileUrl, fileName, fileSize, uploadProgress, audioUrl, isUploading, replyTo, isEdited, editHistory = [], pollVotes = {}, isContinuation = false, reactions = [], onReact, onReply, onEdit, onImageClick, currentUser, currentAccountId, membersCache = {}, onDelete, onOpenProfile, onVote, onAddOption, onSubmitFeedback, onFeedbackReact, isPinned, onTogglePin, channelId, socket, isOnline, updatedAt, isNewArrival }) => {
  const customEmojis = useCustomEmojis(socket);
  const customEmojiMap = useMemo(() => {
    const m = new Map();
    for (const ce of customEmojis) m.set(ce.name, ce);
    return m;
  }, [customEmojis]);
  const isVideoFile = !!fileName?.match(/\.(mp4|webm|ogg)$/i);
  const isAudioFile = !!fileName?.match(/\.(mp3|wav|m4a|flac)$/i);
  const imageList = useMemo(() => (imageUrl ? imageUrl.split('|||').filter(Boolean) : []), [imageUrl]);
  const isStampImage = imageList.length === 1 && /\/(stumps|stump)\//i.test(imageList[0]);
  const [revealedSpoilers, setRevealedSpoilers] = useState(() => new Set());
  const [showLocalPicker, setShowLocalPicker] = useState(false);
  const localPickerPresence = usePresence(showLocalPicker, 140);
  const [showReactionList, setShowReactionList] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const showControls = hovered || controlsOpen;
  const hoverProps = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onFocusCapture: () => setHovered(true),
    onBlurCapture: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHovered(false); },
  };
  const isMentioned = typeof text === 'string' && currentAccountId && (text.includes(`<${currentAccountId}>`) || text.includes('<hamachill>') || text.includes('<everyone>'));


  const [isBookmarked, setIsBookmarked] = useState(() => isBookmarkedId(currentAccountId, id));

  // ブックマーク一覧側で外された・別アカウントに切り替わった場合もアイコンを合わせる
  useEffect(() => {
    const sync = () => setIsBookmarked(isBookmarkedId(currentAccountId, id));
    sync();
    window.addEventListener('bookmarks_updated', sync);
    return () => window.removeEventListener('bookmarks_updated', sync);
  }, [currentAccountId, id]);

  const handleBookmark = () => {
    try {
      const existing = getBookmarks(currentAccountId);
      if (isBookmarkedId(currentAccountId, id)) {
        saveBookmarks(currentAccountId, existing.filter(b => b.id !== id));
        setIsBookmarked(false);
      } else {
        const bookmark = { id, user, msgAccountId, text, time, avatarUrl, imageUrl, audioUrl, timestamp: Date.now(), channelId };
        saveBookmarks(currentAccountId, [bookmark, ...existing]);
        setIsBookmarked(true);
      }
    } catch (e) {
      console.error('Failed to toggle bookmark', e);
    }
  };
  const [pickerDirection, setPickerDirection] = useState('up');
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(text);
  const [showProfile, setShowProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyDirection, setHistoryDirection] = useState('down');
  const [popupPos, setPopupPos] = useState({});
  const localPickerRef = useRef(null);
  const plusButtonRef = useRef(null);
  const reactionListRef = useRef(null);
  const reactionButtonRef = useRef(null);
  const [bumpEmoji, setBumpEmoji] = useState(null);
  const historyListRef = useRef(null);
  const historyButtonRef = useRef(null);
  const nameRef = useRef(null);
  const editInputRef = useRef(null);
  const voicePlayerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        localPickerRef.current &&
        !localPickerRef.current.contains(event.target) &&
        plusButtonRef.current &&
        !plusButtonRef.current.contains(event.target)
      ) {
        setShowLocalPicker(false);
      }
      if (
        reactionListRef.current &&
        !reactionListRef.current.contains(event.target) &&
        reactionButtonRef.current &&
        !reactionButtonRef.current.contains(event.target)
      ) {
        setShowReactionList(false);
      }
      if (
        historyListRef.current &&
        !historyListRef.current.contains(event.target) &&
        historyButtonRef.current &&
        !historyButtonRef.current.contains(event.target)
      ) {
        setShowHistory(false);
      }
      if (controlsOpen && !event.target.closest('.chat-controls-container')) {
        setControlsOpen(false);
      }
    };

    if (showLocalPicker || showReactionList || showHistory || controlsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showLocalPicker, showReactionList, showHistory, controlsOpen]);

  const toggleHistory = useCallback(() => {
    const nextState = !showHistory;
    if (nextState && historyButtonRef.current) {
      const rect = historyButtonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setHistoryDirection(spaceBelow >= 250 ? 'down' : 'up');
    }
    setShowHistory(nextState);
  }, [showHistory]);

  const handleEditSubmit = useCallback(() => {
    if (editValue.trim() && editValue !== text && onEdit) {
      onEdit(id, editValue);
    }
    setIsEditing(false);
  }, [editValue, text, id, onEdit]);

  const handleEditKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEditSubmit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditValue(text);
    }
  }, [handleEditSubmit, text]);

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      const len = editInputRef.current.value.length;
      editInputRef.current.setSelectionRange(len, len);
    }
  }, [isEditing]);

  const toggleLocalPicker = useCallback(() => {
    if (!showLocalPicker && plusButtonRef.current) {
      const rect = plusButtonRef.current.getBoundingClientRect();
      const spaceAbove = rect.top;

      setPickerDirection(spaceAbove >= 420 ? 'up' : 'down');
    }
    setShowLocalPicker(prev => !prev);
  }, [showLocalPicker]);

  const handleLocalEmojiSelect = (emoji) => {
    onReact?.(id, emoji);
    setShowLocalPicker(false);
  };

  const parsed = useMemo(() => parseMessage(id, updatedAt, text, msgAccountId), [id, updatedAt, text, msgAccountId]);
  const { special, tokens, isEmojiOnly: parsedIsEmojiOnly, youtubeIds, twitchIds, youtubeChannelUrls, mediaUrls } = parsed;
  const {
    isPoll, pollData, isFeedback, feedbackData,
    isCommandShrug, isCommandTableflip, isCommandMagic, isCommandParty,
    isCommandThinking, isCommandDance, isCommandSleep, isCommandLove, isCommandCry
  } = special;

  const isEmojiOnly = useMemo(() => {
    if (parsedIsEmojiOnly) return true;
    if (customEmojiMap.size === 0 || !tokens || tokens.length === 0) return false;
    if (isPoll || isFeedback || isCommandShrug || isCommandTableflip || isCommandMagic || isCommandParty || isCommandThinking || isCommandDance || isCommandSleep || isCommandLove || isCommandCry) return false;
    let hasCustom = false;
    for (const tok of tokens) {
      if (tok.type === 'emoji') continue;
      if (tok.type === 'text') {
        const rest = tok.content.replace(/:([a-zA-Z0-9_]{2,24}):/g, (m, name) => {
          if (customEmojiMap.has(name)) {
            hasCustom = true;
            return '';
          }
          return m;
        }).trim();
        if (rest.length > 0) return false;
      } else {
        return false;
      }
    }
    return hasCustom;
  }, [parsedIsEmojiOnly, customEmojiMap, tokens, isPoll, isFeedback, isCommandShrug, isCommandTableflip, isCommandMagic, isCommandParty, isCommandThinking, isCommandDance, isCommandSleep, isCommandLove, isCommandCry]);

  const renderCustomEmojisInText = useCallback((str, keyPrefix) => {
    if (typeof str !== 'string' || !str || customEmojiMap.size === 0 || !str.includes(':')) return str;
    const re = /(:[a-zA-Z0-9_]{2,24}:)/g;
    if (!re.test(str)) return str;
    const parts = str.split(re);
    let hasMatch = false;
    const nodes = parts.map((part, i) => {
      if (part.startsWith(':') && part.endsWith(':') && part.length > 2) {
        const ce = customEmojiMap.get(part.slice(1, -1));
        if (ce) {
          hasMatch = true;
          return (
            <img
              key={`${keyPrefix}-ce-${i}`}
              src={ce.url}
              alt={part}
              title={part}
              className={`inline-block ${isEmojiOnly ? 'w-8 h-8 mx-1' : 'w-[1.8em] h-[1.8em] mx-[1px]'} align-[-0.4em] object-contain`}
              draggable={false}
            />
          );
        }
      }
      return part;
    });
    return hasMatch ? nodes : str;
  }, [customEmojiMap, isEmojiOnly]);

  const renderKaomojiOrText = useCallback((str, keyPrefix) => {
    if (typeof str !== 'string' || !str) return str;
    if (!isCommandShrug && !isCommandTableflip && !isCommandMagic && !isCommandParty && !isCommandThinking && !isCommandDance && !isCommandSleep && !isCommandLove && !isCommandCry) {
      return renderCustomEmojisInText(str, keyPrefix);
    }

    const kaomojiRegex = /(¯\\_\(ツ\)_\/¯|¯_\(ツ\)_\/¯|\(╯°□°）╯︵ ┻━┻|\(∩\^o\^\)⊃━☆゜\.\*・。゜|٩\( ᐛ \)و|\( ˘•ω•˘ \)|ヾ\(≧▽≦\)ﾉ|\( ˘ω˘\)ｽﾔｧ|\(♡ >ω< ♡\)|\(´；ω；｀\))/g; // i18n-ignore: kaomoji are message content
    if (!kaomojiRegex.test(str)) return renderCustomEmojisInText(str, keyPrefix);

    const chunks = str.split(kaomojiRegex);
    return chunks.map((chunk, idx) => {
      if (isCommandShrug && (chunk === '¯\\_(ツ)_/¯' || chunk === '¯_(ツ)_/¯')) { // i18n-ignore: kaomoji are message content
        return <AnimatedShrug key={`${keyPrefix}-shrug-${idx}`} />;
      }
      if (isCommandTableflip && chunk === '(╯°□°）╯︵ ┻━┻') {
        return <AnimatedTableflip key={`${keyPrefix}-tableflip-${idx}`} />;
      }
      if (isCommandMagic && chunk === '(∩^o^)⊃━☆゜.*・。゜') { // i18n-ignore: kaomoji are message content
        return <AnimatedMagic key={`${keyPrefix}-magic-${idx}`} />;
      }
      if (isCommandParty && chunk === '٩( ᐛ )و') {
        return <AnimatedParty key={`${keyPrefix}-party-${idx}`} />;
      }
      if (isCommandThinking && chunk === '( ˘•ω•˘ )') {
        return <AnimatedThinking key={`${keyPrefix}-thinking-${idx}`} />;
      }
      if (isCommandDance && chunk === 'ヾ(≧▽≦)ﾉ') { // i18n-ignore: kaomoji are message content
        return <AnimatedDance key={`${keyPrefix}-dance-${idx}`} />;
      }
      if (isCommandSleep && chunk === '( ˘ω˘)ｽﾔｧ') { // i18n-ignore: kaomoji are message content
        return <AnimatedSleep key={`${keyPrefix}-sleep-${idx}`} />;
      }
      if (isCommandLove && chunk === '(♡ >ω< ♡)') {
        return <AnimatedLove key={`${keyPrefix}-love-${idx}`} />;
      }
      if (isCommandCry && chunk === '(´；ω；｀)') {
        return <AnimatedCry key={`${keyPrefix}-cry-${idx}`} />;
      }
      return renderCustomEmojisInText(chunk, `${keyPrefix}-c-${idx}`);
    });
  }, [isCommandShrug, isCommandTableflip, isCommandMagic, isCommandParty, isCommandThinking, isCommandDance, isCommandSleep, isCommandLove, isCommandCry, renderCustomEmojisInText]);

  const renderSubToken = useCallback((sub, j) => {
    if (sub.type === 'spoiler') return <span key={j} className="bg-zinc-800 text-transparent hover:text-white rounded px-1 transition-colors cursor-pointer" title={t('common.spoiler')}>{renderKaomojiOrText(sub.content, `spoiler-${j}`)}</span>;
    if (sub.type === 'bold') return <strong key={j}>{renderKaomojiOrText(sub.content, `strong-${j}`)}</strong>;
    if (sub.type === 'underline') return <u key={j}>{renderKaomojiOrText(sub.content, `u-${j}`)}</u>;
    if (sub.type === 'del') return <del key={j}>{renderKaomojiOrText(sub.content, `del-${j}`)}</del>;
    if (sub.type === 'h3') return <h3 key={j} className="text-lg font-bold mt-2 mb-1 text-zinc-900">{renderKaomojiOrText(sub.content, `h3-${j}`)}</h3>;
    if (sub.type === 'h2') return <h2 key={j} className="text-xl font-bold mt-2 mb-1 text-zinc-900">{renderKaomojiOrText(sub.content, `h2-${j}`)}</h2>;
    if (sub.type === 'h1') return <h1 key={j} className="text-2xl font-bold mt-3 mb-1 text-zinc-900">{renderKaomojiOrText(sub.content, `h1-${j}`)}</h1>;
    if (sub.type === 'quote_feedback') {
      return (
        <LiveFeedbackQuote 
          key={j}
          messageId={sub.messageId}
          responseId={sub.responseId}
          initialUpvotes={sub.initialUpvotes}
          initialDownvotes={sub.initialDownvotes}
          initialIsAnon={sub.initialIsAnon}
          initialUserId={sub.initialUserId}
          safeTitle={sub.safeTitle}
          text={sub.text}
          channelId={channelId}
          socket={socket}
          membersCache={membersCache}
        />
      );
    }
    if (sub.type === 'quote_msg') {
      return (
        <blockquote key={j} className="border-l-[3px] border-zinc-300 pl-3 pr-4 py-2 my-1 text-zinc-600 bg-zinc-50/50 rounded-r-lg italic w-fit min-w-[200px] max-w-full">
          <div className="text-[10px] font-bold text-zinc-600 hover:text-zinc-900 mb-1 cursor-pointer hover:underline flex items-center gap-1 w-max not-italic" onClick={() => window.dispatchEvent(new CustomEvent('fetch_and_jump_message', { detail: { msgId: sub.msgId, channelId } }))}>
            <CornerUpRight size={10} /> {sub.label ? t('message.quoteFrom', { label: sub.label }) : t('message.jumpToQuote')}
          </div>
          <div className="whitespace-pre-wrap">{sub.text}</div>
        </blockquote>
      );
    }
    if (sub.type === 'quote_url') {
      return (
        <blockquote key={j} className="border-l-[3px] border-zinc-300 pl-3 pr-4 py-2 my-1 text-zinc-600 bg-zinc-50/50 rounded-r-lg italic w-fit min-w-[200px] max-w-full">
          <a href={sub.url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-zinc-600 hover:text-zinc-900 mb-1 hover:underline flex items-center gap-1 w-max not-italic">
            <CornerUpRight size={10} /> {t('message.openSource')}
          </a>
          <div className="whitespace-pre-wrap">{sub.text}</div>
        </blockquote>
      );
    }
    if (sub.type === 'quote_default') {
      return <blockquote key={j} className="border-l-[3px] border-zinc-300 pl-3 pr-4 py-1 my-1 text-zinc-600 bg-zinc-50/50 rounded-r-lg italic whitespace-pre-wrap w-fit max-w-full">{sub.text}</blockquote>;
    }
    return renderKaomojiOrText(sub.content, `md-${j}`);
  }, [renderKaomojiOrText, channelId, socket, membersCache]);

  const renderToken = useCallback((token, i) => {
    if (token.type === 'emoji') {
      return (
        <img
          key={i}
          src={getTwemojiUrl(token.value)}
          alt={token.value}
          className={`${isEmojiOnly ? 'w-8 h-8 mx-1' : 'w-[1.75em] h-[1.75em] mx-[0.06em]'} inline-block align-[-0.38em]`}
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
      );
    }
    if (token.type === 'invalid_url') {
      return <span key={i} className="text-red-400">{t('message.invalidUrl')}</span>;
    }
    if (token.type === 'url') {
      return (
        <a
          key={i}
          href={token.sanitizedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#080a11] underline decoration-[#080a11]/50 hover:decoration-[#080a11] hover:opacity-80 transition-all font-normal break-all"
        >
          {token.value}
        </a>
      );
    }
    if (token.type === 'msg_link') {
      return (
        <MessageLink
          key={i}
          fullMsgId={token.fullMsgId}
          timestampId={token.timestampId}
          initialTargetChannelId={token.targetChannelId}
          channelId={channelId}
          socket={socket}
        />
      );
    }
    if (token.type === 'user_mention') {
      const userId = token.userId;
      const member = membersCache[userId] || window.__ALL_MEMBERS__?.find(m => m.name === userId || m.accountId === userId);
      const displayName = member?.displayName || member?.firstName || member?.name || userId;
      const isMeMentioned = userId === currentAccountId || userId === 'hamachill' || userId === 'everyone';
      const badgeClass = isMeMentioned
        ? "mention-badge-me px-1 py-0 rounded-xl cursor-pointer transition-all mx-1 font-medium inline-flex items-center"
        : "text-[#5865F2] bg-[#5865F2]/10 px-1 py-0 rounded-xl cursor-pointer hover:bg-[#5865F2]/20 hover:underline transition-all mx-1 font-medium inline-flex items-center";

      if (userId === 'everyone') {
        return (
          <span
            key={i}
            className={badgeClass}
            title={t('message.mentionEveryone')}
          >
            @everyone
          </span>
        );
      }

      return (
        <span
          key={i}
          onClick={(e) => {
            const rect = e.target.getBoundingClientRect();
            const userObj = member ? { ...member, name: displayName } : { name: userId };
            window.dispatchEvent(new CustomEvent('open-right-profile', { detail: { user: userObj, rect } }));
          }}
          className={badgeClass}
          title={t('message.viewProfile')}
        >
          @{displayName}
        </span>
      );
    }
    if (token.type === 'channel_mention') {
      return (
        <a key={i} href={`/c/${token.channelId}`} onClick={(e) => { e.preventDefault(); navigateTo(`/c/${token.channelId}`); }} className="text-zinc-800 hover:text-zinc-950 bg-zinc-200/70 hover:bg-zinc-300/70 px-2 py-1 rounded-xl cursor-pointer hover:underline transition-all mx-1 text-[14px] font-bold inline-flex items-center">
          <Hash size={14} className="inline mr-1" />
          {token.name}
        </a>
      );
    }
    if (token.type === 'pin_list') {
      return (
        <span
          key={i}
          onClick={() => {
            const pinBtn = document.querySelector('button[data-action="open-pins"]');
            if (pinBtn) pinBtn.click();
          }}
          className="text-zinc-800 hover:text-zinc-950 bg-zinc-200/70 hover:bg-zinc-300/70 px-2 py-1 rounded-xl cursor-pointer hover:underline transition-all mx-1 text-[14px] font-bold inline-flex items-center"
          title={t('message.openPinList')}
        >
          {token.text}
        </span>
      );
    }
    if (token.type === 'markdown') {
      return (
        <React.Fragment key={i}>
          {token.subTokens.map((sub, j) => renderSubToken(sub, j))}
        </React.Fragment>
      );
    }
    return renderKaomojiOrText(token.content, `part-${i}`);
  }, [isEmojiOnly, channelId, socket, membersCache, currentAccountId, renderSubToken, renderKaomojiOrText]);

  const elements = useMemo(() => tokens.map((token, i) => renderToken(token, i)), [tokens, renderToken]);

  const renderPoll = () => {
    if (!pollData) return null;
    return <PollWidget pollData={pollData} pollVotes={pollVotes} currentAccountId={currentAccountId} onVote={(optIdx) => onVote?.(id, optIdx)} onAddOption={(optText) => onAddOption?.(id, optText)} membersCache={membersCache} messageId={id} />;
  };

  const renderFeedback = () => {
    if (!feedbackData) return null;
    return <FeedbackWidget feedbackData={feedbackData} onSubmitFeedback={(fbText) => onSubmitFeedback?.(id, fbText)} onFeedbackReact={(rid, rType) => onFeedbackReact?.(id, rid, rType)} currentAccountId={currentAccountId} membersCache={membersCache} messageId={id} />;
  };


  // 描画済みでも未読込でも MessagePane のジャンプに任せる（smooth の scrollIntoView は位置補正とぶつかる）
  const scrollToMessage = useCallback((msgId) => {
    window.dispatchEvent(new CustomEvent('fetch_and_jump_message', { detail: { msgId } }));
  }, []);

  const replyToElement = useMemo(() => {
    if (!replyTo) return null;
    
    // 返信先のメンバー情報を取得
    const replyMember = membersCache[replyTo.user];
    const replyDisplayName = replyMember?.displayName || replyMember?.firstName || replyTo.user;
    const replyAvatarUrl = replyMember?.avatarUrl;
    
    return (
      <div
        className="flex items-center gap-2 mb-1 text-[13px] text-zinc-900/40 cursor-pointer hover:text-zinc-900/60 transition-colors relative select-none"
        onClick={() => scrollToMessage(replyTo.id)}
      >
        <div className="absolute -left-[33px] top-1/2 w-[29px] h-[10px] border-l-[2px] border-t-[2px] border-[#4f545c]/40 rounded-tl-sm -mt-px" />
        
        <div className="w-4 h-4 rounded-full bg-zinc-950/10 overflow-hidden shrink-0 shadow-sm border border-black/5">
          {replyAvatarUrl ? (
            <img src={replyAvatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-black text-zinc-900/30 text-[8px]">
              {replyDisplayName?.[0]?.toUpperCase() || '?'}
            </div>
          )}
        </div>
        <span className="font-bold text-zinc-900/50 text-[12px]">{replyDisplayName}</span>
        <span className="truncate max-w-[300px] text-[12px]">{localizeSystemText(replyTo.text, replyTo.user) || t('message.imageOrPoll')}</span>
      </div>
    );
  }, [replyTo, membersCache, scrollToMessage]);

  const openProfile = (e) => {
    if (onOpenProfile) onOpenProfile(msgAccountId || user, e);
  };


  const renderReactions = () => {
    const hasReactions = reactions && reactions.length > 0;

    if (!hasReactions && !localPickerPresence.mounted && !showReactionList) return null;

    return (
      <div className="flex flex-wrap gap-1 mt-1 mb-1 select-none relative">
        {reactions.map((reaction) => {
          const hasReacted = reaction.users.includes(currentAccountId);
          return (
            <button
              key={reaction.emoji}
              onClick={() => {
                setBumpEmoji(reaction.emoji);
                onReact?.(id, reaction.emoji);
              }}
              onAnimationEnd={(e) => {
                if (e.animationName === 'hc-reaction-bump') setBumpEmoji(null);
              }}
              className={`
                flex items-center gap-1.5 px-[7px] py-[3px] rounded-lg border transition-colors duration-140 hc-press hover:shadow-sm
                ${bumpEmoji === reaction.emoji ? 'hc-reaction-bump' : 'hc-scale-in'}
                ${hasReacted
                  ? 'bg-blue-50/80 dark:bg-blue-500/15 border-blue-500/40 hover:border-blue-500/60 hover:bg-blue-100/80 dark:hover:bg-blue-500/20'
                  : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }
              `}
              title={reaction.users.join(', ')}
            >
              <img
                src={(reaction.emoji?.startsWith(':') && reaction.emoji?.endsWith(':') && customEmojiMap.get(reaction.emoji.slice(1, -1))?.url) || getTwemojiUrl(reaction.emoji)}
                alt={reaction.emoji}
                className="w-[18px] h-[18px] object-contain"
              />
              <RollingCount
                value={reaction.count}
                className={`text-[12px] font-bold ${hasReacted ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-600 dark:text-zinc-400'}`}
              />
            </button>
          );
        })}

        <div className="relative flex items-center gap-1">
          <button
            ref={plusButtonRef}
            onClick={toggleLocalPicker}
            onPointerEnter={warmEmojiPicker}
            className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-200 active:scale-95 border ${showLocalPicker ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-zinc-100 shadow-sm' : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600 shadow-sm'}`}
          >
            <Plus size={15} className="stroke-[2.5]" />
          </button>
          
          {hasReactions && (
            <button
              ref={reactionButtonRef}
              onClick={() => {
                if (!showReactionList && reactionButtonRef.current) {
                  const rect = reactionButtonRef.current.getBoundingClientRect();
                  setPickerDirection(rect.top >= 420 ? 'up' : 'down');
                }
                setShowReactionList(!showReactionList);
              }}
              className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-200 active:scale-95 border ${showReactionList ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-zinc-100 shadow-sm' : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600 shadow-sm'}`}
              title={t('message.reactedUsers')}
            >
              <Users size={14} className="stroke-[2.5]" />
            </button>
          )}

          {localPickerPresence.mounted && (
            <div
              ref={localPickerRef}
              className={`absolute left-0 z-[100] ${
                localPickerPresence.state === 'exit' ? 'hc-scale-out pointer-events-none' : 'hc-scale-in'
              } ${pickerDirection === 'up'
                ? 'bottom-full mb-2 origin-bottom-left'
                : 'top-full mt-2 origin-top-left'
                }`}
            >
              <React.Suspense fallback={null}>
                <EmojiPicker onSelect={handleLocalEmojiSelect} disableGif={true} />
              </React.Suspense>
            </div>
          )}

          {showReactionList && (
            <div
              ref={reactionListRef}
              className={`absolute left-[36px] z-[100] w-[220px] bg-white border border-zinc-950/10 rounded-2xl shadow-2xl p-2 animate-in fade-in zoom-in duration-200 ${pickerDirection === 'up' ? 'bottom-full mb-2 origin-bottom-left' : 'top-full mt-2 origin-top-left'}`}
            >
              <div className="text-[10px] font-bold tracking-widest text-zinc-900/40 uppercase px-2 mb-2">{t('message.reactedPeople')}</div>
              <div className="max-h-[200px] overflow-y-auto no-scrollbar space-y-1">
                {reactions.map((r, i) => (
                  <div key={i} className="flex flex-col gap-2 p-2 bg-zinc-50 border border-zinc-950/5 rounded-lg">
                    <div className="flex items-center gap-2 px-1">
                      <img
                        src={(r.emoji?.startsWith(':') && r.emoji?.endsWith(':') && customEmojiMap.get(r.emoji.slice(1, -1))?.url) || getTwemojiUrl(r.emoji)}
                        alt={r.emoji}
                        className="w-4 h-4 object-contain drop-shadow-sm"
                      />
                      <span className="text-[11px] font-bold text-zinc-900/40">{r.count}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {r.users.map(u => {
                        const m = membersCache[u];
                        const name = m?.displayName || m?.firstName || u;
                        return (
                          <span key={u} className="text-[11px] font-bold text-zinc-900/70 bg-white border border-zinc-950/10 px-2 py-1 rounded shadow-sm">{name}</span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderImageAttachments = () => {
    if (imageList.length === 0) return null;

    const isSingle = imageList.length === 1;
    const isMulti = imageList.length > 1;

    const getTileSpanClass = (idx, count) => {
      if (count === 3 && idx === 0) return 'col-span-2 h-[240px]';
      if (count === 3) return 'h-[180px]';
      if (count === 2) return 'h-[240px]';
      if (count === 4) return 'h-[200px]';
      if (count === 5 && idx < 2) return 'col-span-3 h-[210px]';
      if (count === 5) return 'col-span-2 h-[150px]';
      return '';
    };

    const gridClass =
      imageList.length === 2 ? 'grid grid-cols-2 gap-1.5 max-w-[520px]' :
      imageList.length === 3 ? 'grid grid-cols-2 gap-1.5 max-w-[520px]' :
      imageList.length === 4 ? 'grid grid-cols-2 gap-1.5 max-w-[520px]' :
      imageList.length >= 5 ? 'grid grid-cols-6 gap-1.5 max-w-[520px]' :
      'inline-block';

    return (
      <div className={`mt-1 ${gridClass}`}>
        {imageList.map((srcUrl, idx) => {
          let isSpoiler = false;
          try {
            const parsed = new URL(srcUrl, 'http://localhost');
            isSpoiler = parsed.searchParams.get('spoiler') === '1';
          } catch { /* ignore */ }
          const isHiddenSpoiler = isSpoiler && !revealedSpoilers.has(idx);

          const singleImgClass = isStampImage
            ? `max-w-[160px] max-h-[160px] object-contain cursor-pointer ${isUploading ? 'opacity-50 grayscale-[0.5]' : ''}`
            : `max-w-[500px] max-h-[400px] rounded-xl border border-zinc-950/10 object-contain cursor-pointer ${isUploading ? 'opacity-50 grayscale-[0.5]' : ''} ${(srcUrl?.includes('tenor.com') || srcUrl?.includes('giphy.com') || srcUrl?.includes('klipy.com') || srcUrl?.includes('.gif')) ? 'w-full min-w-[300px] max-w-[450px]' : ''}`;

          return (
            <div
              key={`${srcUrl}-${idx}`}
              className={`relative group/img overflow-hidden ${isMulti ? `w-full rounded-xl border border-zinc-950/10 bg-zinc-100/50 dark:bg-zinc-900/50 ${getTileSpanClass(idx, imageList.length)}` : 'inline-block rounded-xl'}`}
              onClick={() => {
                if (isUploading) return;
                if (isHiddenSpoiler) {
                  setRevealedSpoilers(prev => {
                    const next = new Set(prev);
                    next.add(idx);
                    return next;
                  });
                } else {
                  onImageClick(srcUrl);
                }
              }}
            >
              {isMulti ? (
                <img
                  src={srcUrl}
                  alt={`uploaded-${idx + 1}`}
                  loading="lazy"
                  decoding="async"
                  className={`w-full h-full object-cover cursor-pointer transition-all duration-200 ${isUploading ? 'opacity-50 grayscale-[0.5]' : ''} ${isHiddenSpoiler ? 'blur-2xl scale-110 brightness-75' : ''}`}
                />
              ) : (
                <SequentialMedia
                  src={srcUrl}
                  isVideo={false}
                  alt="uploaded"
                  className={`${singleImgClass} transition-all duration-200 ${isHiddenSpoiler ? 'blur-2xl scale-105 brightness-75' : ''}`}
                  onClick={undefined}
                />
              )}

              {isHiddenSpoiler && !isUploading && (
                <div className="cursor-pointer">
                  <SpoilerMosaic src={srcUrl} />
                </div>
              )}

              {isUploading && (isSingle || idx === 0) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/25 rounded-xl pointer-events-none z-20">
                  <Loader2 className="text-white animate-spin mb-2" size={24} />
                  <span className="text-[11px] font-bold text-white tracking-widest uppercase">{uploadProgress || 0}%</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const messageIdClass = `message-id-${id}`;

  // --- Long Press Logic ---
  const touchTimerRef = useRef(null);
  const handleTouchStart = (e) => {
    if (e?.target?.closest('input, textarea, button, a')) return;
    touchTimerRef.current = setTimeout(() => {
      if (window.getSelection) {
        window.getSelection().removeAllRanges();
      }
      setControlsOpen(true);
      if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
  };
  const handleTouchEndOrMove = () => {
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
  };

  if (isContinuation) {
    return (
      <>
        <div
          {...hoverProps}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEndOrMove}
          onTouchMove={handleTouchEndOrMove}
          className={`message-row flex items-start px-4 py-[2px] group relative ${messageIdClass} ${isMentioned ? 'mention-highlight' : ''} ${isNewArrival ? (msgAccountId && msgAccountId === currentAccountId ? 'hc-message-sent' : 'hc-message-arrive') : ''} ${isUploading ? 'opacity-60' : 'opacity-100'} transition-opacity duration-140`}
        >
          {isMentioned && (
            <div className="absolute left-0 top-0 bottom-0 w-[3.5px] bg-[#f97316] rounded-r shadow-[0_0_8px_rgba(249,115,22,0.6)] z-20 pointer-events-none" />
          )}
          <div className="w-10 shrink-0 flex justify-center opacity-0 group-hover:opacity-100 select-none">
            <span className="text-[10px] font-bold text-zinc-900/40 mt-[4px] select-none whitespace-nowrap">
              {time.split(' ').pop()}
            </span>
          </div>
          <div className="ml-3 flex-1 relative min-w-0">
            {replyToElement}
            {isEditing ? (
              <div className="mt-1">
                <textarea
                  ref={editInputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  maxLength={MAX_MESSAGE_CHARS}
                  onKeyDown={handleEditKeyDown}
                  className="w-full bg-zinc-950/5 border border-zinc-950/10 rounded-lg p-2 text-[15px] font-medium text-zinc-900 focus:outline-none focus:border-[#080a11] focus:ring-2 focus:ring-[#080a11]/20 resize-none min-h-[44px]"
                  style={{ height: `${Math.max(44, editValue.split('\n').length * 22 + 20)}px` }}
                />
                <div className="text-[10px] text-zinc-900/40 mt-1 ml-1 font-medium">{t('message.editHint')}</div>
              </div>
            ) : (
              <div className={`${isEmojiOnly && !isPoll ? 'text-[24px]' : 'text-[15px]'} font-medium text-zinc-900/90 leading-[22px] whitespace-pre-line select-text cursor-auto break-words`}>
                <span className="sr-only select-text">{user}: </span>
                {elements}
                {isPoll && renderPoll()}
                {isFeedback && renderFeedback()}
                {isEdited && (
                  <span className="inline-flex relative">
                    <span 
                      ref={historyButtonRef}
                      onClick={toggleHistory}
                      className="text-[10.5px] text-zinc-900/40 hover:text-zinc-900/60 ml-2 select-none font-bold align-baseline cursor-pointer inline-flex items-center gap-1 hc-fade-in"
                      title={t('message.showEditHistory')}
                    >
                      {t('message.edited')} <ChevronDown size={12} className={`transition-transform ${showHistory ? 'rotate-180' : ''}`} />
                    </span>
                    {showHistory && editHistory.length > 0 && (
                      <div ref={historyListRef} className={`absolute left-0 z-[100] w-[280px] bg-white border border-zinc-950/10 rounded-2xl shadow-2xl p-2 ${historyDirection === 'up' ? 'bottom-full mb-1 origin-bottom-left' : 'top-full mt-1 origin-top-left'}`}>
                        <div className="flex justify-between items-center px-2 mb-2">
                          <span className="text-[10px] font-bold tracking-widest text-zinc-900/40 uppercase">{t('message.editHistory')}</span>
                        </div>
                        <div className="max-h-[200px] overflow-y-auto no-scrollbar space-y-2">
                          {[...editHistory].reverse().map((h, i) => (
                            <div key={i} className="flex flex-col gap-1 p-2 bg-zinc-50 border border-zinc-950/5 rounded-lg">
                              <span className="text-[10px] text-zinc-900/40 font-bold">{formatDate(h.timestamp)}</span>
                              <span className="text-[13px] text-zinc-900/80 whitespace-pre-wrap leading-relaxed">{h.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </span>
                )}
              </div>
            )}
            {renderImageAttachments()}
            {!imageUrl && !isVideoFile && !isAudioFile && <FileAttachment fileUrl={fileUrl} fileName={fileName} fileSize={fileSize} uploadProgress={uploadProgress} isUploading={isUploading} timestamp={timestamp} />}
            {isVideoFile && fileUrl && (
              <div className="mt-1 flex flex-col items-start gap-1">
                <MediaExpirationBadge timestamp={timestamp} />
                <div className="relative group/img inline-block max-w-full">
                <SequentialMedia
                  src={fileUrl}
                  isVideo={true}
                  alt={fileName}
                  className={`max-w-[500px] max-h-[400px] rounded-xl border border-zinc-950/10 object-contain transition-all ${isUploading ? 'opacity-50 grayscale-[0.5]' : ''}`}
                />
                {isUploading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 rounded-xl pointer-events-none">
                    <Loader2 className="text-zinc-900/80 animate-spin mb-2" size={24} />
                    <span className="text-[11px] font-bold text-zinc-900/80 tracking-widest uppercase">{uploadProgress || 0}%</span>
                  </div>
                )}
                </div>
              </div>
            )}
            {isAudioFile && fileUrl && (
              <div className="mt-2 flex flex-col gap-1 items-start">
                <MediaExpirationBadge timestamp={timestamp} className="!text-[9px] py-1 px-2 opacity-80" />
                <VoiceMessagePlayer ref={voicePlayerRef} src={fileUrl} isUploading={isUploading} />
              </div>
            )}
            {audioUrl && (
              <div className="mt-2">
                <VoiceMessagePlayer ref={voicePlayerRef} src={audioUrl} />
              </div>
            )}
            {youtubeIds.length > 0 && (
              <div className="flex flex-col gap-2 mt-1">
                {youtubeIds.map(yObj => <YouTubeEmbed key={yObj.videoId} videoId={yObj.videoId} fullUrl={yObj.fullUrl} />)}
              </div>
            )}
            {youtubeChannelUrls.length > 0 && (
              <div className="flex flex-col gap-2 mt-1">
                {youtubeChannelUrls.map(url => <YTChannelEmbed key={url} url={url} />)}
              </div>
            )}
            {twitchIds.length > 0 && (
              <div className="flex flex-col gap-2 mt-1">
                {twitchIds.map(tid => <TwitchEmbed key={tid} channelName={tid} />)}
              </div>
            )}
            {mediaUrls.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                {mediaUrls.map((media, idx) => (
                  <div key={idx} className="relative rounded-xl overflow-hidden max-w-[500px] max-h-[400px] bg-zinc-100 flex items-center justify-center border border-zinc-200">
                    {media.isVideo ? (
                      <SequentialMedia src={media.url} isVideo={true} className="max-w-full max-h-[400px] object-contain" />
                    ) : (
                      <a href={media.url} target="_blank" rel="noopener noreferrer">
                        <SequentialMedia src={media.url} isVideo={false} alt="media" className={`max-w-full max-h-[400px] object-contain ${(media.url.includes('tenor.com') || media.url.includes('giphy.com') || media.url.includes('klipy.com') || media.url.includes('.gif')) ? 'w-full min-w-[300px] max-w-[450px] rounded-xl' : ''}`} onError={(e) => e.target.style.display = 'none'} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
            {renderReactions()}
            {/* Control Bar */}
            {showControls && (
              <div className={`chat-controls-container absolute -top-5 right-6 z-10 ${controlsOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'}`}>
                <ChatControls messageId={id} channelId={channelId} onReact={(emoji) => onReact?.(id, emoji)} onReply={() => onReply && onReply({ id, user, text })} onDelete={() => onDelete?.(id)} onEdit={(isPoll || isFeedback) ? null : () => setIsEditing(true)} isOwn={msgAccountId === currentAccountId} canDelete={msgAccountId === currentAccountId || isAdmin(currentAccountId)} onOpenChange={setControlsOpen} onBookmark={handleBookmark} isBookmarked={isBookmarked} isPinned={isPinned} onTogglePin={(msgAccountId === currentAccountId || isAdmin(currentAccountId)) ? (pinned) => onTogglePin?.(id, pinned) : null} isVoiceMessage={!!(audioUrl || (isAudioFile && fileUrl))} onAddToSoundboard={() => voicePlayerRef.current?.openSoundboardModal()} />
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div
        {...hoverProps}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEndOrMove}
        onTouchMove={handleTouchEndOrMove}
        className={`message-row flex flex-col px-4 py-[2px] group mt-[17px] relative ${messageIdClass} ${isMentioned ? 'mention-highlight' : ''} ${isNewArrival ? (msgAccountId && msgAccountId === currentAccountId ? 'hc-message-sent' : 'hc-message-arrive') : ''} ${isUploading ? 'opacity-60' : 'opacity-100'} transition-opacity duration-140`}
      >
        {isMentioned && (
          <div className="absolute left-0 top-0 bottom-0 w-[3.5px] bg-[#f97316] rounded-r shadow-[0_0_8px_rgba(249,115,22,0.6)] z-20 pointer-events-none" />
        )}
        {replyToElement && (
          <div className="ml-[52px]">
            {replyToElement}
          </div>
        )}

        <div className="flex flex-col">
          <div
            className="flex items-start gap-3 cursor-pointer group/profile w-fit"
            onClick={openProfile}
          >
            <div className="relative shrink-0 mt-[2px]">
              <div className="w-10 h-10 rounded-full bg-zinc-950/10 overflow-hidden border border-zinc-950/20 shadow-sm transition-all group-hover/profile:border-zinc-950/40">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={user} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-black text-zinc-900/30 text-xs">
                    {user && user[0] ? user[0].toUpperCase() : '?'}
                  </div>
                )}
              </div>
              <div 
                className={`absolute -bottom-[2px] -right-[2px] w-3.5 h-3.5 rounded-full border-[2.5px] border-[var(--bg-chat)] pointer-events-none select-none shrink-0 ${isOnline ? 'bg-green-500' : 'bg-[#80848e]'}`} 
                style={{ boxSizing: 'border-box', backgroundClip: 'padding-box' }}
              />
            </div>
            <div className="flex items-baseline gap-2 leading-[22px]">
              <span
                ref={nameRef}
                className="font-bold text-[15px] tracking-tight group-hover/profile:underline decoration-[1px] decoration-zinc-900/60 underline-offset-[3px]"
              >
                <span style={getNameStyle(authorProfile || membersCache[msgAccountId])}>
                  {user}
                </span>
              </span>
              <span className="text-[10px] font-bold text-zinc-900/40 group-hover/profile:no-underline">{time}</span>
            </div>
          </div>

          <div className="ml-[52px] -mt-[20px] min-w-0 pr-4 relative">
            {isEditing ? (
              <div className="mt-1 relative z-10">
                <textarea
                  ref={editInputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  maxLength={MAX_MESSAGE_CHARS}
                  onKeyDown={handleEditKeyDown}
                  className="w-full bg-zinc-950/5 border border-zinc-950/10 rounded-lg p-2 text-[15px] font-medium text-zinc-900 focus:outline-none focus:border-[#080a11] focus:ring-2 focus:ring-[#080a11]/20 resize-none min-h-[44px]"
                  style={{ height: `${Math.max(44, editValue.split('\n').length * 22 + 20)}px` }}
                />
                <div className="text-[10px] text-zinc-900/40 mt-1 ml-1 font-medium">{t('message.editHint')}</div>
              </div>
            ) : (
              <div className={`${isEmojiOnly && !isPoll ? 'text-[24px]' : 'text-[15px]'} font-medium text-zinc-900/90 leading-[22px] whitespace-pre-line select-text cursor-auto break-words`}>
                {elements}
                {isPoll && renderPoll()}
                {isFeedback && renderFeedback()}
                {isEdited && (
                  <span className="inline-flex relative">
                    <span 
                      ref={historyButtonRef}
                      onClick={toggleHistory}
                      className="text-[10.5px] text-zinc-900/40 hover:text-zinc-900/60 ml-2 select-none font-bold align-baseline cursor-pointer inline-flex items-center gap-1 hc-fade-in"
                      title={t('message.showEditHistory')}
                    >
                      {t('message.edited')} <ChevronDown size={12} className={`transition-transform ${showHistory ? 'rotate-180' : ''}`} />
                    </span>
                    {showHistory && editHistory.length > 0 && (
                      <div ref={historyListRef} className={`absolute left-0 z-[100] w-[280px] bg-white border border-zinc-950/10 rounded-2xl shadow-2xl p-2 ${historyDirection === 'up' ? 'bottom-full mb-1 origin-bottom-left' : 'top-full mt-1 origin-top-left'}`}>
                        <div className="flex justify-between items-center px-2 mb-2">
                          <span className="text-[10px] font-bold tracking-widest text-zinc-900/40 uppercase">{t('message.editHistory')}</span>
                        </div>
                        <div className="max-h-[200px] overflow-y-auto no-scrollbar space-y-2">
                          {[...editHistory].reverse().map((h, i) => (
                            <div key={i} className="flex flex-col gap-1 p-2 bg-zinc-50 border border-zinc-950/5 rounded-lg">
                              <span className="text-[10px] text-zinc-900/40 font-bold">{formatDate(h.timestamp)}</span>
                              <span className="text-[13px] text-zinc-900/80 whitespace-pre-wrap leading-relaxed">{h.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </span>
                )}
              </div>
            )}

            {renderImageAttachments()}
            {!imageUrl && !isVideoFile && !isAudioFile && <FileAttachment fileUrl={fileUrl} fileName={fileName} fileSize={fileSize} uploadProgress={uploadProgress} isUploading={isUploading} timestamp={timestamp} />}
            {isVideoFile && fileUrl && (
              <div className="mt-1 flex flex-col items-start gap-1">
                <MediaExpirationBadge timestamp={timestamp} />
                <div className="relative group/img inline-block max-w-full">
                <SequentialMedia
                  src={fileUrl}
                  isVideo={true}
                  alt={fileName}
                  className={`max-w-[500px] max-h-[400px] rounded-xl border border-zinc-950/10 object-contain transition-all ${isUploading ? 'opacity-50 grayscale-[0.5]' : ''}`}
                />
                {isUploading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 rounded-xl pointer-events-none">
                    <Loader2 className="text-zinc-900/80 animate-spin mb-2" size={24} />
                    <span className="text-[11px] font-bold text-zinc-900/80 tracking-widest uppercase">{uploadProgress || 0}%</span>
                  </div>
                )}
                </div>
              </div>
            )}
            {isAudioFile && fileUrl && (
              <div className="mt-2 flex flex-col gap-1 items-start">
                <MediaExpirationBadge timestamp={timestamp} className="!text-[9px] py-1 px-2 opacity-80" />
                <VoiceMessagePlayer ref={voicePlayerRef} src={fileUrl} isUploading={isUploading} />
              </div>
            )}
            {audioUrl && (
              <div className="mt-2">
                <VoiceMessagePlayer ref={voicePlayerRef} src={audioUrl} />
              </div>
            )}
            {youtubeIds.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                {youtubeIds.map(yObj => <YouTubeEmbed key={yObj.videoId} videoId={yObj.videoId} fullUrl={yObj.fullUrl} />)}
              </div>
            )}
            {youtubeChannelUrls.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                {youtubeChannelUrls.map(url => <YTChannelEmbed key={url} url={url} />)}
              </div>
            )}
            {twitchIds.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                {twitchIds.map(tid => <TwitchEmbed key={tid} channelName={tid} />)}
              </div>
            )}
            {mediaUrls.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                {mediaUrls.map((media, idx) => (
                  <div key={idx} className="relative rounded-xl overflow-hidden max-w-[500px] max-h-[400px] bg-zinc-100 flex items-center justify-center border border-zinc-200">
                    {media.isVideo ? (
                      <SequentialMedia src={media.url} isVideo={true} className="max-w-full max-h-[400px] object-contain" />
                    ) : (
                      <a href={media.url} target="_blank" rel="noopener noreferrer">
                        <SequentialMedia src={media.url} isVideo={false} alt="media" className={`max-w-full max-h-[400px] object-contain ${(media.url.includes('tenor.com') || media.url.includes('giphy.com') || media.url.includes('klipy.com') || media.url.includes('.gif')) ? 'w-full min-w-[300px] max-w-[450px] rounded-xl' : ''}`} onError={(e) => e.target.style.display = 'none'} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
            {renderReactions()}
          </div>
        </div>

        {/* Control Bar */}
        {showControls && (
          <div className={`chat-controls-container absolute -top-5 right-6 z-10 ${controlsOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'}`}>
            <ChatControls messageId={id} channelId={channelId} onReact={(emoji) => onReact?.(id, emoji)} onReply={() => onReply && onReply({ id, user, text })} onDelete={() => onDelete?.(id)} onEdit={(isPoll || isFeedback) ? null : () => setIsEditing(true)} isOwn={msgAccountId === currentAccountId} canDelete={msgAccountId === currentAccountId || isAdmin(currentAccountId)} onOpenChange={setControlsOpen} onBookmark={handleBookmark} isBookmarked={isBookmarked} isPinned={isPinned} onTogglePin={(msgAccountId === currentAccountId || isAdmin(currentAccountId)) ? (pinned) => onTogglePin?.(id, pinned) : null} isVoiceMessage={!!(audioUrl || (isAudioFile && fileUrl))} onAddToSoundboard={() => voicePlayerRef.current?.openSoundboardModal()} />
          </div>
        )}
      </div>
    </>
  );
}, (prev, next) => {
  // コールバックは安定しているので比べない
  return prev.id === next.id &&
         prev.authorProfile === next.authorProfile &&
         prev.text === next.text &&
         prev.isEdited === next.isEdited &&
         prev.pollVotes === next.pollVotes &&
         prev.reactions === next.reactions &&
         prev.isPinned === next.isPinned &&
         prev.isContinuation === next.isContinuation &&
         prev.isOnline === next.isOnline &&
         prev.user === next.user &&
         prev.avatarUrl === next.avatarUrl &&
         prev.imageUrl === next.imageUrl &&
         prev.audioUrl === next.audioUrl &&
         prev.time === next.time &&
         prev.isUploading === next.isUploading &&
         prev.uploadProgress === next.uploadProgress &&
         prev.fileUrl === next.fileUrl &&
         prev.replyTo === next.replyTo &&
         prev.editHistory === next.editHistory &&
         prev.isNewArrival === next.isNewArrival &&
         prev.currentAccountId === next.currentAccountId;
});

Message.displayName = 'Message';
