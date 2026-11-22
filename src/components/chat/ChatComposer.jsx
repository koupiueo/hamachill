import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Reply, Upload, BarChart3, X, PenTool,
  ArrowUp, Mic, Trash2, Hash, File as FileIcon, Inbox, Users, Eye, EyeOff
} from 'lucide-react';
import SpoilerMosaic from './SpoilerMosaic';
const DrawingModal = React.lazy(() => import('./DrawingModal'));
import usePresence from '../../hooks/usePresence';
import { EMOJI_MAP, getTwemojiUrl } from '../../utils/emojiMap';
import { useCustomEmojis } from '../../utils/customEmojis';
// 絵文字ピッカーは別チャンクなので、初回クリックで「読み込み待ち＋全部描画」が重なって固まる。
// 入力欄が出たら手が空いたときに先読みしておく（ホバーでも先読み）。
const loadEmojiPicker = () => import('./EmojiPicker');
const EmojiPicker = React.lazy(loadEmojiPicker);
let emojiPreloaded = false;
function preloadEmojiPicker() {
  if (emojiPreloaded) return;
  emojiPreloaded = true;
  loadEmojiPicker().then(m => m.preloadEmojiAssets?.()).catch(() => { emojiPreloaded = false; });
}
// ＋ボタンのメニュー
const PLUS_ITEMS = [
  { key: 'upload', icon: Upload, label: t('composer.uploadFile') },
  { key: 'draw', icon: PenTool, label: t('composer.drawAndSend') },
  { key: 'poll', icon: BarChart3, label: t('composer.createPoll') },
  { key: 'feedback', icon: Inbox, label: t('composer.createFeedback') },
];

