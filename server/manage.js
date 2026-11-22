#!/usr/bin/env node
/**
 * 🐹 HAMACHILL MANAGEMENT CONSOLE (TUI & CLI)
 * Start the server, manage accounts and inspect the database from one tool.
 * サーバー起動、アカウント管理、データベース点検をすべて1本で行える統合管理ツールです。
 *
 * Usage / 使用方法:
 *   Interactive TUI: node manage.js
 *   CLI subcommand:  node manage.js <command> [args...]
 *
 * Language / 言語: Japanese when HAMACHILL_LANG / LC_ALL / LC_MESSAGES / LANG starts with "ja"
 * (or the system locale is Japanese), English otherwise. e.g. HAMACHILL_LANG=en node manage.js
 */

const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const { spawn } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
// サーバーと同じ場所（DATA_DIR、既定は server/）の DB を使う
const DATA_DIR = path.resolve(process.env.DATA_DIR || __dirname);
require('fs').mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'db.db');
const PORT = process.env.PORT || 3000;

// 表示言語（ja / en）
function detectLang() {
  const env = process.env.HAMACHILL_LANG || process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '';
  if (env) return /^ja/i.test(env) ? 'ja' : 'en';
  try { return /^ja/i.test(Intl.DateTimeFormat().resolvedOptions().locale) ? 'ja' : 'en'; } catch { return 'en'; }
}
const LANG = detectLang();
const L = (ja, en) => (LANG === 'ja' ? ja : en);
const fmtDate = (ms) => new Date(ms).toLocaleString(L('ja-JP', 'en-US'));

// ANSI カラー定義
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgDark: '\x1b[40m',
};

