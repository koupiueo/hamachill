import { t } from '../i18n';

// サーバーが作るシステムメッセージ（ピン留め・投票終了・削除ログ）は言語に依存しない形で保存される:
//   __SYS__{"k":"pin","user":"user_x"}
// 表示するときに、閲覧している人の言語に翻訳する。
export const SYS_PREFIX = '__SYS__';

export const SYSTEM_ACCOUNT_ID = 'hamachill';

// author: 送信者のアカウント ID。システムアカウント以外が送った __SYS__ は翻訳しない（なりすまし防止）
export function localizeSystemText(text, author) {
  if (author !== SYSTEM_ACCOUNT_ID || typeof text !== 'string' || !text.startsWith(SYS_PREFIX)) return text;
  let d;
  try { d = JSON.parse(text.slice(SYS_PREFIX.length)); } catch { return text; }
  if (!d || typeof d !== 'object') return text;
  const mention = (id) => (typeof id === 'string' && id ? `<${id}>` : '?');
  switch (d.k) {
    case 'pin':
      return t('system.pinned', { user: mention(d.user) });
    case 'poll_closed': {
      const lines = (Array.isArray(d.results) ? d.results : [])
        .map((r) => t('system.pollResultLine', { option: String(r?.option ?? ''), count: Number(r?.count) || 0 }));
      return [t('system.pollClosed'), ...lines].join('\n');
    }
    case 'delete_log': {
      const body = d.dm ? t('system.deleteLogDmBody') : (typeof d.body === 'string' && d.body ? d.body : t('system.deleteLogMediaBody'));
      return t('system.deleteLog', { by: mention(d.by), author: mention(d.author), channel: String(d.channel || ''), body });
    }
    default:
      return text;
  }
}
