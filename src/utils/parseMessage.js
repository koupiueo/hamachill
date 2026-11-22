import { sanitizeUrl, extractYoutubeId, extractTwitchId, extractYoutubeChannelUrl } from './sanitize';
import { EMOJI_MAP } from './emojiMap';
import { t } from '../i18n';
import { localizeSystemText } from './systemMessages';

export const emojiRegexRaw = /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\uD83C[\uDFFB-\uDFFF])?)*|[\u{1F1E6}-\u{1F1FF}]{2}|[0-9#*]\uFE0F?\u20E3/u;
export const urlRegexRaw = /https?:\/\/[^\s]+/;
export const msgLinkRegexRaw = /<\d{13}(?:_[a-zA-Z0-9_]+)?>/;
export const userMentionRegexRaw = /<(?:user_[a-zA-Z0-9_]+|hamachill|everyone)>/;
export const channelMentionRegexRaw = /<channel:[a-zA-Z0-9_-]+:[^>]+>/;
export const pinListRegexRaw = /<pin_list>[^<]+<\/pin_list>/;

export const emojiExact = new RegExp(`^${emojiRegexRaw.source}$`, 'u');
export const urlExact = new RegExp(`^${urlRegexRaw.source}$`);
export const msgLinkExact = new RegExp(`^${msgLinkRegexRaw.source}$`);
export const userMentionExact = new RegExp(`^${userMentionRegexRaw.source}$`);
export const channelMentionExact = new RegExp(`^${channelMentionRegexRaw.source}$`);
export const pinListExact = new RegExp(`^${pinListRegexRaw.source}$`);

export const combinedRegex = new RegExp(`(${emojiRegexRaw.source}|${urlRegexRaw.source}|${msgLinkRegexRaw.source}|${userMentionRegexRaw.source}|${channelMentionRegexRaw.source}|${pinListRegexRaw.source})`, 'gu');
export const customEmojiRegex = /:([a-zA-Z0-9_+-]+):/g;
export const emojiRegexGlobal = new RegExp(emojiRegexRaw.source, 'gu');
export const urlRegexGlobal = new RegExp(urlRegexRaw.source, 'g');
export const mdRegex = /(\|\|.*?\|\||\*\*.*?\*\*|__.*?__|-(?!\s)[^-]+(?<!\s)-|^#{1,3}\s.*$|(?:^> .*$\n?)+)/m;

export function parseUncached(rawText, author) {
  const text = localizeSystemText(rawText, author);
  const isCommandShrug = typeof text === 'string' && text.includes('__CMD_SHRUG__');
  const isCommandTableflip = typeof text === 'string' && text.includes('__CMD_TABLEFLIP__');
  const isCommandMagic = typeof text === 'string' && text.includes('__CMD_MAGIC__');
  const isCommandParty = typeof text === 'string' && text.includes('__CMD_PARTY__');
  const isCommandThinking = typeof text === 'string' && text.includes('__CMD_THINKING__');
  const isCommandDance = typeof text === 'string' && text.includes('__CMD_DANCE__');
  const isCommandSleep = typeof text === 'string' && text.includes('__CMD_SLEEP__');
  const isCommandLove = typeof text === 'string' && text.includes('__CMD_LOVE__');
  const isCommandCry = typeof text === 'string' && text.includes('__CMD_CRY__');

  let isPoll = false;
  let pollData = null;
  let isFeedback = false;
  let feedbackData = null;
  let textContent = text;

  if (typeof text === 'string') {
    if (text.startsWith('__HYPIXEL__') || text.startsWith('__HOPLITE__') || text.includes('__SVG__')) {
      // 古いバージョンのカード形式（今は作られない）
      textContent = t('message.featureRemoved');
    } else if (text.includes('__POLL__')) {
      const parts = text.split('__POLL__');
      textContent = parts[0];
      try {
        const parsed = JSON.parse(parts[1]);
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.options) && typeof parsed.question === 'string') {
          // 選択肢は文字列にそろえる（オブジェクトが混ざると描画で落ちる。投票の番号がずれないよう除外はしない）
          pollData = { ...parsed, options: parsed.options.map(o => (typeof o === 'string' ? o : (typeof o === 'number' ? String(o) : t('message.invalidOption')))) };
          isPoll = true;
        }
      } catch { /* ignore */ }
    } else if (text.includes('__FEEDBACK__')) {
      const parts = text.split('__FEEDBACK__');
      textContent = parts[0];
      try {
        const parsed = JSON.parse(parts[1]);
        if (parsed && typeof parsed === 'object' && typeof parsed.title === 'string') {
          feedbackData = parsed;
          isFeedback = true;
        }
      } catch { /* ignore */ }
    }

    if (isCommandShrug) textContent = textContent.replaceAll('__CMD_SHRUG__', '').trimEnd();
    if (isCommandTableflip) textContent = textContent.replaceAll('__CMD_TABLEFLIP__', '').trimEnd();
    if (isCommandMagic) textContent = textContent.replaceAll('__CMD_MAGIC__', '').trimEnd();
    if (isCommandParty) textContent = textContent.replaceAll('__CMD_PARTY__', '').trimEnd();
    if (isCommandThinking) textContent = textContent.replaceAll('__CMD_THINKING__', '').trimEnd();
    if (isCommandDance) textContent = textContent.replaceAll('__CMD_DANCE__', '').trimEnd();
    if (isCommandSleep) textContent = textContent.replaceAll('__CMD_SLEEP__', '').trimEnd();
    if (isCommandLove) textContent = textContent.replaceAll('__CMD_LOVE__', '').trimEnd();
    if (isCommandCry) textContent = textContent.replaceAll('__CMD_CRY__', '').trimEnd();
  }

  const special = {
    isPoll,
    pollData,
    isFeedback,
    feedbackData,
    commands: {
      shrug: isCommandShrug,
      tableflip: isCommandTableflip,
      magic: isCommandMagic,
      party: isCommandParty,
      thinking: isCommandThinking,
      dance: isCommandDance,
      sleep: isCommandSleep,
      love: isCommandLove,
      cry: isCommandCry
    },
    isCommandShrug,
    isCommandTableflip,
    isCommandMagic,
    isCommandParty,
    isCommandThinking,
    isCommandDance,
    isCommandSleep,
    isCommandLove,
    isCommandCry
  };

  if (!textContent) {
    return {
      special,
      textContent,
      tokens: [],
      youtubeIds: [],
      twitchIds: [],
      youtubeChannelUrls: [],
      mediaUrls: [],
      isEmojiOnly: false
    };
  }

  const parsedContent = textContent.replace(customEmojiRegex, (match, id) => EMOJI_MAP[id] || match);
  const parts = parsedContent.split(combinedRegex);

  const youtubeIds = [];
  const twitchIds = [];
  const youtubeChannelUrls = [];
  const mediaUrls = [];

  const hasUrls = urlRegexRaw.test(parsedContent);
  const remainingText = parsedContent
    .replace(emojiRegexGlobal, '')
    .replace(urlRegexGlobal, '')
    .trim();
  const isEmojiOnly = remainingText.length === 0 && parsedContent.trim().length > 0 && !hasUrls;

  const tokens = [];

  for (const part of parts) {
    if (part === undefined || part === '') continue;

    if (emojiExact.test(part)) {
      tokens.push({ type: 'emoji', value: part });
      continue;
    }

    if (urlExact.test(part)) {
      const sanitizedUrl = sanitizeUrl(part);
      if (!sanitizedUrl) {
        tokens.push({ type: 'invalid_url', value: part });
        continue;
      }

      const yid = extractYoutubeId(sanitizedUrl);
      const ycid = extractYoutubeChannelUrl(sanitizedUrl);
      const tid = extractTwitchId(sanitizedUrl);
      if (yid) {
        if (!youtubeIds.find(y => y.videoId === yid)) {
          youtubeIds.push({ videoId: yid, fullUrl: sanitizedUrl });
        }
      } else if (ycid) {
        if (!youtubeChannelUrls.includes(ycid)) {
          youtubeChannelUrls.push(ycid);
        }
      } else if (tid) {
        if (!twitchIds.includes(tid)) {
          twitchIds.push(tid);
        }
      } else {
        const mediaMatch = sanitizedUrl.match(/\.(png|jpe?g|gif|webp|mp4|webm|ogg)(?:\?.*)?$/i);
        if (mediaMatch) {
          const isVideo = ['mp4', 'webm', 'ogg'].includes(mediaMatch[1].toLowerCase());
          const mediaObj = { url: sanitizedUrl, isVideo };
          if (!mediaUrls.find(m => m.url === sanitizedUrl)) {
            mediaUrls.push(mediaObj);
          }
        }
      }

      tokens.push({ type: 'url', value: part, sanitizedUrl });
      continue;
    }

    if (msgLinkExact.test(part)) {
      const match = part.match(/<(\d{13}(?:_[a-zA-Z0-9_]+)?)>/);
      const fullMsgId = match ? match[1] : '';
      const p = fullMsgId.split('_');
      tokens.push({
        type: 'msg_link',
        value: part,
        fullMsgId,
        timestampId: p[0],
        targetChannelId: p.slice(1).join('_')
      });
      continue;
    }

    if (userMentionExact.test(part)) {
      const match = part.match(/<(user_[a-zA-Z0-9_]+|hamachill|everyone)>/);
      const userId = match ? match[1] : '';
      tokens.push({ type: 'user_mention', value: part, userId });
      continue;
    }

    if (channelMentionExact.test(part)) {
      const match = part.match(/^<channel:([a-zA-Z0-9_-]+):([^>]+)>$/);
      tokens.push({
        type: 'channel_mention',
        value: part,
        channelId: match ? match[1] : '',
        name: match ? match[2] : ''
      });
      continue;
    }

    if (pinListExact.test(part)) {
      const match = part.match(/<pin_list>([^<]+)<\/pin_list>/);
      tokens.push({ type: 'pin_list', value: part, text: match ? match[1] : '' });
      continue;
    }

    if (typeof part === 'string' && mdRegex.test(part)) {
      const mdParts = part.split(mdRegex);
      const subTokens = [];
      for (const mdp of mdParts) {
        if (!mdp) continue;
        if (mdp.startsWith('||') && mdp.endsWith('||')) {
          subTokens.push({ type: 'spoiler', content: mdp.slice(2, -2) });
        } else if (mdp.startsWith('**') && mdp.endsWith('**')) {
          subTokens.push({ type: 'bold', content: mdp.slice(2, -2) });
        } else if (mdp.startsWith('__') && mdp.endsWith('__')) {
          subTokens.push({ type: 'underline', content: mdp.slice(2, -2) });
        } else if (mdp.startsWith('-') && mdp.endsWith('-') && mdp.length > 2) {
          subTokens.push({ type: 'del', content: mdp.slice(1, -1) });
        } else if (mdp.match(/^###\s/)) {
          subTokens.push({ type: 'h3', content: mdp.slice(4) });
        } else if (mdp.match(/^##\s/)) {
          subTokens.push({ type: 'h2', content: mdp.slice(3) });
        } else if (mdp.match(/^#\s/)) {
          subTokens.push({ type: 'h1', content: mdp.slice(2) });
        } else if (mdp.match(/^>\s/)) {
          const contentLines = mdp.trimEnd().split('\n').map(line => line.replace(/^>\s?/, ''));
          const firstLine = contentLines[0];
          const remainingLines = contentLines.slice(1).join('\n');

          const feedbackMatch = firstLine.match(/^\[feedback:([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)(?:\|([01])\|([^|]+))?\|(.*?)\]\s*(.*)$/);
          if (feedbackMatch) {
            subTokens.push({
              type: 'quote_feedback',
              messageId: feedbackMatch[1],
              responseId: feedbackMatch[2],
              initialUpvotes: parseInt(feedbackMatch[3], 10) || 0,
              initialDownvotes: parseInt(feedbackMatch[4], 10) || 0,
              initialIsAnon: feedbackMatch[5],
              initialUserId: feedbackMatch[6],
              safeTitle: feedbackMatch[7],
              text: [feedbackMatch[8], remainingLines].filter(Boolean).join('\n')
            });
            continue;
          }

          const msgMatch = firstLine.match(/^\[msg:([^|\]]+)(?:\|([^\]]+))?\]\s*(.*)$/);
          if (msgMatch) {
            subTokens.push({
              type: 'quote_msg',
              msgId: msgMatch[1],
              label: msgMatch[2],
              text: [msgMatch[3], remainingLines].filter(Boolean).join('\n')
            });
            continue;
          }

          const urlMatch = firstLine.match(/^\[url:([^\]]+)\]\s*(.*)$/);
          if (urlMatch) {
            subTokens.push({
              type: 'quote_url',
              url: urlMatch[1],
              text: [urlMatch[2], remainingLines].filter(Boolean).join('\n')
            });
            continue;
          }

          subTokens.push({
            type: 'quote_default',
            text: [firstLine, remainingLines].filter(Boolean).join('\n')
          });
        } else {
          subTokens.push({ type: 'text', content: mdp });
        }
      }
      tokens.push({ type: 'markdown', value: part, subTokens });
      continue;
    }

    tokens.push({ type: 'text', content: part });
  }

  return {
    special,
    textContent,
    tokens,
    youtubeIds,
    twitchIds,
    youtubeChannelUrls,
    mediaUrls,
    isEmojiOnly
  };
}

const cache = new Map();
const MAX = 2000;

// 4 番目の引数（投稿者 ID）は互換のため受け取るだけ
export function parseMessage(id, updatedAt, text, author) {
  const key = `${id}:${updatedAt || 0}:${typeof text === 'string' ? text.length : 0}`;
  const hit = cache.get(key);
  if (hit && hit.text === text) return hit.result;
  const result = parseUncached(text, author);
  cache.set(key, { text, result });
  if (cache.size > MAX) cache.delete(cache.keys().next().value);
  parseMessage.calls = (parseMessage.calls || 0) + 1;
  return result;
}