async function getDB() {
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });
  await db.exec('PRAGMA busy_timeout = 5000;');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      accountId TEXT PRIMARY KEY,
      firstName TEXT NOT NULL,
      passwordHash TEXT NOT NULL,
      displayName TEXT,
      pronouns TEXT,
      bio TEXT,
      profileColor1 TEXT DEFAULT '#4f46e5',
      profileColor2 TEXT DEFAULT '#9333ea',
      profileBannerColor TEXT DEFAULT '#2a2a2e',
      nameStyle TEXT DEFAULT 'solid',
      avatarUrl TEXT,
      bannerUrl TEXT,
      createdAt INTEGER,
      shards INTEGER NOT NULL DEFAULT 0,
      lastShardClaim INTEGER NOT NULL DEFAULT 0,
      profileColor3 TEXT DEFAULT NULL
    );
  `);
  try { await db.run("ALTER TABLE accounts ADD COLUMN nameStyle TEXT DEFAULT 'solid'"); } catch(e) {}
  try { await db.run("ALTER TABLE accounts ADD COLUMN shards INTEGER NOT NULL DEFAULT 0"); } catch(e) {}
  try { await db.run("ALTER TABLE accounts ADD COLUMN profileColor3 TEXT DEFAULT NULL"); } catch(e) {}
  try { await db.run("ALTER TABLE accounts ADD COLUMN lastShardClaim INTEGER NOT NULL DEFAULT 0"); } catch(e) {}
  try { await db.run("ALTER TABLE accounts ADD COLUMN tokenVersion INTEGER NOT NULL DEFAULT 0"); } catch(e) {}
  return db;
}

// サーバーをまだ一度も起動していない DB にはチャット系テーブルがないので、その場合は空扱いにする
async function safe(promise, fallback) {
  try { return await promise; } catch (e) {
    if (/no such table/i.test(String(e?.message))) return fallback;
    throw e;
  }
}

// 共通プロンプト関数
function createPrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const ask = (q) => new Promise(resolve => rl.question(q, resolve));
  const close = () => rl.close();
  return { ask, close };
}

// ─────────────────────────────────────────────────────────────
// 機能実装
// ─────────────────────────────────────────────────────────────

/** 1. サーバー起動 */
async function startServer() {
  console.log(`\n${C.green}${C.bold}${L("🚀 サーバーを起動します...", "🚀 Starting the server...")}${C.reset}\n`);
  const proc = spawn('node', ['index.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true
  });
  return new Promise((resolve) => {
    proc.on('exit', (code) => {
      console.log(L(`\n${C.yellow}🛑 サーバーが停止しました (終了コード: ${code})${C.reset}\n`, `\n${C.yellow}🛑 Server stopped (exit code: ${code})${C.reset}\n`));
      resolve();
    });
  });
}

/** 2. アカウント一覧表示 */
async function listAccounts() {
  const db = await getDB();
  console.log(`\n${C.cyan}${C.bold}${L("📊 登録アカウント一覧", "📊 Accounts")}${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(68)}${C.reset}`);

  const accounts = await db.all(`
    SELECT 
      accountId, firstName, displayName, pronouns, bio,
      profileColor1, profileColor2, profileColor3, profileBannerColor,
      avatarUrl, bannerUrl, nameStyle, createdAt
    FROM accounts 
    ORDER BY createdAt DESC
  `);

  if (accounts.length === 0) {
    console.log(`\n${C.yellow}${L("⚠️  アカウントが登録されていません。", "⚠️  No accounts yet.")}${C.reset}\n`);
    await db.close();
    return;
  }

  console.log(L(`\n👥 登録アカウント総数: ${C.bold}${accounts.length}${C.reset} 件\n`, `\n👥 Total accounts: ${C.bold}${accounts.length}${C.reset}\n`));

  for (const acc of accounts) {
    const msgCount = await safe(db.get('SELECT COUNT(*) as count FROM messages WHERE user = ?', [acc.accountId]), { count: 0 });
    const dmCount = await safe(db.get('SELECT COUNT(*) as count FROM dm_channels WHERE member1 = ? OR member2 = ?', [acc.accountId, acc.accountId]), { count: 0 });

    const colors = [acc.profileColor1, acc.profileColor2, acc.profileColor3].filter(Boolean).join(' / ');
    const createdStr = acc.createdAt ? fmtDate(acc.createdAt) : L('不明', 'unknown');

    console.log(`${C.bold}┌─ 🆔 ${C.cyan}${acc.accountId}${C.reset}`);
    console.log(L(`│  名前       : ${acc.firstName} (表示名: ${C.bold}${acc.displayName || acc.firstName}${C.reset})`, `│  Name       : ${acc.firstName} (display: ${C.bold}${acc.displayName || acc.firstName}${C.reset})`));
    if (acc.pronouns) console.log(L(`│  代名詞     : ${acc.pronouns}`, `│  Pronouns   : ${acc.pronouns}`));
    if (acc.bio) console.log(L(`│  自己紹介   : ${acc.bio.replace(/\n/g, ' ')}`, `│  Bio        : ${acc.bio.replace(/\n/g, ' ')}`));
    console.log(L(`│  スタイル   : ${acc.nameStyle || 'solid'}`, `│  Style      : ${acc.nameStyle || 'solid'}`));
    console.log(L(`│  テーマ色   : ${colors}`, `│  Colours    : ${colors}`));
    console.log(`${L('│  アバター   : ', '│  Avatar     : ')}${acc.avatarUrl ? C.green + L('設定あり', 'set') + C.reset : C.dim + L('なし', 'none') + C.reset}`);
    console.log(`${L('│  バナー     : ', '│  Banner     : ')}${acc.bannerUrl ? C.green + L('設定あり', 'set') + C.reset : C.dim + L('なし', 'none') + C.reset}`);
    console.log(L(`│  作成日時   : ${createdStr}`, `│  Created    : ${createdStr}`));
    console.log(L(`│  統計       : 💬 メッセージ ${C.bold}${msgCount.count}${C.reset}件 | ✉️  DM ${C.bold}${dmCount.count}${C.reset}件`, `│  Stats      : 💬 messages ${C.bold}${msgCount.count}${C.reset} | ✉️  DMs ${C.bold}${dmCount.count}${C.reset}`));
    console.log(`${C.dim}└${'─'.repeat(66)}${C.reset}\n`);
  }

  await db.close();
}

/** 3. アカウント新規追加 */
async function addAccount(accountId, password, displayName, customFirstName) {
  const db = await getDB();

  // 引数がない場合は対話入力
  if (!accountId || !password || !displayName) {
    const { ask, close } = createPrompt();
    console.log(`\n${C.cyan}${C.bold}${L("➕ 新規アカウント追加", "➕ Add account")}${C.reset}\n`);
    accountId = (await ask(L("  🆔 アカウントID (半角英数/ハイフン/アンダースコア): ", "  🆔 Account ID (letters, digits, - and _): "))).trim();
    password = (await ask(L("  🔑 パスワード (4文字以上): ", "  🔑 Password (4+ characters): "))).trim();
    displayName = (await ask(L("  👤 表示名 (例: 山田太郎): ", "  👤 Display name (e.g. Alex Kim): "))).trim();
    const fName = (await ask(L("  📛 名前(First Name) [省略時は表示名]: ", "  📛 First name [default: display name]: "))).trim();
    if (fName) customFirstName = fName;
    close();
  }

  if (!accountId || !password || !displayName) {
    console.error(`\n${C.red}${L("❌ エラー: アカウントID、パスワード、表示名は必須です。", "❌ Error: account ID, password and display name are required.")}${C.reset}\n`);
    await db.close();
    return false;
  }

  const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
  if (!ID_RE.test(accountId) || accountId.includes('__dm__')) {
    console.error(`\n${C.red}${L("❌ エラー: アカウントIDは半角英数字、ハイフン(-)、アンダースコア(_)の1〜64文字で指定してください（__dm__は使用不可）。", "❌ Error: account IDs are 1-64 characters of letters, digits, - and _ (\"__dm__\" is not allowed).")}${C.reset}\n`);
    await db.close();
    return false;
  }

  if (password.length < 4) {
    console.error(`\n${C.red}${L("❌ エラー: パスワードは4文字以上で指定してください。", "❌ Error: the password must be at least 4 characters.")}${C.reset}\n`);
    await db.close();
    return false;
  }

  // 重複チェック
  const existing = await db.get('SELECT accountId FROM accounts WHERE accountId = ?', [accountId]);
  if (existing) {
    console.error(L(`\n${C.red}❌ エラー: アカウントID "${accountId}" は既に存在します。${C.reset}\n`, `\n${C.red}❌ Error: account ID "${accountId}" already exists.${C.reset}\n`));
    await db.close();
    return false;
  }

  const firstName = customFirstName || displayName.split(' ')[0] || displayName;
  console.log(L(`\n🔐 パスワードをハッシュ化中 (bcrypt 12 rounds)...`, `\n🔐 Hashing the password (bcrypt, 12 rounds)...`));
  const passwordHash = await bcrypt.hash(password, 12);
  const now = Date.now();

  await db.run(
    `INSERT INTO accounts (
      accountId, firstName, passwordHash, displayName, pronouns, bio,
      profileColor1, profileColor2, profileBannerColor, nameStyle, shards, lastShardClaim, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [accountId, firstName, passwordHash, displayName, '', '', '#4f46e5', '#9333ea', '#2a2a2e', 'solid', 0, 0, now]
  );

  console.log(`\n${C.green}${C.bold}${L("✅ アカウント作成が正常に完了しました！", "✅ Account created!")}${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(50)}${C.reset}`);
  console.log(L(`   🆔 アカウントID : ${C.bold}${accountId}${C.reset}`, `   🆔 Account ID   : ${C.bold}${accountId}${C.reset}`));
  console.log(L(`   👤 表示名       : ${displayName}`, `   👤 Display name : ${displayName}`));
  console.log(L(`   📛 名前 (First) : ${firstName}`, `   📛 First name   : ${firstName}`));
  console.log(L(`   🔑 パスワード   : ${password}`, `   🔑 Password     : ${password}`));
  console.log(L(`   📅 作成日時     : ${fmtDate(now)}`, `   📅 Created      : ${fmtDate(now)}`));
  console.log(`${C.dim}${'─'.repeat(50)}${C.reset}\n`);

  await db.close();
  return true;
}

