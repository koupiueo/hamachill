import { t } from '../i18n';
// メッセージ本文の上限（server/index.js の MAX_MESSAGE_CHARS と揃える）
export const MAX_MESSAGE_CHARS = 1256;
// 残り何文字からカウンターを出すか / 赤くするか
export const COUNTER_SHOW_REMAINING = 200;
export const COUNTER_WARN_REMAINING = 20;

// 添付ファイルの上限。サーバーの MAX_UPLOAD_MB（/api/config の maxUploadBytes）で上書きされる。既定 95MB
const tooLargeMessage = (bytes) => t('errors.fileTooLarge', { mb: Math.round(bytes / (1024 * 1024)) });
export let MAX_UPLOAD_BYTES = 95 * 1024 * 1024;
export let UPLOAD_TOO_LARGE_MESSAGE = tooLargeMessage(MAX_UPLOAD_BYTES);

export function setMaxUploadBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  MAX_UPLOAD_BYTES = bytes;
  UPLOAD_TOO_LARGE_MESSAGE = tooLargeMessage(bytes);
}