const PlusMenu = React.forwardRef(function PlusMenu({ open, onPick }, ref) {
  const { mounted, state } = usePresence(open, 120);
  if (!mounted) return null;
  return (
    <div
      ref={ref}
      role="menu"
      className={`hc-plus-menu ${state === 'exit' ? 'is-exit' : ''} absolute bottom-[calc(100%+10px)] left-2 w-[252px] p-1.5 bg-white dark:bg-[#25272a] border border-black/[0.08] dark:border-white/10 rounded-2xl z-[500]`}
    >
      {PLUS_ITEMS.map((it, i) => {
        const Icon = it.icon;
        return (
          <button
            key={it.key}
            role="menuitem"
            onClick={() => onPick(it.key)}
            style={{ '--i': i }}
            className="hc-plus-item group w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-left outline-none hover:bg-black/[0.04] dark:hover:bg-white/[0.05] focus-visible:bg-black/[0.05] dark:focus-visible:bg-white/[0.06] active:scale-[0.985] transition-[background-color,transform] duration-100"
          >
            <span className="w-6 h-6 shrink-0 flex items-center justify-center text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors duration-150">
              <Icon size={19} strokeWidth={2} />
            </span>
            <span className="text-[14.5px] font-semibold text-zinc-800 dark:text-zinc-100 truncate">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
});

// 入力欄の絵文字ボタンに出す Twemoji
const COMPOSER_EMOJI_ICON = '😀';

function EmojiPickerFallback() {
  return (
    <div className="w-[380px] h-[460px] bg-white border border-zinc-950/10 rounded-2xl shadow-2xl overflow-hidden">
      <div className="h-[92px] bg-zinc-50 border-b border-zinc-950/5" />
    </div>
  );
}
import { navigateTo } from '../../utils/nav';
import { uploadBlob } from '../../utils/uploadBlob';
import { updateChannel, sendMessage } from '../../utils/messageCache';
import { MAX_MESSAGE_CHARS, COUNTER_SHOW_REMAINING, COUNTER_WARN_REMAINING, MAX_UPLOAD_BYTES, UPLOAD_TOO_LARGE_MESSAGE } from '../../constants/limits';
import { t } from '../../i18n';

export const AVAILABLE_COMMANDS = [
  { name: '/dice', description: t('commands.dice.short') },
  { name: '/choice', description: t('commands.choice.short') },
  { name: '/coin', description: t('commands.coin.short') },
  { name: '/shrug', description: t('commands.shrug.short') },
  { name: '/tableflip', description: t('commands.tableflip.short') },
  { name: '/magic', description: t('commands.magic.short') },
  { name: '/party', description: t('commands.party.short') },
  { name: '/thinking', description: t('commands.thinking.short') },
  { name: '/dance', description: t('commands.dance.short') },
  { name: '/sleep', description: t('commands.sleep.short') },
  { name: '/love', description: t('commands.love.short') },
  { name: '/cry', description: t('commands.cry.short') }
];

export const COMMAND_HELP_MAP = {
  dice: {
    name: '/dice',
    syntax: t('commands.dice.usage'),
    badge: t('commands.dice.title'),
    examples: [
      { text: '/dice 2d6', desc: t('commands.dice.ex2d6') },
      { text: '/dice 1d100', desc: t('commands.dice.ex1d100') },
      { text: '/dice 20', desc: t('commands.dice.exSides') },
      { text: t('commands.dice.exNoteCmd'), desc: t('commands.withNote') }
    ],
    note: t('commands.dice.help')
  },
  choice: {
    name: '/choice',
    syntax: t('commands.choice.usage'),
    badge: t('commands.choice.title'),
    examples: [
      { text: t('commands.choice.exCmd1'), desc: t('commands.choice.exLabel1') },
      { text: t('commands.choice.exCmd2'), desc: t('commands.choice.exLabel2') }
    ],
    note: t('commands.choice.help')
  },
  coin: {
    name: '/coin',
    syntax: t('commands.coin.usage'),
    badge: t('commands.coin.title'),
    examples: [
      { text: '/coin', desc: t('commands.coin.exLabel') },
      { text: t('commands.coin.exNoteCmd'), desc: t('commands.withNote') }
    ],
    note: t('commands.coin.help')
  },
  shrug: {
    name: '/shrug',
    syntax: t('commands.shrug.usage'),
    badge: t('commands.shrug.title'),
    examples: [
      { text: '/shrug', desc: t('commands.kaomojiOnly') },
      { text: t('commands.shrug.exCmd'), desc: t('commands.withMessage') }
    ],
    note: t('commands.shrug.help')
  },
  tableflip: {
    name: '/tableflip',
    syntax: t('commands.tableflip.usage'),
    badge: t('commands.tableflip.title'),
    examples: [
      { text: '/tableflip', desc: t('commands.kaomojiOnly') },
      { text: t('commands.tableflip.exCmd'), desc: t('commands.withMessage') }
    ],
    note: t('commands.tableflip.help')
  },
  magic: {
    name: '/magic',
    syntax: t('commands.magic.usage'),
    badge: t('commands.magic.title'),
    examples: [
      { text: '/magic', desc: t('commands.kaomojiOnly') },
      { text: t('commands.magic.exCmd'), desc: t('commands.withMessage') }
    ],
    note: t('commands.magic.help')
  },
  party: {
    name: '/party',
    syntax: t('commands.party.usage'),
    badge: t('commands.party.title'),
    examples: [
      { text: '/party', desc: t('commands.kaomojiOnly') },
      { text: t('commands.party.exCmd'), desc: t('commands.withMessage') }
    ],
    note: t('commands.party.help')
  },
  thinking: {
    name: '/thinking',
    syntax: t('commands.thinking.usage'),
    badge: t('commands.thinking.title'),
    examples: [
      { text: '/thinking', desc: t('commands.kaomojiOnly') },
      { text: t('commands.thinking.exCmd'), desc: t('commands.withMessage') }
    ],
    note: t('commands.thinking.help')
  },
  dance: {
    name: '/dance',
    syntax: t('commands.dance.usage'),
    badge: t('commands.dance.title'),
    examples: [
      { text: '/dance', desc: t('commands.kaomojiOnly') },
      { text: t('commands.dance.exCmd'), desc: t('commands.withMessage') }
    ],
    note: t('commands.dance.help')
  },
  sleep: {
    name: '/sleep',
    syntax: t('commands.sleep.usage'),
    badge: t('commands.sleep.title'),
    examples: [
      { text: '/sleep', desc: t('commands.kaomojiOnly') },
      { text: t('commands.sleep.exCmd'), desc: t('commands.withMessage') }
    ],
    note: t('commands.sleep.help')
  },
  love: {
    name: '/love',
    syntax: t('commands.love.usage'),
    badge: t('commands.love.title'),
    examples: [
      { text: '/love', desc: t('commands.kaomojiOnly') },
      { text: t('commands.love.exCmd'), desc: t('commands.withMessage') }
    ],
    note: t('commands.love.help')
  },
  cry: {
    name: '/cry',
    syntax: t('commands.cry.usage'),
    badge: t('commands.cry.title'),
    examples: [
      { text: '/cry', desc: t('commands.kaomojiOnly') },
      { text: t('commands.cry.exCmd'), desc: t('commands.withMessage') }
    ],
    note: t('commands.cry.help')
  }
};

export const ChatComposer = React.memo(({
  channel,
  socket,
  currentUser,
  currentUserState,
  allChannels,
  uniqueMembers,
  replyingTo,
  setReplyingTo,
  scrollToBottom,
  setShowDrawingModal,
  setShowPollModal,
  setShowFeedbackModal,
  canChat
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerReady, setEmojiPickerReady] = useState(false);
  const emojiPickerPresence = usePresence(showEmojiPicker, 140);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]); // [{ id, file, url, isImage, width, height, name, size, spoiler }]
  const [editingImageId, setEditingImageId] = useState(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const [mentionState, setMentionState] = useState({ active: false, query: '', startIndex: -1 });
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);

  const [channelMentionState, setChannelMentionState] = useState({ active: false, query: '', startIndex: -1 });
  const [channelMentionSelectedIndex, setChannelMentionSelectedIndex] = useState(0);

  const [emojiSuggestionState, setEmojiSuggestionState] = useState({ active: false, query: '', startIndex: -1 });
  const [emojiSelectedIndex, setEmojiSelectedIndex] = useState(0);

  const [commandState, setCommandState] = useState({ active: false, query: '', startIndex: -1 });
  const [commandSelectedIndex, setCommandSelectedIndex] = useState(0);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [, setRecordingStream] = useState(null);
  const [isSending, setIsSending] = useState(false);

  const typingRef = useRef({ on: false, last: 0, idle: null });
  const sendTyping = useCallback((on) => {
    const t = typingRef.current;
    clearTimeout(t.idle);
    if (on) {
      const now = Date.now();
      if (!t.on || now - t.last > 3000) {
        socket?.emit('typing_status', { channelId: channel.id, user: currentUserState?.accountId || currentUser, isTyping: true });
        t.last = now;
      }
      t.on = true;
      t.idle = setTimeout(() => sendTyping(false), 5000);
    } else if (t.on) {
      t.on = false;
      socket?.emit('typing_status', { channelId: channel.id, user: currentUserState?.accountId || currentUser, isTyping: false });
    }
  }, [socket, channel.id, currentUserState?.accountId, currentUser]);

  useEffect(() => {
    return () => {
      if (typingRef.current.on) {
        typingRef.current.on = false;
        clearTimeout(typingRef.current.idle);
        socket?.emit('typing_status', { channelId: channel.id, user: currentUserState?.accountId || currentUser, isTyping: false });
      }
    };
  }, [channel.id, socket, currentUserState?.accountId, currentUser]);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const plusButtonRef = useRef(null);
  const plusMenuRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const emojiPickerRef = useRef(null);

  // 絵文字ピッカーを手が空いたときに先読み＆事前マウント準備
  useEffect(() => {
    if (!canChat) return;
    let cancelled = false;
    const ric = window.requestIdleCallback || ((fn) => setTimeout(fn, 1000));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const id = ric(() => {
      preloadEmojiPicker();
      loadEmojiPicker().then(() => { if (!cancelled) setEmojiPickerReady(true); }).catch(() => {});
    }, { timeout: 2500 });
    return () => { cancelled = true; cancel(id); };
  }, [canChat]);

  // Close floating menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showEmojiPicker && emojiPickerRef.current && !emojiPickerRef.current.contains(e.target) && !emojiButtonRef.current?.contains(e.target)) {
        setShowEmojiPicker(false);
      }
      if (showPlusMenu && plusMenuRef.current && !plusMenuRef.current.contains(e.target) && !plusButtonRef.current?.contains(e.target)) {
        setShowPlusMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker, showPlusMenu]);

  // Adjust textarea height on value change
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      const scrollH = inputRef.current.scrollHeight;
      const maxHeight = 180;
      if (scrollH > maxHeight) {
        inputRef.current.style.height = `${maxHeight}px`;
        inputRef.current.style.overflowY = 'auto';
      } else {
        inputRef.current.style.height = `${Math.max(24, scrollH)}px`;
        inputRef.current.style.overflowY = 'hidden';
      }
    }
  }, [inputValue]);

  useEffect(() => {
    const handleInsertQuote = (e) => {
      setInputValue(prev => {
        const val = prev.trimEnd();
        return (val ? val + '\n\n' : '') + e.detail;
      });
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 10);
    };
    window.addEventListener('insert_quote', handleInsertQuote);
    return () => window.removeEventListener('insert_quote', handleInsertQuote);
  }, []);

  const filteredMembers = mentionState.active
    ? uniqueMembers.filter(m => {
      const name = (m.displayName || m.firstName || m.accountId || '').toLowerCase();
      return name.includes(mentionState.query);
    }).slice(0, 8)
    : [];

  const customEmojis = useCustomEmojis(socket);
  const customEmojiMap = useMemo(() => {
    const m = new Map();
    for (const ce of customEmojis) m.set(ce.name, ce);
    return m;
  }, [customEmojis]);

  const filteredEmojis = emojiSuggestionState.active
    ? [
        ...customEmojis.map(ce => ce.name).filter(name => name.toLowerCase().includes(emojiSuggestionState.query)),
        ...Object.keys(EMOJI_MAP).filter(key => key.toLowerCase().includes(emojiSuggestionState.query)),
      ].slice(0, 8)
    : [];

  const filteredChannels = channelMentionState.active && allChannels
    ? allChannels.filter(c =>
      c.name.toLowerCase().includes(channelMentionState.query) || c.id.toLowerCase().includes(channelMentionState.query)
    ).slice(0, 8)
    : [];

  const typedCommandMatch = inputValue.match(/^\/([a-zA-Z0-9_-]+)(?:\s+(.*))?$/s);
  const activeHelpCmd = typedCommandMatch ? COMMAND_HELP_MAP[typedCommandMatch[1].toLowerCase()] : null;

  const filteredCommands = commandState.active
    ? AVAILABLE_COMMANDS.filter(c => c.name.toLowerCase().includes('/' + commandState.query))
    : [];

  const handleSelectMention = (member) => {
    const mentionText = member.accountId === 'everyone' ? '<everyone> ' : `<${member.accountId}> `;
    const before = inputValue.slice(0, mentionState.startIndex);
    const after = inputValue.slice(inputRef.current?.selectionStart || inputValue.length);
    setInputValue((before + mentionText + after).slice(0, MAX_MESSAGE_CHARS));
    setMentionState({ active: false, query: '', startIndex: -1 });
    if (window.innerWidth >= 768) inputRef.current?.focus();
  };

  const handleSelectChannelMention = (c) => {
    const mentionText = `<channel:${c.id}:${c.name}> `;
    const before = inputValue.slice(0, channelMentionState.startIndex);
    const after = inputValue.slice(inputRef.current?.selectionStart || inputValue.length);
    setInputValue((before + mentionText + after).slice(0, MAX_MESSAGE_CHARS));
    setChannelMentionState({ active: false, query: '', startIndex: -1 });
    if (window.innerWidth >= 768) inputRef.current?.focus();
  };

  const handleSelectCommand = (cmd) => {
    const after = inputValue.slice(inputRef.current?.selectionStart || inputValue.length);
    setInputValue((cmd.name + ' ' + after).slice(0, MAX_MESSAGE_CHARS));
    setCommandState({ active: false, query: '', startIndex: -1 });
    if (window.innerWidth >= 768) inputRef.current?.focus();
  };

  const handleSelectEmojiSuggestion = (emojiKey) => {
    const emojiText = `:${emojiKey}: `;
    const before = inputValue.slice(0, emojiSuggestionState.startIndex);
    const after = inputValue.slice(inputRef.current?.selectionStart || inputValue.length);
    setInputValue((before + emojiText + after).slice(0, MAX_MESSAGE_CHARS));
    setEmojiSuggestionState({ active: false, query: '', startIndex: -1 });
    if (window.innerWidth >= 768) inputRef.current?.focus();
  };

  const handleInputChange = (e) => {
    const val = e.target.value.slice(0, MAX_MESSAGE_CHARS);
    setInputValue(val);

    e.target.style.height = 'auto';
    const scrollH = e.target.scrollHeight;
    const maxHeight = 180;
    if (scrollH > maxHeight) {
      e.target.style.height = `${maxHeight}px`;
      e.target.style.overflowY = 'auto';
    } else {
      e.target.style.height = `${Math.max(24, scrollH)}px`;
      e.target.style.overflowY = 'hidden';
    }

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    const lastColonIndex = textBeforeCursor.lastIndexOf(':');
    const lastHashIndex = textBeforeCursor.lastIndexOf('#');
    const lastSlashIndex = textBeforeCursor.lastIndexOf('/');
    const effectiveSlashIndex = lastSlashIndex === 0 ? 0 : -1;

    const lastTokenIndex = Math.max(lastAtIndex, lastColonIndex, lastHashIndex, effectiveSlashIndex);

    if (lastTokenIndex === effectiveSlashIndex && effectiveSlashIndex === 0) {
      const query = textBeforeCursor.slice(1);
      if (!/\s/.test(query)) {
        setCommandState({ active: true, query: query.toLowerCase(), startIndex: 0 });
        setMentionState({ active: false, query: '', startIndex: -1 });
        setChannelMentionState({ active: false, query: '', startIndex: -1 });
        setEmojiSuggestionState({ active: false, query: '', startIndex: -1 });
      } else {
        setCommandState(prev => prev.active ? { active: false, query: '', startIndex: -1 } : prev);
      }
    } else if (lastTokenIndex === lastHashIndex && lastHashIndex !== -1 && (lastHashIndex === 0 || textBeforeCursor[lastHashIndex - 1] === ' ' || textBeforeCursor[lastHashIndex - 1] === '\n')) {
      const query = textBeforeCursor.slice(lastHashIndex + 1);
      if (!/\s/.test(query)) {
        setChannelMentionState({ active: true, query: query.toLowerCase(), startIndex: lastHashIndex });
        setMentionState({ active: false, query: '', startIndex: -1 });
        setEmojiSuggestionState({ active: false, query: '', startIndex: -1 });
        setCommandState({ active: false, query: '', startIndex: -1 });
      } else {
        setChannelMentionState(prev => prev.active ? { active: false, query: '', startIndex: -1 } : prev);
      }
    } else if (lastTokenIndex === lastAtIndex && lastAtIndex !== -1 && (lastAtIndex === 0 || textBeforeCursor[lastAtIndex - 1] === ' ' || textBeforeCursor[lastAtIndex - 1] === '\n')) {
      const query = textBeforeCursor.slice(lastAtIndex + 1);
      if (!/\s/.test(query)) {
        setMentionState({ active: true, query: query.toLowerCase(), startIndex: lastAtIndex });
        setEmojiSuggestionState({ active: false, query: '', startIndex: -1 });
        setChannelMentionState({ active: false, query: '', startIndex: -1 });
        setCommandState({ active: false, query: '', startIndex: -1 });
      } else {
        setMentionState(prev => prev.active ? { active: false, query: '', startIndex: -1 } : prev);
      }
    } else if (lastTokenIndex === lastColonIndex && lastColonIndex !== -1 && (lastColonIndex === 0 || textBeforeCursor[lastColonIndex - 1] === ' ' || textBeforeCursor[lastColonIndex - 1] === '\n')) {
      const query = textBeforeCursor.slice(lastColonIndex + 1);
      if (!/\s/.test(query) && query.length > 0) {
        setEmojiSuggestionState({ active: true, query: query.toLowerCase(), startIndex: lastColonIndex });
        setMentionState({ active: false, query: '', startIndex: -1 });
        setChannelMentionState({ active: false, query: '', startIndex: -1 });
        setCommandState({ active: false, query: '', startIndex: -1 });
      } else {
        setEmojiSuggestionState(prev => prev.active ? { active: false, query: '', startIndex: -1 } : prev);
      }
    } else {
      setMentionState(prev => prev.active ? { active: false, query: '', startIndex: -1 } : prev);
      setEmojiSuggestionState(prev => prev.active ? { active: false, query: '', startIndex: -1 } : prev);
      setChannelMentionState(prev => prev.active ? { active: false, query: '', startIndex: -1 } : prev);
      setCommandState(prev => prev.active ? { active: false, query: '', startIndex: -1 } : prev);
    }
    sendTyping(val.length > 0);
  };

  const handleSend = () => {
    let currentInput = inputValue.trim();
    const currentFiles = pendingFiles;
    if (!currentInput && currentFiles.length === 0) return;

    setIsSending(true);
    setTimeout(() => setIsSending(false), 180);

    const ch = channel.id;
    const setMsgs = (fn) => updateChannel(ch, fn);

    if (currentInput.startsWith('/')) {
      const parts = currentInput.slice(1).split(/\s+/);
      const cmdName = parts[0]?.toLowerCase();
      const cmdArgs = parts.slice(1).join(' ').trim();

      if (cmdName === 'dice') {
        const match = cmdArgs.match(/^(\d+)?(?:d(\d+))?(?:\s+(.*))?$/i);
        let count = 1;
        let sides = 6;
        let memo = '';
        if (match) {
          if (match[1] && !match[2]) {
            sides = parseInt(match[1], 10);
          } else {
            if (match[1]) count = parseInt(match[1], 10);
            if (match[2]) sides = parseInt(match[2], 10);
          }
          memo = match[3] || '';
        }
        if (isNaN(count) || count < 1) count = 1;
        if (count > 20) count = 20;
        if (isNaN(sides) || sides < 1) sides = 6;
        if (sides > 1000) sides = 1000;

        const rolls = [];
        let total = 0;
        for (let i = 0; i < count; i++) {
          const cryptoArr = new Uint32Array(1);
          window.crypto.getRandomValues(cryptoArr);
          const val = (cryptoArr[0] % sides) + 1;
          rolls.push(val);
          total += val;
        }
        const memoText = memo ? ` (${memo})` : '';
        if (count === 1) {
          currentInput = t('commands.dice.resultSingle', { sides, memoText, total });
        } else {
          currentInput = t('commands.dice.resultMulti', { count, sides, memoText, total, rolls: rolls.join(', ') });
        }
      } else if (cmdName === 'choice') {
        if (!cmdArgs) {
          currentInput = t('commands.choice.needTwo');
        } else {
          const options = cmdArgs.includes(',')
            ? cmdArgs.split(',').map(s => s.trim()).filter(Boolean)
            : cmdArgs.split(/\s+/).filter(Boolean);
          if (options.length < 2) {
            currentInput = t('commands.choice.needTwo');
          } else {
            const cryptoArr = new Uint32Array(1);
            window.crypto.getRandomValues(cryptoArr);
            const chosen = options[cryptoArr[0] % options.length];
            currentInput = t('commands.choice.result', { chosen, options: options.join(', ') });
          }
        }
      } else if (cmdName === 'coin') {
        const cryptoArr = new Uint8Array(1);
        window.crypto.getRandomValues(cryptoArr);
        const isHeads = cryptoArr[0] < 128;
        const memoText = cmdArgs ? ` (${cmdArgs})` : '';
        currentInput = t('commands.coin.result', { memoText, side: isHeads ? t('commands.coin.heads') : t('commands.coin.tails'), sideEn: isHeads ? 'Heads' : 'Tails' });
      } else if (cmdName === 'shrug') {
        const text = cmdArgs ? ` ${cmdArgs}` : '';
        currentInput = `__CMD_SHRUG__${text}`;
      } else if (cmdName === 'tableflip') {
        const text = cmdArgs ? ` ${cmdArgs}` : '';
        currentInput = `__CMD_TABLEFLIP__${text}`;
      } else if (cmdName === 'magic') {
        const text = cmdArgs ? ` ${cmdArgs}` : '';
        currentInput = `__CMD_MAGIC__${text}`;
      } else if (cmdName === 'party') {
        const text = cmdArgs ? ` ${cmdArgs}` : '';
        currentInput = `__CMD_PARTY__${text}`;
      } else if (cmdName === 'thinking') {
        const text = cmdArgs ? ` ${cmdArgs}` : '';
        currentInput = `__CMD_THINKING__${text}`;
      } else if (cmdName === 'dance') {
        const text = cmdArgs ? ` ${cmdArgs}` : '';
        currentInput = `__CMD_DANCE__${text}`;
      } else if (cmdName === 'sleep') {
        const text = cmdArgs ? ` ${cmdArgs}` : '';
        currentInput = `__CMD_SLEEP__${text}`;
      } else if (cmdName === 'love') {
        const text = cmdArgs ? ` ${cmdArgs}` : '';
        currentInput = `__CMD_LOVE__${text}`;
      } else if (cmdName === 'cry') {
        const text = cmdArgs ? ` ${cmdArgs}` : '';
        currentInput = `__CMD_CRY__${text}`;
      }
    }

    const messageId = Date.now().toString();
    const newMessage = {
      id: messageId,
      user: currentUserState.accountId,
      timestamp: Date.now(),
      text: currentInput,
      channelId: channel.id,
      replyTo: replyingTo ? {
        id: replyingTo.id,
        user: replyingTo.user,
        text: replyingTo.text
      } : null,
      reactions: []
    };

    if (currentFiles.length > 0) {
      const allImages = currentFiles.every(f => f.isImage);
      newMessage.isUploading = true;
      newMessage.uploadProgress = 0;

      const markFailed = (err) => {
        console.error('[Upload] failed:', err);
        if (err?.code === 'too_large') alert(UPLOAD_TOO_LARGE_MESSAGE);
        setMsgs(prev => prev.map(m => m.id === messageId ? { ...m, isUploading: false, error: err?.code === 'too_large' ? 'too_large_file' : 'Upload failed' } : m));
      };

      const appendMeta = (url, data, fileItem) => {
        let u = url;
        if (data?.thumbUrl && data.thumbUrl !== data.url) {
          u += `${u.includes('?') ? '&' : '?'}t=${encodeURIComponent(data.thumbUrl)}`;
        }
        if (fileItem.width && fileItem.height) {
          u += `${u.includes('?') ? '&' : '?'}w=${fileItem.width}&h=${fileItem.height}`;
        }
        if (fileItem.spoiler) {
          u += `${u.includes('?') ? '&' : '?'}spoiler=1`;
        }
        return u;
      };

      if (allImages) {
        newMessage.fileName = currentFiles[0].name;
        newMessage.fileSize = currentFiles.reduce((sum, f) => sum + (f.size || 0), 0);
        newMessage.imageUrl = currentFiles.map(f => f.url).join('|||');
        newMessage.imageWidths = currentFiles.map(f => f.width || null);
        newMessage.imageHeights = currentFiles.map(f => f.height || null);

        setMsgs(prev => [...prev, newMessage]);

        const progresses = new Array(currentFiles.length).fill(0);
        Promise.all(
          currentFiles.map((fileItem, idx) =>
            uploadBlob(fileItem.file, fileItem.name || fileItem.file?.name || `image_${idx + 1}.png`, {
              onProgress: (percent) => {
                progresses[idx] = percent;
                const avg = Math.round(progresses.reduce((a, b) => a + b, 0) / currentFiles.length);
                setMsgs(prev => prev.map(m => m.id === messageId ? { ...m, uploadProgress: avg } : m));
              },
            }).then(data => appendMeta(data.url, data, fileItem))
          )
        ).then((uploadedUrls) => {
          const finalMessage = {
            ...newMessage,
            isUploading: false,
            imageUrl: uploadedUrls.join('|||'),
          };
          setMsgs(prev => prev.map(m => m.id === messageId ? finalMessage : m));
          sendMessage(socket, { ...finalMessage, clientTempId: messageId });
          currentFiles.forEach(f => {
            if (f.url?.startsWith('blob:')) {
              try { URL.revokeObjectURL(f.url); } catch { /* ignore */ }
            }
          });
        }).catch(markFailed);
      } else {
        const single = currentFiles[0];
        newMessage.fileName = single.name;
        newMessage.fileSize = single.size;
        newMessage.imageUrl = single.isImage ? single.url : null;
        if (single.isImage && single.width && single.height) {
          newMessage.imageWidths = [single.width];
          newMessage.imageHeights = [single.height];
        }

        setMsgs(prev => [...prev, newMessage]);

        uploadBlob(single.file, single.name || single.file?.name || 'file', {
          onProgress: (percent) => {
            setMsgs(prev => prev.map(m => m.id === messageId ? { ...m, uploadProgress: percent } : m));
          },
        }).then((data) => {
          const finalUrl = appendMeta(data.url, data, single);
          const finalMessage = {
            ...newMessage,
            isUploading: false,
            imageUrl: single.isImage ? finalUrl : null,
            fileUrl: !single.isImage ? finalUrl : null,
            fileName: data.name,
            fileSize: data.size,
            fileType: data.type
          };
          setMsgs(prev => prev.map(m => m.id === messageId ? finalMessage : m));
          sendMessage(socket, { ...finalMessage, clientTempId: messageId });
        }).catch(markFailed);
      }
    } else {
      // 仮表示してから送る（ack が来るまで送信中、失敗したら再送/削除できる）
      setMsgs(prev => [...prev, newMessage]);
      sendMessage(socket, { ...newMessage, clientTempId: newMessage.id });
    }

    sendTyping(false);
    setInputValue('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setPendingFiles([]);
    setEditingImageId(null);
    setReplyingTo(null);
    setShowEmojiPicker(false);
    scrollToBottom(true);
  };

  const handleKeyDown = (e) => {
    if (activeHelpCmd && e.key === 'Escape') {
      setInputValue('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
      return;
    }
    if (mentionState.active && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionSelectedIndex(prev => (prev + 1) % filteredMembers.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionSelectedIndex(prev => (prev - 1 + filteredMembers.length) % filteredMembers.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); handleSelectMention(filteredMembers[mentionSelectedIndex]); return; }
      if (e.key === 'Escape') { setMentionState({ active: false, query: '', startIndex: -1 }); return; }
    }
    if (commandState.active && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setCommandSelectedIndex(prev => (prev + 1) % filteredCommands.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setCommandSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); handleSelectCommand(filteredCommands[commandSelectedIndex]); return; }
      if (e.key === 'Escape') { setCommandState({ active: false, query: '', startIndex: -1 }); return; }
    }
    if (channelMentionState.active && filteredChannels.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setChannelMentionSelectedIndex(prev => (prev + 1) % filteredChannels.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setChannelMentionSelectedIndex(prev => (prev - 1 + filteredChannels.length) % filteredChannels.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); handleSelectChannelMention(filteredChannels[channelMentionSelectedIndex]); return; }
      if (e.key === 'Escape') { setChannelMentionState({ active: false, query: '', startIndex: -1 }); return; }
    }
    if (emojiSuggestionState.active && filteredEmojis.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setEmojiSelectedIndex(prev => (prev + 1) % filteredEmojis.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setEmojiSelectedIndex(prev => (prev - 1 + filteredEmojis.length) % filteredEmojis.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); handleSelectEmojiSuggestion(filteredEmojis[emojiSelectedIndex]); return; }
      if (e.key === 'Escape') { setEmojiSuggestionState({ active: false, query: '', startIndex: -1 }); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // ブラウザが実際に録れる形式を選ぶ（Firefox は webm を録れず ogg になる）。
      const pickMime = () => {
        if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
        return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
          .find(t => MediaRecorder.isTypeSupported(t)) || '';
      };
      const preferredMime = pickMime();
      const mediaRecorder = preferredMime ? new MediaRecorder(stream, { mimeType: preferredMime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const ch = channel.id;
        const setMsgs = (fn) => updateChannel(ch, fn);
        const recordedType = (mediaRecorder.mimeType || preferredMime || 'audio/webm');
        const audioBlob = new Blob(audioChunksRef.current, { type: recordedType });
        const audioExt = recordedType.includes('ogg') ? 'ogg' : recordedType.includes('mp4') ? 'm4a' : 'webm';
        stream.getTracks().forEach(track => track.stop());
        const tempId = Date.now().toString();
        const optimisticUrl = URL.createObjectURL(audioBlob);
        const replyTarget = replyingTo ? { id: replyingTo.id, user: replyingTo.user, text: replyingTo.text } : null;
        const optimisticMessage = {
          id: tempId,
          user: currentUserState?.accountId || currentUser,
          timestamp: Date.now(),
          text: '',
          channelId: ch,
          audioUrl: optimisticUrl,
          _objectUrl: optimisticUrl,
          replyTo: replyTarget,
          reactions: [],
          isUploading: true
        };
        setMsgs(prev => [...prev, optimisticMessage]);
        scrollToBottom(true);
        setReplyingTo(null);

        try {
          const res = await uploadBlob(audioBlob, `voice_${Date.now()}.${audioExt}`, { kind: 'voice' });
          sendMessage(socket, {
            ...optimisticMessage,
            audioUrl: res.url,
            clientTempId: tempId,
          });
        } catch (err) {
          try { URL.revokeObjectURL(optimisticUrl); } catch { /* ignore */ }
          console.error('[Voice] upload failed:', err);
          alert(err?.code === 'too_large' ? UPLOAD_TOO_LARGE_MESSAGE : t('composer.voiceSendFailed'));
          setMsgs(prev => prev.filter(m => m.id !== tempId));
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      setRecordingStream(stream);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          if (prev >= 14) {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              mediaRecorderRef.current.stop();
              setIsRecording(false);
              clearInterval(recordingTimerRef.current);
            }
            return 15;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert(t('composer.micDenied'));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
      setRecordingStream(null);
    }
  };

  const discardRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
      setRecordingStream(null);
    }
  };

  const formatRecordingTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const MAX_STOCK_IMAGES = 5;

  const createPendingId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const addFilesToStock = useCallback((rawFiles) => {
    const files = Array.from(rawFiles || []).filter(Boolean);
    if (files.length === 0) return;

    const validFiles = [];
    let oversized = false;
    for (const file of files) {
      if (file.size > MAX_UPLOAD_BYTES) {
        oversized = true;
      } else {
        validFiles.push(file);
      }
    }
    if (oversized) alert(UPLOAD_TOO_LARGE_MESSAGE);
    if (validFiles.length === 0) return;

    const imageFiles = validFiles.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length > 0) {
      imageFiles.forEach((file) => {
        const url = URL.createObjectURL(file);
        const img = new window.Image();
        const pushImg = (width, height) => {
          setPendingFiles(prev => {
            const currentImages = prev.filter(p => p.isImage);
            if (currentImages.length >= MAX_STOCK_IMAGES) {
              try { URL.revokeObjectURL(url); } catch { /* ignore */ }
              return prev;
            }
            return [
              ...currentImages,
              {
                id: createPendingId(),
                file,
                url,
                isImage: true,
                width,
                height,
                name: file.name || `image_${Date.now()}.png`,
                size: file.size,
                spoiler: false,
              },
            ];
          });
        };
        img.onload = () => pushImg(img.width, img.height);
        img.onerror = () => pushImg(null, null);
        img.src = url;
      });
      return;
    }

    // 動画やその他ファイルは 1 件としてストック
    const file = validFiles[0];
    if (file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata';
      const setVideo = (width, height) => {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
        setPendingFiles([{ id: createPendingId(), file, url: null, isImage: false, width, height, name: file.name, size: file.size, spoiler: false }]);
      };
      v.onloadedmetadata = () => setVideo(v.videoWidth || null, v.videoHeight || null);
      v.onerror = () => setVideo(null, null);
      v.src = url;
    } else {
      setPendingFiles([{ id: createPendingId(), file, url: null, isImage: false, name: file.name, size: file.size, spoiler: false }]);
    }
  }, []);

  const removePendingFile = useCallback((id) => {
    setPendingFiles(prev => {
      const target = prev.find(p => p.id === id);
      if (target?.url?.startsWith('blob:')) {
        try { URL.revokeObjectURL(target.url); } catch { /* ignore */ }
      }
      return prev.filter(p => p.id !== id);
    });
    setEditingImageId(prev => (prev === id ? null : prev));
  }, []);

  const togglePendingSpoiler = useCallback((id) => {
    setPendingFiles(prev => prev.map(p => (p.id === id ? { ...p, spoiler: !p.spoiler } : p)));
  }, []);

  const handleEditedImageSave = useCallback((blob) => {
    const targetId = editingImageId;
    setEditingImageId(null);
    if (!targetId || !blob) return;
    const url = URL.createObjectURL(blob);
    const img = new window.Image();
    const applyEdit = (width, height) => {
      setPendingFiles(prev => prev.map(p => {
        if (p.id !== targetId) return p;
        if (p.url?.startsWith('blob:')) {
          try { URL.revokeObjectURL(p.url); } catch { /* ignore */ }
        }
        const baseName = (p.name || 'image').replace(/\.[^/.]+$/, '');
        const editedFile = new File([blob], `${baseName}_edited.png`, { type: 'image/png' });
        return {
          ...p,
          file: editedFile,
          url,
          width,
          height,
          size: editedFile.size,
          name: editedFile.name,
        };
      }));
    };
    img.onload = () => applyEdit(img.width, img.height);
    img.onerror = () => applyEdit(null, null);
    img.src = url;
  }, [editingImageId]);

  const pendingFilesRef = useRef(pendingFiles);
  useEffect(() => { pendingFilesRef.current = pendingFiles; }, [pendingFiles]);

  // ブラウザ全体のどこにでもファイルをドラッグ＆ドロップして追加できるようにする
  useEffect(() => {
    if (!canChat) return;
    let dragDepth = 0;

    const hasFiles = (e) => {
      const types = e.dataTransfer?.types;
      return types && (Array.from(types).includes('Files') || types.contains?.('Files'));
    };

    const onDragEnter = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth += 1;
      setIsDraggingFile(true);
    };

    const onDragOver = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const onDragLeave = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setIsDraggingFile(false);
    };

    const onDrop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = 0;
      setIsDraggingFile(false);
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length === 0) return;
      const currentImageCount = pendingFilesRef.current.filter(p => p.isImage).length;
      const incomingImages = files.filter(f => f.type.startsWith('image/'));
      if (incomingImages.length > 0 && currentImageCount + incomingImages.length > MAX_STOCK_IMAGES) {
        alert(t('composer.maxPhotos', { max: MAX_STOCK_IMAGES }));
      }
      addFilesToStock(files);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      setIsDraggingFile(false);
    };
  }, [canChat, addFilesToStock]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const currentImageCount = pendingFiles.filter(p => p.isImage).length;
    const incomingImages = files.filter(f => f.type.startsWith('image/'));
    if (incomingImages.length > 0 && currentImageCount + incomingImages.length > MAX_STOCK_IMAGES) {
      alert(t('composer.maxPhotos', { max: MAX_STOCK_IMAGES }));
    }
    addFilesToStock(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedFiles = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1 || items[i].type.startsWith('video/')) {
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) {
      const currentImageCount = pendingFiles.filter(p => p.isImage).length;
      const incomingImages = pastedFiles.filter(f => f.type.startsWith('image/'));
      if (incomingImages.length > 0 && currentImageCount + incomingImages.length > MAX_STOCK_IMAGES) {
        alert(t('composer.maxPhotos', { max: MAX_STOCK_IMAGES }));
      }
      addFilesToStock(pastedFiles);
    }
  };

  const addEmoji = useCallback((data) => {
    if (typeof data === 'string') {
      setInputValue(prev => prev + data);
      if (window.innerWidth >= 768) inputRef.current?.focus();
    } else if (data?.type === 'gif' || data?.type === 'stamp') {
      const newMessage = {
        id: Date.now().toString(),
        user: currentUserState.accountId,
        timestamp: Date.now(),
        text: '',
        channelId: channel.id,
        imageUrl: data.url,
        replyTo: replyingTo ? {
          id: replyingTo.id,
          user: replyingTo.user,
          text: replyingTo.text
        } : null,
        reactions: []
      };

      updateChannel(channel.id, prev => [...prev, newMessage]);
      sendMessage(socket, { ...newMessage, clientTempId: newMessage.id });
      setReplyingTo(null);
      setShowEmojiPicker(false);
      scrollToBottom(true);
    }
  }, [currentUserState.accountId, channel.id, replyingTo, socket, setReplyingTo, scrollToBottom]);

  const hasContent = inputValue.trim().length > 0 || pendingFiles.length > 0;
  const editingImage = editingImageId ? pendingFiles.find(p => p.id === editingImageId) : null;

  return (
    <>
      {canChat ? (
        <>
          {replyingTo && (
            <div className="mb-3 px-4 py-2 bg-zinc-100/90 dark:bg-zinc-900/90 backdrop-blur-md rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between text-xs hc-rise-in">
              <div className="flex items-center gap-3 truncate min-w-0">
                <div className="w-5 h-5 rounded-lg bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 flex items-center justify-center shrink-0">
                  <Reply size={12} />
                </div>
                <span className="text-zinc-400 font-medium">{t('composer.replyingTo')}</span>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">@{replyingTo.user}</span>
                <span className="text-zinc-600 dark:text-zinc-400 truncate font-normal">{replyingTo.text}</span>
              </div>
              <button
                onClick={() => setReplyingTo(null)}
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors ml-2 shrink-0"
                title={t('composer.cancelReply')}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {pendingFiles.length > 0 && (
            <div className="mb-3 p-2.5 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md rounded-2xl border border-black/[0.08] dark:border-white/[0.08] shadow-sm hc-scale-in">
              {pendingFiles.every(f => f.isImage) ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                      {t('composer.attachedImages', { count: pendingFiles.length, max: MAX_STOCK_IMAGES })}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        pendingFiles.forEach(f => {
                          if (f.url?.startsWith('blob:')) {
                            try { URL.revokeObjectURL(f.url); } catch { /* ignore */ }
                          }
                        });
                        setPendingFiles([]);
                      }}
                      className="text-[11px] font-bold text-zinc-400 hover:text-red-500 transition-colors"
                    >
                      {t('composer.removeAll')}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {pendingFiles.map((item) => (
                      <div
                        key={item.id}
                        className="relative w-28 h-28 rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-zinc-100 dark:bg-zinc-800 shrink-0 group shadow-sm"
                      >
                        <img
                          src={item.url}
                          alt={item.name}
                          className={`w-full h-full object-cover transition-all duration-150 ${item.spoiler ? 'blur-xl scale-110 brightness-75' : ''}`}
                        />
                        {item.spoiler && (
                          <div className="pointer-events-none">
                            <SpoilerMosaic src={item.url} compact />
                          </div>
                        )}
                        <div className="absolute top-1.5 right-1.5 z-30 flex items-center gap-1 bg-zinc-900/75 backdrop-blur-sm rounded-lg p-0.5 shadow-md border border-white/10">
                          <button
                            type="button"
                            onClick={() => togglePendingSpoiler(item.id)}
                            className={`p-1 rounded-md transition-colors ${item.spoiler ? 'bg-amber-500 text-white' : 'text-white/85 hover:text-white hover:bg-white/15'}`}
                            title={item.spoiler ? t('composer.unmarkSpoiler') : t('composer.markSpoiler')}
                          >
                            {item.spoiler ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingImageId(item.id)}
                            className="p-1 rounded-md text-white/85 hover:text-white hover:bg-white/15 transition-colors"
                            title={t('composer.drawOnImage')}
                          >
                            <PenTool size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removePendingFile(item.id)}
                            className="p-1 rounded-md text-white/85 hover:text-red-400 hover:bg-white/15 transition-colors"
                            title={t('common.delete')}
                          >
                            <X size={13} />
                          </button>
                        </div>
                        <div className="absolute bottom-0 inset-x-0 px-1.5 py-0.5 bg-gradient-to-t from-black/70 to-transparent pointer-events-none">
                          <p className="text-[10px] font-medium text-white/90 truncate">{item.name}</p>
                        </div>
                      </div>
                    ))}
                    {pendingFiles.length < MAX_STOCK_IMAGES && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-28 h-28 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 dark:hover:border-zinc-500 flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors shrink-0"
                        title={t('composer.addPhoto')}
                      >
                        <Plus size={20} />
                        <span className="text-[11px] font-bold">{t('common.add')}</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl border border-black/10 dark:border-white/10 flex items-center justify-center shrink-0 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                    <FileIcon size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200 truncate">{pendingFiles[0].name || t('composer.sendFile')}</p>
                    {pendingFiles[0].size && <p className="text-[11px] text-zinc-400 font-mono">{(pendingFiles[0].size / 1024 / 1024).toFixed(2)} MB</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => removePendingFile(pendingFiles[0].id)}
                    className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    title={t('composer.removeFile')}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>
          )}
          {mentionState.active && filteredMembers.length > 0 && (
            <div className="absolute bottom-[calc(100%+10px)] left-4 mb-2 w-[260px] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-black/[0.08] dark:border-white/[0.1] rounded-2xl shadow-[0_16px_40px_-8px_rgba(0,0,0,0.2)] overflow-hidden z-[500] animate-in fade-in zoom-in-95 duration-150 p-1">
              <div className="px-3 py-2 text-[10px] font-black tracking-widest text-zinc-400 uppercase">{t('composer.mentionMember')}</div>
              <div className="max-h-[220px] overflow-y-auto no-scrollbar space-y-1">
                {filteredMembers.map((m, idx) => (
                  <button
                    key={m.accountId}
                    onClick={() => handleSelectMention(m)}
                    onMouseEnter={() => setMentionSelectedIndex(idx)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all ${idx === mentionSelectedIndex ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 shadow-sm' : 'hover:bg-zinc-950/5 dark:hover:bg-white/5 text-zinc-800 dark:text-zinc-200'}`}
                  >
                    <div className="w-6 h-6 rounded-full bg-zinc-950/10 dark:bg-white/10 shrink-0 overflow-hidden border border-black/5 flex items-center justify-center">
                      {m._isEveryone ? <Users size={12} className="text-orange-500" /> : m.avatarUrl ? <img src={m.avatarUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-black text-zinc-900/30 text-[10px]">{m.displayName?.[0] || m.firstName?.[0] || '?'}</div>}
                    </div>
                    <span className={`text-[13px] font-bold truncate ${m._isEveryone ? 'text-orange-600 dark:text-orange-400' : ''}`}>{m._isEveryone ? '@everyone' : m.displayName || m.firstName || m.accountId}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {channelMentionState.active && filteredChannels.length > 0 && (
            <div className="absolute bottom-[calc(100%+10px)] left-4 mb-2 w-[260px] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-black/[0.08] dark:border-white/[0.1] rounded-2xl shadow-[0_16px_40px_-8px_rgba(0,0,0,0.2)] overflow-hidden z-[500] animate-in fade-in zoom-in-95 duration-150 p-1">
              <div className="px-3 py-2 text-[10px] font-black tracking-widest text-zinc-400 uppercase">{t('composer.linkChannel')}</div>
              <div className="max-h-[220px] overflow-y-auto no-scrollbar space-y-1">
                {filteredChannels.map((c, idx) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectChannelMention(c)}
                    onMouseEnter={() => setChannelMentionSelectedIndex(idx)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all ${idx === channelMentionSelectedIndex ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 shadow-sm' : 'hover:bg-zinc-950/5 dark:hover:bg-white/5 text-zinc-800 dark:text-zinc-200'}`}
                  >
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${idx === channelMentionSelectedIndex ? 'bg-zinc-300 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100' : 'bg-zinc-100 dark:bg-white/10 text-zinc-400'}`}>
                      <Hash size={13} />
                    </div>
                    <span className="text-[13px] font-bold truncate">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Active Command Syntax & Examples Helper */}
          {activeHelpCmd && (
            <div className="absolute bottom-[calc(100%+8px)] left-2 right-2 md:left-4 md:right-auto md:w-[440px] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-black/[0.08] dark:border-white/[0.1] rounded-2xl shadow-[0_16px_40px_-8px_rgba(0,0,0,0.22)] p-3 z-[500] animate-in fade-in slide-in-from-bottom-2 duration-150 select-none">
              <div className="flex items-center justify-between pb-2 border-b border-black/[0.06] dark:border-white/[0.08]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-black tracking-wide px-2 py-1 rounded-full bg-zinc-900/5 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 shrink-0">
                    {activeHelpCmd.badge}
                  </span>
                  <code className="text-[12.5px] font-mono font-bold text-emerald-600 dark:text-emerald-400 truncate">
                    {activeHelpCmd.syntax}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInputValue('');
                    if (inputRef.current) inputRef.current.style.height = 'auto';
                  }}
                  className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 px-1 py-1 rounded ml-1 shrink-0"
                  title={t('common.close')}
                >
                  ✕
                </button>
              </div>

              <div className="mt-2 text-[12px] text-zinc-600 dark:text-zinc-300 leading-snug">
                {activeHelpCmd.note}
              </div>

              <div className="mt-3">
                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                  {t('composer.clickableExamples')}
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeHelpCmd.examples.map((ex, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setInputValue(ex.text);
                        if (inputRef.current) {
                          inputRef.current.focus();
                          inputRef.current.style.height = 'auto';
                        }
                      }}
                      className="flex items-center gap-2 px-3 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/10 border border-black/5 dark:border-white/5 transition-all text-left group active:scale-95"
                    >
                      <span className="text-[11.5px] font-mono font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                        {ex.text}
                      </span>
                      <span className="text-[10.5px] text-zinc-400 dark:text-zinc-500">
                        ({ex.desc})
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!activeHelpCmd && commandState.active && filteredCommands.length > 0 && (
            <div className="absolute bottom-[calc(100%+10px)] left-4 mb-2 w-[340px] max-w-[calc(100vw-32px)] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-black/[0.08] dark:border-white/[0.1] rounded-2xl shadow-[0_16px_40px_-8px_rgba(0,0,0,0.2)] overflow-hidden z-[500] animate-in fade-in zoom-in-95 duration-150 p-1">
              <div className="px-3 py-2 text-[10px] font-black tracking-widest text-zinc-400 uppercase">{t('composer.commandList')}</div>
              <div className="max-h-[220px] overflow-y-auto no-scrollbar space-y-1">
                {filteredCommands.map((cmd, idx) => (
                  <button
                    key={cmd.name}
                    onClick={() => handleSelectCommand(cmd)}
                    onMouseEnter={() => setCommandSelectedIndex(idx)}
                    className={`w-full flex flex-col gap-1 px-3 py-2 rounded-xl text-left transition-all ${idx === commandSelectedIndex ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 shadow-sm' : 'hover:bg-zinc-950/5 dark:hover:bg-white/5 text-zinc-800 dark:text-zinc-200'}`}
                  >
                    <span className="text-[13px] font-bold truncate font-mono">{cmd.name}</span>
                    <span className="text-[11px] text-zinc-400 truncate">{cmd.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat Input Dock */}
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple className="hidden" />

          <div className="chat-input-dock relative w-full flex items-center gap-2 rounded-2xl px-3 py-2 min-h-[56px] transition-all duration-150">
            {/* Plus Button */}
            <button
              ref={plusButtonRef}
              onClick={() => setShowPlusMenu(!showPlusMenu)}
              className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all shrink-0 active:scale-95 active:bg-black/5 dark:active:bg-white/10 ${showPlusMenu
                ? 'bg-black/5 dark:bg-white/10 text-zinc-950 dark:text-white'
                : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white'
                }`}
              title={t('composer.actionMenu')}
            >
              <Plus
                size={24}
                className={`transition-transform duration-300 ${showPlusMenu ? 'rotate-45' : 'rotate-0'}`}
                style={{ transitionTimingFunction: 'cubic-bezier(0.34, 2, 0.64, 1)' }}
              />
            </button>

            {/* Textarea */}
            <div className="flex-1 flex items-center min-w-0">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={t('composer.placeholder', { name: channel.name })}
                className="w-full bg-transparent border-none focus:ring-0 outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-[14.5px] font-medium leading-[22px] resize-none chat-input-textarea px-2 py-1 max-h-[180px] overflow-y-hidden block my-0"
                rows={1}
                maxLength={MAX_MESSAGE_CHARS}
              />
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-1 shrink-0">
              {inputValue.length >= MAX_MESSAGE_CHARS - COUNTER_SHOW_REMAINING && (
                <span className={`text-[11px] font-mono px-2 py-1 rounded font-bold select-none mr-1 ${inputValue.length >= MAX_MESSAGE_CHARS - COUNTER_WARN_REMAINING ? 'text-red-500 bg-red-500/10' : 'text-zinc-400'
                  }`}>
                  {MAX_MESSAGE_CHARS - inputValue.length}
                </span>
              )}

              {isRecording ? (
                <div className="flex items-center gap-2 px-3 py-1 bg-red-50 dark:bg-red-950/40 rounded-md border border-red-200 dark:border-red-900/50 mr-1">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  <span className="text-[13px] font-bold text-red-500 tabular-nums w-9 text-center">{formatRecordingTime(recordingDuration)}</span>
                  <button onClick={discardRecording} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded transition-all" title={t('composer.discardRecording')}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    ref={emojiButtonRef}
                    onClick={() => {
                      setShowEmojiPicker(!showEmojiPicker);
                      setShowPlusMenu(false);
                    }}
                    className={`group w-9 h-9 flex items-center justify-center rounded-xl transition-all shrink-0 active:scale-95 active:bg-black/5 dark:active:bg-white/10 ${showEmojiPicker
                      ? 'bg-black/5 dark:bg-white/10 text-zinc-950 dark:text-white'
                      : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white'
                      }`}
                    onPointerEnter={preloadEmojiPicker}
                    onFocus={preloadEmojiPicker}
                    title={t('composer.emojiAndStamps')}
                    aria-label={t('composer.emojiAndStamps')}
                    aria-expanded={showEmojiPicker}
                  >
                    {/* Twemoji 画像。普段は白黒、ホバー中とピッカーを開いている間はカラー */}
                    <img
                      src={getTwemojiUrl(COMPOSER_EMOJI_ICON)}
                      alt=""
                      draggable={false}
                      className={`w-[22px] h-[22px] object-contain pointer-events-none select-none transition-[filter,opacity] duration-200 ease-out ${showEmojiPicker ? 'grayscale-0 opacity-100' : 'grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 group-focus-visible:grayscale-0 group-focus-visible:opacity-100'}`}
                    />
                  </button>
                  <button
                    onClick={startRecording}
                    className="w-9 h-9 flex items-center justify-center rounded-xl text-zinc-600 dark:text-zinc-300 hover:text-red-500 dark:hover:text-red-400 transition-all shrink-0 active:scale-95 active:bg-black/5 dark:active:bg-white/10"
                    title={t('composer.recordVoice')}
                  >
                    <Mic size={20} />
                  </button>
                </>
              )}

              {isRecording && (
                <button
                  onClick={stopRecording}
                  className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm transition-all shrink-0 active:scale-95 bg-zinc-900 hover:bg-black dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 cursor-pointer"
                  title={t('composer.finishRecording')}
                >
                  <ArrowUp size={20} className={`stroke-[2.5] ${isSending ? 'hc-send-fly' : ''}`} />
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center py-4 bg-zinc-950/[0.03] border border-zinc-950/[0.05] rounded-xl text-[13px] font-bold text-zinc-500 select-none">
          {t('composer.announcementsOnly')}
        </div>
      )}

      {canChat && emojiSuggestionState.active && filteredEmojis.length > 0 && (
        <div className="absolute bottom-[calc(100%+12px)] left-4 w-[280px] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-black/[0.08] dark:border-white/[0.1] rounded-2xl shadow-[0_16px_40px_-8px_rgba(0,0,0,0.2)] overflow-hidden z-[500] animate-in fade-in zoom-in-95 duration-150 p-1">
          <div className="px-3 py-2 text-[10px] font-black tracking-widest text-zinc-400 uppercase">{t('composer.emojiSuggestions')}</div>
          <div className="max-h-[200px] overflow-y-auto p-1 space-y-1 scrollbar-thin scrollbar-thumb-zinc-200">
            {filteredEmojis.map((key, idx) => {
              const custom = customEmojiMap.get(key);
              const char = EMOJI_MAP[key];
              return (
                <button
                  key={key}
                  onClick={() => handleSelectEmojiSuggestion(key)}
                  onMouseEnter={() => setEmojiSelectedIndex(idx)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all ${idx === emojiSelectedIndex ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 shadow-sm' : 'hover:bg-zinc-950/5 dark:hover:bg-white/5 text-zinc-800 dark:text-zinc-200'}`}
                >
                  <div className="w-5 h-5 shrink-0 flex items-center justify-center text-[16px]">
                    <img src={custom ? custom.url : getTwemojiUrl(char)} alt={key} className="w-full h-full object-contain" />
                  </div>
                  <span className="font-bold text-[13px] truncate font-mono">:{key}:</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {canChat && (
        <PlusMenu
          ref={plusMenuRef}
          open={showPlusMenu}
          onPick={(key) => {
            setShowPlusMenu(false);
            if (key === 'upload') fileInputRef.current?.click();
            else if (key === 'draw') setShowDrawingModal(true);
            else if (key === 'poll') setShowPollModal(true);
            else if (key === 'feedback') setShowFeedbackModal(true);
          }}
        />
      )}



      {canChat && (emojiPickerPresence.mounted || emojiPickerReady) && (
        <div
          ref={emojiPickerRef}
          className={
            emojiPickerPresence.mounted
              ? `absolute bottom-[calc(100%+8px)] right-4 z-[500] origin-bottom-right ${
                  emojiPickerPresence.state === 'exit' ? 'hc-scale-out pointer-events-none' : 'hc-scale-in'
                }`
              : 'hidden'
          }
        >
          <React.Suspense fallback={<EmojiPickerFallback />}>
            <EmojiPicker onSelect={addEmoji} socket={socket} isOpen={showEmojiPicker} />
          </React.Suspense>
        </div>
      )}
      {canChat && isDraggingFile && createPortal(
        <div className="fixed inset-0 z-[2500] bg-black/45 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-none animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border-2 border-dashed border-zinc-400 dark:border-zinc-500 rounded-3xl px-10 py-8 shadow-2xl flex flex-col items-center gap-3 text-center max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-200">
              <Upload size={28} />
            </div>
            <div className="text-base font-extrabold text-zinc-900 dark:text-zinc-100">
              {t('composer.dropToAdd')}
            </div>
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {channel?.name ? t('composer.dropHint', { name: channel.name, max: MAX_STOCK_IMAGES }) : t('composer.dropHintMax', { max: MAX_STOCK_IMAGES })}
            </div>
          </div>
        </div>,
        document.body
      )}
      {canChat && editingImage && (
        <React.Suspense fallback={null}>
          <DrawingModal
            isOpen={!!editingImage}
            onClose={() => setEditingImageId(null)}
            onSend={handleEditedImageSave}
            initialImageUrl={editingImage.url}
            title={t('composer.drawOnImageTitle')}
            submitLabel={t('common.save')}
          />
        </React.Suspense>
      )}
    </>
  );
});

ChatComposer.displayName = 'ChatComposer';

export default ChatComposer;