/** 4. パスワード変更 */
async function changePassword(accountId, newPassword) {
  const db = await getDB();

  if (!accountId || !newPassword) {
    const { ask, close } = createPrompt();
    console.log(`\n${C.cyan}${C.bold}${L("🔑 パスワード変更・再設定", "🔑 Change / reset password")}${C.reset}\n`);
    accountId = (await ask(L("  🆔 対象のアカウントID: ", "  🆔 Account ID: "))).trim();
    newPassword = (await ask(L("  🔑 新しいパスワード (4文字以上): ", "  🔑 New password (4+ characters): "))).trim();
    close();
  }

  if (!accountId || !newPassword) {
    console.error(`\n${C.red}${L("❌ エラー: アカウントIDと新しいパスワードが必要です。", "❌ Error: account ID and new password are required.")}${C.reset}\n`);
    await db.close();
    return false;
  }

  if (newPassword.length < 4) {
    console.error(`\n${C.red}${L("❌ エラー: パスワードは4文字以上で指定してください。", "❌ Error: the password must be at least 4 characters.")}${C.reset}\n`);
    await db.close();
    return false;
  }

  const account = await db.get('SELECT accountId, firstName, displayName FROM accounts WHERE accountId = ?', [accountId]);
  if (!account) {
    console.error(L(`\n${C.red}❌ エラー: アカウントID "${accountId}" が見つかりません。${C.reset}\n`, `\n${C.red}❌ Error: account ID "${accountId}" not found.${C.reset}\n`));
    await db.close();
    return false;
  }

  console.log(L(`\n🔐 パスワードをハッシュ化中 (bcrypt 12 rounds)...`, `\n🔐 Hashing the password (bcrypt, 12 rounds)...`));
  const passwordHash = await bcrypt.hash(newPassword, 12);

  await db.run('UPDATE accounts SET passwordHash = ?, tokenVersion = tokenVersion + 1 WHERE accountId = ?', [passwordHash, accountId]);

  console.log(`\n${C.green}${C.bold}${L("✅ パスワードの変更が完了しました！", "✅ Password changed!")}${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(50)}${C.reset}`);
  console.log(L(`   🆔 アカウントID   : ${C.bold}${accountId}${C.reset}`, `   🆔 Account ID     : ${C.bold}${accountId}${C.reset}`));
  console.log(L(`   👤 表示名         : ${account.displayName || account.firstName}`, `   👤 Display name   : ${account.displayName || account.firstName}`));
  console.log(L(`   🔑 新しいパスワード: ${newPassword}`, `   🔑 New password   : ${newPassword}`));
  console.log(`${C.dim}${'─'.repeat(50)}${C.reset}\n`);

  await db.close();
  return true;
}

/** 5. 一時パスワード発行作成 */
async function makeNewAccount(accountId, firstName, customDisplayName) {
  const db = await getDB();

  if (!accountId || !firstName) {
    const { ask, close } = createPrompt();
    console.log(`\n${C.cyan}${C.bold}${L("🎲 一時パスワード付きアカウント作成", "🎲 Create account with a temporary password")}${C.reset}\n`);
    accountId = (await ask(L("  🆔 アカウントID: ", "  🆔 Account ID: "))).trim();
    firstName = (await ask(L("  📛 名前 (First Name): ", "  📛 First name: "))).trim();
    const dName = (await ask(L("  👤 表示名 [省略時は名前と同じ]: ", "  👤 Display name [default: first name]: "))).trim();
    if (dName) customDisplayName = dName;
    close();
  }

  if (!accountId || !firstName) {
    console.error(`\n${C.red}${L("❌ エラー: アカウントIDと名前は必須です。", "❌ Error: account ID and name are required.")}${C.reset}\n`);
    await db.close();
    return false;
  }

  const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
  if (!ID_RE.test(accountId) || accountId.includes('__dm__')) {
    console.error(`\n${C.red}${L("❌ エラー: アカウントIDは半角英数字、ハイフン(-)、アンダースコア(_)の1〜64文字で指定してください（__dm__は使用不可）。", "❌ Error: account IDs are 1-64 characters of letters, digits, - and _ (\"__dm__\" is not allowed).")}${C.reset}\n`);
    await db.close();
    return false;
  }

  const existing = await db.get('SELECT accountId FROM accounts WHERE accountId = ?', [accountId]);
  if (existing) {
    console.error(L(`\n${C.red}❌ エラー: アカウントID "${accountId}" は既に存在します。${C.reset}\n`, `\n${C.red}❌ Error: account ID "${accountId}" already exists.${C.reset}\n`));
    await db.close();
    return false;
  }

  const displayName = customDisplayName || firstName;
  const tempPassword = crypto.randomBytes(6).toString('hex');
  const hash = await bcrypt.hash(tempPassword, 12);
  const now = Date.now();

  await db.run(
    `INSERT INTO accounts (
      accountId, firstName, passwordHash, displayName, profileColor1, profileColor2, profileBannerColor, nameStyle, shards, lastShardClaim, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [accountId, firstName, hash, displayName, '#4f46e5', '#9333ea', '#2a2a2e', 'solid', 0, 0, now]
  );

  console.log(`\n${C.green}${C.bold}${L("✅ 一時アカウントを作成しました！", "✅ Account created with a temporary password!")}${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(50)}${C.reset}`);
  console.log(L(`   🆔 アカウントID   : ${C.bold}${accountId}${C.reset}`, `   🆔 Account ID     : ${C.bold}${accountId}${C.reset}`));
  console.log(L(`   📛 名前           : ${firstName}`, `   📛 First name     : ${firstName}`));
  console.log(L(`   👤 表示名         : ${displayName}`, `   👤 Display name   : ${displayName}`));
  console.log(L(`   🔑 一時パスワード : ${C.yellow}${C.bold}${tempPassword}${C.reset}`, `   🔑 Temp password  : ${C.yellow}${C.bold}${tempPassword}${C.reset}`));
  console.log(`${C.dim}${'─'.repeat(50)}${C.reset}`);
  console.log(`${L("💡 ユーザーに一時パスワードを共有してください。", "💡 Share the temporary password with the user.")}\n`);

  await db.close();
  return true;
}

/** 6. アカウント削除 */
async function removeAccount(accountId) {
  const db = await getDB();

  if (!accountId) {
    const { ask, close } = createPrompt();
    console.log(`\n${C.red}${C.bold}${L("🗑️  アカウント削除", "🗑️  Remove account")}${C.reset}\n`);
    accountId = (await ask(L("  🆔 削除するアカウントID: ", "  🆔 Account ID to remove: "))).trim();
    close();
  }

  if (!accountId) {
    console.error(`\n${C.red}${L("❌ エラー: アカウントIDを指定してください。", "❌ Error: specify an account ID.")}${C.reset}\n`);
    await db.close();
    return false;
  }

  const account = await db.get('SELECT accountId, firstName, displayName, createdAt FROM accounts WHERE accountId = ?', [accountId]);
  if (!account) {
    console.error(L(`\n${C.red}❌ エラー: アカウントID "${accountId}" が見つかりません。${C.reset}\n`, `\n${C.red}❌ Error: account ID "${accountId}" not found.${C.reset}\n`));
    await db.close();
    return false;
  }

  console.log(L(`\n📝 削除対象アカウント: ${C.bold}${account.accountId}${C.reset} (${account.displayName || account.firstName})`, `\n📝 Removing: ${C.bold}${account.accountId}${C.reset} (${account.displayName || account.firstName})`));
  
  // 削除実行
  console.log(`${L("🗑️  関連データを連鎖削除中...", "🗑️  Deleting related data...")}`);
  const msgRes = await safe(db.run('DELETE FROM messages WHERE user = ?', [accountId]), { changes: 0 });
  console.log(L(`   ・投稿メッセージ    : ${msgRes.changes} 件削除`, `   - Messages          : ${msgRes.changes} deleted`));

  const dms = await safe(db.all('SELECT channelId FROM dm_channels WHERE member1 = ? OR member2 = ?', [accountId, accountId]), []);
  let dmMsgDeleted = 0;
  for (const dm of dms) {
    const r = await db.run('DELETE FROM messages WHERE channelId = ?', [dm.channelId]);
    dmMsgDeleted += r.changes;
  }
  if (dmMsgDeleted > 0) console.log(L(`   ・DM内メッセージ    : ${dmMsgDeleted} 件削除`, `   - DM messages       : ${dmMsgDeleted} deleted`));

  const dmRes = await safe(db.run('DELETE FROM dm_channels WHERE member1 = ? OR member2 = ?', [accountId, accountId]), { changes: 0 });
  console.log(L(`   ・DMチャンネル      : ${dmRes.changes} 件削除`, `   - DM channels       : ${dmRes.changes} deleted`));

  const readRes = await safe(db.run('DELETE FROM read_state WHERE accountId = ?', [accountId]), { changes: 0 });
  console.log(L(`   ・既読状態レコード  : ${readRes.changes} 件削除`, `   - Read state rows   : ${readRes.changes} deleted`));


  await db.run('DELETE FROM accounts WHERE accountId = ?', [accountId]);
  console.log(`${L("   ・アカウント本体    : 削除完了", "   - Account           : deleted")}`);

  console.log(`\n${C.green}${C.bold}${L("✅ アカウントとすべての関連データを安全に削除しました。", "✅ The account and all its data were deleted.")}${C.reset}\n`);

  await db.close();
  return true;
}

/** 7. データベース点検・統計 */
async function inspectDatabase() {
  const db = await getDB();
  console.log(`\n${C.cyan}${C.bold}${L("📊 データベース状況・健全性チェック", "📊 Database status / health check")}${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(60)}${C.reset}\n`);

  const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");

  console.log(`${C.bold}${L("テーブル一覧とレコード数:", "Tables and row counts:")}${C.reset}`);
  for (const t of tables) {
    const count = await db.get(`SELECT COUNT(*) as c FROM ${t.name}`);
    console.log(L(`   • ${t.name.padEnd(22)} : ${C.bold}${count.c.toString().padStart(5)}${C.reset} 件`, `   • ${t.name.padEnd(22)} : ${C.bold}${count.c.toString().padStart(5)}${C.reset}`));
  }

  // アカウントID重複チェックなどの整合性確認
  console.log(`\n${C.bold}${L("健全性チェック:", "Health check:")}${C.reset}`);
  const orphanMessages = await safe(db.get(`
    SELECT COUNT(*) as c FROM messages 
    WHERE user IS NOT NULL 
      AND user NOT IN (SELECT accountId FROM accounts)
      AND user != 'hamachill'
  `), { c: 0 });
  if (orphanMessages.c > 0) {
    console.log(L(`   ${C.yellow}⚠️  削除済みユーザーのメッセージ: ${orphanMessages.c} 件${C.reset}`, `   ${C.yellow}⚠️  Messages from deleted users: ${orphanMessages.c}${C.reset}`));
  } else {
    console.log(`   ${C.green}${L("✅ 孤立メッセージなし（整合性正常）", "✅ No orphaned messages")}${C.reset}`);
  }

  console.log(L(`   ${C.green}✅ SQLite データベースファイル接続: 正常 (${DB_PATH})${C.reset}\n`, `   ${C.green}✅ SQLite database OK (${DB_PATH})${C.reset}\n`));
  await db.close();
}

/** 8. 全データリセット */
async function resetDatabase() {
  const db = await getDB();
  console.log(`\n${C.red}${C.bold}${L("⚠️  警告: データベース完全初期化", "⚠️  WARNING: reset the whole database")}${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(60)}${C.reset}`);

  const { ask, close } = createPrompt();
  const a1 = await ask(L("\n本当に全データを完全に削除しますか？ (yes/no): ", "\nReally delete ALL data? (yes/no): "));
  if (a1.trim().toLowerCase() !== 'yes') {
    console.log(`\n${C.yellow}${L("❌ キャンセルしました。", "❌ Cancelled.")}${C.reset}\n`);
    close();
    await db.close();
    return;
  }

  const a2 = await ask(L("最終確認です。大文字で \"YES\" と入力してください: ", "Last check. Type \"YES\" in capitals: "));
  close();
  if (a2.trim() !== 'YES') {
    console.log(`\n${C.yellow}${L("❌ キャンセルしました。", "❌ Cancelled.")}${C.reset}\n`);
    await db.close();
    return;
  }

  console.log(`\n${L("🗑️  全テーブルのデータを削除中...", "🗑️  Deleting all data...")}`);
  const tables = ['accounts', 'messages', 'dm_channels', 'read_state'];
  for (const tbl of tables) {
    try {
      const res = await db.run(`DELETE FROM ${tbl}`);
      console.log(L(`   ✅ ${tbl.padEnd(20)}: ${res.changes} 件削除完了`, `   ✅ ${tbl.padEnd(20)}: ${res.changes} deleted`));
    } catch (e) {}
  }

  console.log(`\n${C.green}${C.bold}${L("✅ データベースの初期化が完了しました。", "✅ Database reset complete.")}${C.reset}\n`);
  await db.close();
}

// ─────────────────────────────────────────────────────────────
// TUI メインループ
// ─────────────────────────────────────────────────────────────

function renderBanner() {
  console.clear();
  console.log(`${C.cyan}${C.bold}`);
  console.log(`  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`);
  console.log(`  ┃         🐹 HAMACHILL MANAGEMENT CONSOLE (TUI)              ┃`);
  console.log(`  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛${C.reset}`);
  console.log(`  ${C.dim}${L("サーバー起動、アカウント管理、データベース点検の統合ツール", "Server, accounts and database in one tool")}${C.reset}\n`);
}

function renderMenu() {
  console.log(`  ${C.bold}[1]${C.reset} 🚀 ${C.bold}${L("サーバーを起動する", "Start the server")}${C.reset} (port ${PORT})`);
  console.log(`  ${C.bold}[2]${C.reset} 👥 ${C.bold}${L("アカウント一覧を表示", "List accounts")}${C.reset}`);
  console.log(`  ${C.bold}[3]${C.reset} ➕ ${C.bold}${L("アカウントを新規追加", "Add an account")}${C.reset}`);
  console.log(`  ${C.bold}[4]${C.reset} 🔑 ${C.bold}${L("パスワードを変更・再設定", "Change a password")}${C.reset}`);
  console.log(`  ${C.bold}[5]${C.reset} 🎲 ${C.bold}${L("一時パスワードで作成", "Create with a temporary password")}${C.reset}`);
  console.log(`  ${C.bold}[6]${C.reset} 🗑️  ${C.bold}${L("アカウントを削除", "Remove an account")}${C.reset}`);
  console.log(`  ${C.bold}[7]${C.reset} 📊 ${C.bold}${L("データベース状況を確認", "Inspect the database")}${C.reset}`);
  console.log(`  ${C.bold}[8]${C.reset} ⚠️  ${C.bold}${L("データベース全初期化", "Reset all data")}${C.reset}`);
  console.log(`  ${C.dim}${'─'.repeat(64)}${C.reset}`);
  console.log(`  ${C.bold}[0]${C.reset} 🚪 ${C.dim}${L("終了する", "Exit")}${C.reset}\n`);
}

async function runTUI() {
  while (true) {
    renderBanner();
    renderMenu();

    const { ask, close } = createPrompt();
    const choice = (await ask(L(`  👉 メニュー番号を選択してください [0-8]: `, `  👉 Choose an option [0-8]: `))).trim();
    close();

    switch (choice) {
      case '1':
        renderBanner();
        await startServer();
        break;
      case '2':
        renderBanner();
        await listAccounts();
        break;
      case '3':
        renderBanner();
        await addAccount();
        break;
      case '4':
        renderBanner();
        await changePassword();
        break;
      case '5':
        renderBanner();
        await makeNewAccount();
        break;
      case '6':
        renderBanner();
        await removeAccount();
        break;
      case '7':
        renderBanner();
        await inspectDatabase();
        break;
      case '8':
        renderBanner();
        await resetDatabase();
        break;
      case '0':
      case 'exit':
      case 'q':
        console.log(`\n  ${L("👋 終了しました。", "👋 Bye.")}\n`);
        process.exit(0);
      default:
        console.log(`\n  ${C.red}${L("無効な選択です。0〜8 の番号を入力してください。", "Invalid choice. Enter a number from 0 to 8.")}${C.reset}`);
        await new Promise(r => setTimeout(r, 1200));
        continue;
    }

    // 処理完了後の待機
    const promptAfter = createPrompt();
    await promptAfter.ask(`\n${C.dim}${L("Enter キーを押すとメニューに戻ります...", "Press Enter to return to the menu...")}${C.reset}`);
    promptAfter.close();
  }
}

// ─────────────────────────────────────────────────────────────
// CLI サブコマンドルーティング
// ─────────────────────────────────────────────────────────────

async function main() {
  const [,, cmd, ...args] = process.argv;

  if (!cmd) {
    // 引数なし → 対話型 TUI を起動
    await runTUI();
    return;
  }

  // CLI サブコマンドモード
  switch (cmd.toLowerCase()) {
    case 'start':
    case 'server':
      await startServer();
      break;

    case 'list':
    case 'ls':
      await listAccounts();
      break;

    case 'add':
      await addAccount(args[0], args[1], args[2], args[3]);
      break;

    case 'passwd':
    case 'password':
      await changePassword(args[0], args[1]);
      break;

    case 'make':
    case 'new':
      await makeNewAccount(args[0], args[1], args[2]);
      break;

    case 'remove':
    case 'rm':
    case 'del':
      await removeAccount(args[0]);
      break;

    case 'stats':
    case 'inspect':
    case 'check':
      await inspectDatabase();
      break;

    case 'reset':
      await resetDatabase();
      break;

    case 'help':
    case '--help':
    case '-h':
      console.log(`\n${C.bold}${L("HAMACHILL 管理コンソール CLI ヘルプ", "HAMACHILL management console - CLI help")}${C.reset}`);
      console.log(`\n${L('使用方法:', 'Usage:')}`);
      for (const [c, ja, en] of [
        ['', '対話型 TUI を起動', 'interactive TUI'],
        ['server', 'サーバー起動', 'start the server'],
        ['list', 'アカウント一覧表示', 'list accounts'],
        ['add <id> <pass> <name> [first]', 'アカウント追加', 'add an account'],
        ['passwd <id> <newPass>', 'パスワード変更', 'change a password'],
        ['make <id> <first> [name]', '一時パスワード付き作成', 'create with a temporary password'],
        ['remove <id>', 'アカウント削除', 'remove an account and its data'],
        ['stats', 'データベース点検', 'inspect the database'],
        ['reset', 'データベース全初期化', 'reset all data'],
      ]) console.log(`  node manage.js ${c.padEnd(32)} ${L(ja, en)}`);
      console.log(`\n${L('英語表示: HAMACHILL_LANG=en node manage.js', 'Japanese UI: HAMACHILL_LANG=ja node manage.js')}\n`);
      break;

    default:
      console.error(L(`\n${C.red}不明なコマンド: "${cmd}"${C.reset}`, `\n${C.red}Unknown command: "${cmd}"${C.reset}`));
      console.log(`${L("「node manage.js --help」でコマンド一覧を確認してください。", "Run \"node manage.js --help\" for the list of commands.")}\n`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error(`\n${C.red}${L("❌ エラーが発生しました:", "❌ An error occurred:")}${C.reset}`, err);
  process.exit(1);
});
