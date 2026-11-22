const express = require('express');
 
const crypto = require('crypto');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const { ExpressPeerServer } = require('peer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const dotenv = require('dotenv');
const fs = require('fs');
const multer = require('multer');
let sharp = null;
try {
  sharp = require('sharp');
  if (sharp) {
    sharp.cache(false);
    sharp.concurrency(1);
  }
} catch {}



dotenv.config({ path: path.join(__dirname, '../.env') });
// データ（DB・アップロード・サウンドボード・スタンプ）の置き場所。既定は server/ の中。Docker では /data
const DATA_DIR = path.resolve(process.env.DATA_DIR || __dirname);
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const splitList = (v) => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
// 正の数の環境変数を読む（不正・未設定なら既定値）
const envNum = (name, def) => { const n = Number(process.env[name]); return Number.isFinite(n) && n > 0 ? n : def; };

const soundboardDir = path.join(DATA_DIR, 'soundboards');
const uploadDir = path.join(soundboardDir, 'tmp');
if (!fs.existsSync(soundboardDir)) fs.mkdirSync(soundboardDir, { recursive: true });
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 5 * 1024 * 1024 } });

// public/soundboards から server/soundboards への移行
try {
  const legacySbDir = path.join(__dirname, '../public/soundboards');
  if (fs.existsSync(legacySbDir)) {
    const files = fs.readdirSync(legacySbDir);
    for (const f of files) {
      if (f === 'tmp' || f === '.gitkeep') continue;
      const src = path.join(legacySbDir, f);
      const dst = path.join(soundboardDir, f);
      if (!fs.existsSync(dst)) {
        try { fs.renameSync(src, dst); } catch { fs.copyFileSync(src, dst); fs.unlinkSync(src); }
      }
    }
    try { fs.rmSync(path.join(legacySbDir, 'tmp'), { recursive: true, force: true }); } catch {}
  }
} catch (e) {
  log.warn('[Soundboard Migration] Failed to auto-migrate public/soundboards:', e);
}
try {
  fs.rmSync(path.join(__dirname, '../dist/soundboards'), { recursive: true, force: true });
} catch {}

const stumpsDir = path.join(DATA_DIR, 'stumps');
if (!fs.existsSync(stumpsDir)) {
  fs.mkdirSync(stumpsDir, { recursive: true });
  fs.mkdirSync(path.join(stumpsDir, 'general'), { recursive: true });
  fs.mkdirSync(path.join(stumpsDir, 'cat'), { recursive: true });
}

const log = require('./logger');



const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32 || JWT_SECRET === 'hc_secret_change_in_prod') {
  console.error('❌ JWT_SECRET is missing or too short (32+ characters required). Check your .env.');
  console.error('   Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
   
  process.exit(1);
}
const JWT_SIGN_OPTS = { algorithm: 'HS256', expiresIn: '3d' };
const JWT_VERIFY_OPTS = { algorithms: ['HS256'] };

const compression = require("compression");
const app = express();
// リバースプロキシ（nginx・cloudflared など）の後ろに置くときだけ TRUST_PROXY=1 にする
app.set('trust proxy', /^(1|true)$/i.test(process.env.TRUST_PROXY || '') ? 1 : false);

// 公開 URL（例: https://chat.example.com）。PUBLIC_ORIGIN と EXTRA_ORIGINS（カンマ区切り）を許可する
const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000', 'http://localhost:5173',
  'http://127.0.0.1:3000', 'http://127.0.0.1:5173',
  ...splitList(process.env.PUBLIC_ORIGIN).map(s => s.replace(/\/+$/, '')),
  ...splitList(process.env.EXTRA_ORIGINS),
]);
const originAllowed = (origin) => !origin || ALLOWED_ORIGINS.has(origin);
// false のときは CORS ヘッダーを付けないだけ（500 エラーにしない）
const checkOrigin = (origin, callback) => callback(null, originAllowed(origin));
// CF-Connecting-IP は Cloudflare 経由のときだけ信じる（直接公開だと偽装できるので既定は無視）
const TRUST_CF_IP = /^(1|true)$/i.test(process.env.TRUST_CLOUDFLARE || '');
const clientIp = (req) => (TRUST_CF_IP && req.headers['cf-connecting-ip']) || req.ip;
app.use(compression());

const invisibleAccounts = new Set();

const getOnlineUsers = () => {
  return [...new Set(Object.values(socketAccounts))].filter(id => !invisibleAccounts.has(id)).sort();
};

let lastOnlineJson = '';
function broadcastOnline() {
  const ids = getOnlineUsers();
  const json = JSON.stringify(ids);
  if (json !== lastOnlineJson) {
    lastOnlineJson = json;
    io.emit('online_users', ids);
  }
}

// リクエストログミドルウェア（デバッグ用）
const STATIC_PREFIXES = ['/assets', '/uploads', '/stumps', '/server/stumps', '/server/stump', '/stump', '/soundboards'];
app.use((req, res, next) => {
  if (process.env.DEBUG && req.path !== '/read' && req.path !== '/unread' && !STATIC_PREFIXES.some(p => req.path.startsWith(p))) {
    log.debug(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

app.use(cors({
  origin: checkOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // プリフライトキャッシュ: 24時間
}));
app.use(express.json({ limit: '10mb' }));

// フロントエンドからの /api プレフィックスを内部で除去
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    req.url = req.url.replace(/^\/api/, '');
  }
  next();
});

// スタンプ静的ファイル配信 (/server/stumps, /stumps)
app.use('/server/stumps', express.static(stumpsDir, { maxAge: '1d', etag: true }));
app.use('/stumps', express.static(stumpsDir, { maxAge: '1d', etag: true }));
app.use('/server/stump', express.static(stumpsDir, { maxAge: '1d', etag: true }));
app.use('/stump', express.static(stumpsDir, { maxAge: '1d', etag: true }));

let stumpsCache = null;

// スタンプ階層（ジャンル別）非同期スキャン関数
async function scanStumpsDirAsync(dirPath, relativeDir = '') {
  let results = [];
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const validExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.apng'];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        const subResults = await scanStumpsDirAsync(fullPath, relPath);
        results = results.concat(subResults);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (validExts.includes(ext)) {
          try {
            const stats = await fs.promises.stat(fullPath);
            const parts = relPath.split('/');
            const genre = parts.length > 1 ? parts[0] : 'general';
            const name = path.parse(entry.name).name;
            results.push({
              id: relPath,
              name: name,
              filename: entry.name,
              genre: genre,
              url: `/server/stumps/${relPath}`,
              mtime: stats.mtimeMs,
            });
          } catch (e) {
            log.error(`Error reading stamp file ${fullPath}:`, e);
          }
        }
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') log.error('[Stumps Scan Error]', err);
  }
  return results;
}

// GET /stumps エンドポイント
app.get('/stumps', async (req, res) => {
  if (stumpsCache) {
    log.debug('[Stumps] serving from cache');
    return res.json(stumpsCache);
  }
  try {
    log.debug('[Stumps] scanning directory');
    const allStumps = await scanStumpsDirAsync(stumpsDir);
    allStumps.sort((a, b) => b.mtime - a.mtime);

    const genresMap = {};
    for (const item of allStumps) {
      if (!genresMap[item.genre]) {
        genresMap[item.genre] = [];
      }
      genresMap[item.genre].push(item);
    }

    const genresList = Object.keys(genresMap).map(g => ({
      id: g,
      name: g,
      stamps: genresMap[g]
    }));

    stumpsCache = {
      stamps: allStumps,
      genres: genresList
    };

    res.json(stumpsCache);
  } catch (err) {
    log.error('[Stumps API Error]', err);
    res.status(500).json({ error: 'Failed to scan stumps directory' });
  }
});

// IP ごと AUTH_RATE_LIMIT req/1min のレートリミット（認証エンドポイント用、既定 5）
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: envNum('AUTH_RATE_LIMIT', 5),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(clientIp(req)),
  message: { error: 'Too many requests, please try again later.', code: 'rate_limited' },
});
const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: envNum('LOGIN_RATE_LIMIT', 10), // アカウントごと 15 分あたりのログイン試行（既定 10）
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => 'acc:' + String(req.body?.accountId || '').toLowerCase().slice(0, 64),
  message: { error: 'Too many login attempts for this account. Please wait a while.', code: 'login_rate_limited' },
});

const server = http.createServer(app);
// リバースプロキシ（Cloudflare/nginx 等）や長時間 WebSocket 接続が途中で切れないようにする
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 0;

const io = new Server(server, {
  path: '/socket.io',
  destroyUpgrade: false, // PeerJS等の他のWebSocketサーバーと共存させるため
  maxHttpBufferSize: 1e7, // 10MB
  perMessageDeflate: false, // プロキシ経由の長時間接続でフレーム詰まり・切断が起きるのを防ぐ
  cors: {
    origin: checkOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  allowRequest: (req, callback) => callback(null, originAllowed(req.headers.origin)),
  pingTimeout: 60000,
  pingInterval: 15000, // 15秒ごとに ping を送ってプロキシ/NAT のアイドル切断を防ぐ
  transports: ['websocket', 'polling'],
  upgradeTimeout: 10000,
});

let stumpWatchTimeout = null;
try {
  fs.watch(stumpsDir, { recursive: true }, (eventType, filename) => {
    stumpsCache = null;
    if (stumpWatchTimeout) clearTimeout(stumpWatchTimeout);
    stumpWatchTimeout = setTimeout(() => {
      log.debug(`[Stumps Watcher] Directory changed (${eventType}: ${filename}). Broadcasting stamps_updated...`);
      io.emit('stamps_updated');
    }, 150);
  });
} catch (e) {
  log.error('[Stumps Watcher Error]', e);
}


// PeerJSサーバーを同じポート(3000)で動作させる
const peerServer = ExpressPeerServer(server, {
  debug: false,
  path: '/peerjs',
  alive_timeout: 120000,
  proxied: true,
});
app.use('/', peerServer);

// Socket.IOとPeerJSのWebSocket競合（相手の通信を切断してしまう問題）を防ぐため、
// upgradeイベントを自前で振り分ける
server.on('listening', () => {
  const listeners = server.listeners('upgrade').slice();
  server.removeAllListeners('upgrade');

  server.on('upgrade', (req, socket, head) => {
    // WebSocket の TCP ソケットがアイドルで切断されないようにする
    socket.setTimeout(0);
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 15000);
    if (req.url.startsWith('/peerjs')) {
      // 後から追加されたリスナーがPeerJS（[1]）
      if (listeners[1]) listeners[1](req, socket, head);
    } else if (req.url.startsWith('/socket.io')) {
      // 先に追加されたリスナーがSocket.IO（[0]）
      if (listeners[0]) listeners[0](req, socket, head);
    } else {
      socket.destroy();
    }
  });
});

// PeerServerは外部で起動するためコメントアウト
// const peerServer = PeerServer({
//   port: 9000, path: '/', allow_discovery: true,
//   alive_timeout: 60000, key: 'peerjs', concurrent_limit: 5000,
// });
// peerServer.on('connection', c => console.log(`[Peer] +${c.getId()}`));
// peerServer.on('disconnect', c => console.log(`[Peer] -${c.getId()}`));
// peerServer.on('error', (err) => {
//   if (err.code === 'EADDRINUSE') {
//     console.error('[Peer] ⚠️  ポート 9000 は既に使用中です。別のターミナルでPeerJSが起動している可能性があります。');
//     console.error('[Peer] 💡 解決方法: pkill -f peerjs を実行してください');
//   } else {
//     console.error('[Peer] エラー:', err.message);
//   }
// });



let db;
let voiceUsers = {};

async function initDB() {
  db = await open({ filename: path.join(DATA_DIR, 'db.db'), driver: sqlite3.Database });
  await db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA temp_store = MEMORY;
    PRAGMA cache_size = -20000;
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, user TEXT, timestamp INTEGER, text TEXT,
      imageUrl TEXT, audioUrl TEXT, channelId TEXT, replyTo TEXT, reactions TEXT, isEdited INTEGER DEFAULT 0, editHistory TEXT, pollVotes TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
  `);
  try {
    await db.exec('ALTER TABLE messages ADD COLUMN isEdited INTEGER DEFAULT 0;');
  } catch (e) { /* already exists */ }
  try {
    await db.exec('ALTER TABLE messages ADD COLUMN editHistory TEXT;');
  } catch (e) { /* already exists */ }
  try {
    await db.exec('ALTER TABLE messages ADD COLUMN isDeleted INTEGER DEFAULT 0;');
  } catch (e) { /* already exists */ }
  try {
    await db.exec('ALTER TABLE messages ADD COLUMN pollVotes TEXT;');
  } catch (e) { /* already exists */ }
  try {
    await db.exec('ALTER TABLE messages ADD COLUMN audioUrl TEXT;');
  } catch (e) { /* already exists */ }
  try {
    await db.exec('ALTER TABLE messages ADD COLUMN isPinned INTEGER DEFAULT 0;');
  } catch (e) { /* already exists */ }
  try { await db.exec('ALTER TABLE messages ADD COLUMN fileUrl TEXT;'); } catch (e) {}
  try { await db.exec('ALTER TABLE messages ADD COLUMN fileName TEXT;'); } catch (e) {}
  try { await db.exec('ALTER TABLE messages ADD COLUMN fileSize INTEGER;'); } catch (e) {}
  try { await db.exec('ALTER TABLE messages ADD COLUMN fileType TEXT;'); } catch (e) {}
  try {
    await db.exec('ALTER TABLE messages ADD COLUMN updatedAt INTEGER DEFAULT 0;');
  } catch (e) { /* already exists */ }
  try {
    await db.exec('ALTER TABLE messages ADD COLUMN pollClosed INTEGER DEFAULT 0;');
    const existingPollRows = await db.all("SELECT id, text FROM messages WHERE instr(text, '__POLL__') > 0");
    const now = Date.now();
    for (const r of existingPollRows) {
      const parts = (r.text || '').split('__POLL__');
      try {
        const pd = JSON.parse(parts[1]);
        if (!pd.endTime || typeof pd.endTime !== 'number' || pd.endTime <= now) {
          await db.run('UPDATE messages SET pollClosed = 1 WHERE id = ?', [r.id]);
        }
      } catch {
        await db.run('UPDATE messages SET pollClosed = 1 WHERE id = ?', [r.id]);
      }
    }
  } catch (e) { /* already exists */ }
  await db.exec(`
    CREATE TABLE IF NOT EXISTS dm_channels (
      channelId TEXT PRIMARY KEY,
      member1 TEXT NOT NULL,
      member2 TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS custom_emojis (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL,
      ownerAccountId TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_custom_emojis_owner ON custom_emojis(ownerAccountId);
    CREATE TABLE IF NOT EXISTS read_state (
      accountId TEXT NOT NULL,
      channelId TEXT NOT NULL,
      lastReadAt INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (accountId, channelId)
    );
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
      lastShardClaim INTEGER NOT NULL DEFAULT 0
    );
  `);
  try {
    await db.run("ALTER TABLE accounts ADD COLUMN nameStyle TEXT DEFAULT 'solid'");
  } catch(e) {}
  try {
    await db.run('ALTER TABLE accounts ADD COLUMN shards INTEGER NOT NULL DEFAULT 0');
  } catch(e) {}
  try {
    await db.run("ALTER TABLE accounts ADD COLUMN profileColor3 TEXT DEFAULT NULL");
  } catch(e) {}
  try {
    await db.run("ALTER TABLE accounts ADD COLUMN lastShardClaim INTEGER NOT NULL DEFAULT 0");
  } catch(e) {}
  try {
    await db.run("ALTER TABLE accounts ADD COLUMN tokenVersion INTEGER NOT NULL DEFAULT 0");
  } catch(e) {}

  const idx = await db.get("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_messages_channel_time'");
  if (idx && !/WHERE\s+isDeleted\s*=\s*0/i.test(idx.sql || '')) await db.exec('DROP INDEX idx_messages_channel_time');
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_channel_time ON messages(channelId, timestamp DESC) WHERE isDeleted = 0;
    CREATE INDEX IF NOT EXISTS idx_messages_ch_upd ON messages(channelId, updatedAt);
    DROP INDEX IF EXISTS idx_messages_text;
    CREATE INDEX IF NOT EXISTS idx_messages_pinned ON messages(channelId, timestamp) WHERE isPinned = 1;
    CREATE INDEX IF NOT EXISTS idx_dm_m1 ON dm_channels(member1);
    CREATE INDEX IF NOT EXISTS idx_dm_m2 ON dm_channels(member2);
  `);
  setInterval(() => db.exec('PRAGMA optimize').catch(() => {}), 24 * 3600e3);
}
const dbReady = initDB();
dbReady.then(() => refreshFirstAccount()).catch(() => {});
dbReady.catch(err => console.error('[DB] init error:', err));

// ---- JWT ミドルウェア ----
async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET, JWT_VERIFY_OPTS);
    if (!decoded || !decoded.accountId) return res.status(401).json({ error: 'Invalid token' });
    await dbReady;
    const user = await db.get('SELECT tokenVersion FROM accounts WHERE accountId = ?', [decoded.accountId]);
    if (!user || (user.tokenVersion || 0) !== (decoded.tv ?? 0)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!firstAccountId) await refreshFirstAccount();
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ---- 認証 API ----
app.post('/auth/login', authLimiter, loginAccountLimiter, async (req, res) => {
  const { accountId, password } = req.body;
  if (!accountId || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    if (!db) await initDB();
    const user = await db.get('SELECT * FROM accounts WHERE accountId = ?', [accountId]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials', code: 'invalid_credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials', code: 'invalid_credentials' });
    const token = jwt.sign({ accountId: user.accountId, tv: user.tokenVersion || 0 }, JWT_SECRET, JWT_SIGN_OPTS);
    const { passwordHash, ...profile } = user;
    res.json({ token, profile });
  } catch (err) {
    console.error('[Auth] login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// トークン検証 & プロフィール取得（アクセスのたびにトークンをリフレッシュ）
app.get('/auth/me', requireAuth, async (req, res) => {
  try {
    if (!db) await initDB();
    const user = await db.get('SELECT * FROM accounts WHERE accountId = ?', [req.user.accountId]);
    if (!user) return res.status(404).json({ error: 'Not found' });
    const { passwordHash, ...profile } = user;
    // 3日以内にアクセスがあれば新しいトークンを発行してリセット
    const newToken = jwt.sign({ accountId: user.accountId, tv: user.tokenVersion || 0 }, JWT_SECRET, JWT_SIGN_OPTS);
    res.json({ profile, token: newToken });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ----- ファイルアップロード設定 -----
const generalUploadDir = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(generalUploadDir)) fs.mkdirSync(generalUploadDir, { recursive: true });
const multerTmpDir = path.join(DATA_DIR, 'tmp');
if (!fs.existsSync(multerTmpDir)) fs.mkdirSync(multerTmpDir, { recursive: true });

// 過去の public/uploads から server/uploads への移行および dist/uploads のクリーンアップ
try {
  const legacyUploadDir = path.join(__dirname, '../public/uploads');
  if (fs.existsSync(legacyUploadDir)) {
    const legacyFiles = fs.readdirSync(legacyUploadDir);
    for (const f of legacyFiles) {
      const src = path.join(legacyUploadDir, f);
      const dst = path.join(generalUploadDir, f);
      if (!fs.existsSync(dst)) {
        try { fs.renameSync(src, dst); } catch { fs.copyFileSync(src, dst); fs.unlinkSync(src); }
      }
    }
    try { fs.rmdirSync(legacyUploadDir); } catch {}
  }
} catch (e) {
  log.warn('[Upload Migration] Failed to auto-migrate public/uploads:', e);
}
try {
  fs.rmSync(path.join(__dirname, '../dist/uploads'), { recursive: true, force: true });
} catch {}

// 添付ファイルの上限（MAX_UPLOAD_MB、既定 95MB = Cloudflare 無料プランの 100MB 制限に収まる値）。/api/config でクライアントにも渡す
const MAX_UPLOAD_BYTES = Math.floor(envNum('MAX_UPLOAD_MB', 95) * 1024 * 1024);
const fileUpload = multer({ 
  dest: multerTmpDir, 
  limits: { fileSize: MAX_UPLOAD_BYTES }
});
// 上限超えは 413 で返す（クライアントが「大きすぎます」と表示できるように）
const singleFileUpload = (req, res, next) => fileUpload.single('file')(req, res, (err) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large (max 95MB)', code: 'file_too_large' });
  console.error('[Upload] multer error:', err);
  return res.status(400).json({ error: 'Upload failed', code: 'upload_failed' });
});

const DATA_URL_TYPES = {
  'image/png': ['png', 10e6], 'image/jpeg': ['jpg', 10e6], 'image/gif': ['gif', 10e6], 'image/webp': ['webp', 10e6],
  'audio/webm': ['webm', 5e6], 'audio/ogg': ['ogg', 5e6], 'audio/mpeg': ['mp3', 5e6], 'audio/mp4': ['m4a', 5e6],
};
const DAILY_UPLOAD_LIMIT = 500 * 1024 * 1024;
const uploadQuota = new Map(); // accountId -> { day, bytes }
function takeUploadQuota(accountId, bytes) {
  const day = new Date().toISOString().slice(0, 10);
  const q = uploadQuota.get(accountId);
  const used = q && q.day === day ? q.bytes : 0;
  if (used + bytes > DAILY_UPLOAD_LIMIT) return false;
  uploadQuota.set(accountId, { day, bytes: used + bytes });
  return true;
}

// data URL を保存して /uploads/... を返す。だめなら null
async function saveDataUrl(dataUrl, prefix, kind /* 'image' | 'audio' */, accountId) {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:([a-z]+\/[a-z0-9.+-]+)((?:;[a-z0-9-]+=[a-z0-9.+-]+)*);base64,/i.exec(dataUrl);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const t = DATA_URL_TYPES[mime];
  if (!t || !mime.startsWith(kind + '/')) return null;
  const buf = Buffer.from(dataUrl.slice(m[0].length), 'base64');
  if (buf.length === 0 || buf.length > t[1]) return null;
  if (accountId && !takeUploadQuota(accountId, buf.length)) return null;
  const filename = `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${t[0]}`;
  await fs.promises.mkdir(generalUploadDir, { recursive: true });
  await fs.promises.writeFile(path.join(generalUploadDir, filename), buf);
  return `/uploads/${filename}`;
}

async function migrateDataUrls() {
  try {
    const rows = await db.all("SELECT id, imageUrl, audioUrl FROM messages WHERE imageUrl LIKE 'data:%' OR imageUrl LIKE '%|||data:%' OR audioUrl LIKE 'data:%'");
    for (const r of rows) {
      const img = r.imageUrl ? (await Promise.all(r.imageUrl.split('|||').map(u => (u.startsWith('data:') ? saveDataUrl(u, 'media', 'image', null) : u)))).filter(Boolean).join('|||') || null : null;
      const aud = r.audioUrl && r.audioUrl.startsWith('data:') ? await saveDataUrl(r.audioUrl, 'audio', 'audio', null) : r.audioUrl;
      await db.run('UPDATE messages SET imageUrl = ?, audioUrl = ?, updatedAt = ? WHERE id = ?', [img, aud, Date.now(), r.id]);
    }
    if (rows.length) console.log(`[Migrate] moved ${rows.length} data URL(s) to files`);
  } catch (err) {
    console.error('[Migrate] data URL migration error:', err);
  }
}
dbReady.then(migrateDataUrls).catch(e => console.error('[Migrate]', e));

// data: 以外のメディア URL の検証
const LOCAL_MEDIA_PREFIXES = ['/uploads/', '/server/stumps/', '/stumps/', '/server/stump/', '/stump/'];
function cleanMediaUrl(u) {
  if (typeof u !== 'string' || u.length > 2048) return null;
  if (u.includes('..')) return null;
  const qIdx = u.indexOf('?');
  if (qIdx !== -1) {
    try {
      const dummyUrl = new URL(u, 'http://localhost');
      const t = dummyUrl.searchParams.get('t');
      if (t && !/^\/uploads\/[A-Za-z0-9_]+_w1280\.webp$/.test(t)) {
        return null;
      }
    } catch {
      return null;
    }
  }
  if (LOCAL_MEDIA_PREFIXES.some(p => u.startsWith(p))) return u;
  if (/^https:\/\/[^\s"'<>\\]+$/i.test(u)) return u; // Klipy などの GIF
  return null;
}

const UPLOAD_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.webm', '.mov', '.mp3', '.wav', '.ogg', '.m4a', '.flac',
  '.pdf', '.txt', '.zip', '.7z', '.rar', '.json', '.jar', '.mcpack', '.mcworld', '.mcaddon']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

// プロフィール更新
app.patch('/auth/profile', requireAuth, async (req, res) => {
  let { displayName, pronouns, bio, profileColor1, profileColor2, profileColor3, profileBannerColor, nameStyle, avatarUrl, bannerUrl } = req.body;
  try {
    if (!db) await initDB();

    const toImageUrl = async (u, prefix) => {
      if (u == null) return null;                                     // COALESCE で前の値が残る
      if (typeof u === 'string' && u.startsWith('data:')) return saveDataUrl(u, prefix, 'image', req.user.accountId);
      return cleanMediaUrl(u);
    };
    avatarUrl = await toImageUrl(avatarUrl, 'avatar');
    bannerUrl = await toImageUrl(bannerUrl, 'banner');
    // ついでに文字列の長さも制限する
    const cut = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);
    displayName = cut(displayName, 32); pronouns = cut(pronouns, 40); bio = cut(bio, 500);
    await db.run(
      `UPDATE accounts SET
        displayName = COALESCE(?, displayName),
        pronouns = COALESCE(?, pronouns),
        bio = COALESCE(?, bio),
        profileColor1 = COALESCE(?, profileColor1),
        profileColor2 = COALESCE(?, profileColor2),
        profileColor3 = COALESCE(?, profileColor3),
        profileBannerColor = COALESCE(?, profileBannerColor),
        nameStyle = COALESCE(?, nameStyle),
        avatarUrl = COALESCE(?, avatarUrl),
        bannerUrl = COALESCE(?, bannerUrl)
      WHERE accountId = ?`,
      [displayName, pronouns, bio, profileColor1, profileColor2, profileColor3, profileBannerColor, nameStyle, avatarUrl, bannerUrl, req.user.accountId]
    );
    const user = await db.get('SELECT * FROM accounts WHERE accountId = ?', [req.user.accountId]);
    const { passwordHash, ...profile } = user;
    // 接続中の全クライアントにプロフィール更新を通知
    io.emit('profile_updated', { accountId: req.user.accountId, profile });
    res.json({ profile });
  } catch (err) {
    console.error('[Profile] update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// パスワード変更
app.post('/auth/change-password', requireAuth, authLimiter, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Missing fields' });
  try {
    if (!db) await initDB();
    const user = await db.get('SELECT * FROM accounts WHERE accountId = ?', [req.user.accountId]);
    if (!user) return res.status(404).json({ error: 'Not found' });
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(403).json({ error: 'Wrong password' });
    const hash = await bcrypt.hash(newPassword, 12);
    const newTv = (user.tokenVersion || 0) + 1;
    await db.run('UPDATE accounts SET passwordHash = ?, tokenVersion = ? WHERE accountId = ?', [hash, newTv, req.user.accountId]);
    io.in('user:' + req.user.accountId).disconnectSockets(true);
    const token = jwt.sign({ accountId: user.accountId, tv: newTv }, JWT_SECRET, JWT_SIGN_OPTS);
    res.json({ ok: true, success: true, token });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DM チャンネル ID 生成（順序固定）
function dmChannelId(a, b) {
  return [a, b].sort().join('__dm__');
}

const DM_TARGET_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// DM チャンネルを開く（なければ作成）
app.post('/dm/open', requireAuth, async (req, res) => {
  const { targetAccountId } = req.body;
  const me = req.user.accountId;
  if (
    !targetAccountId ||
    typeof targetAccountId !== 'string' ||
    !DM_TARGET_ID_RE.test(targetAccountId) ||
    targetAccountId.includes('__dm__') ||
    targetAccountId === me
  ) {
    return res.status(400).json({ error: 'Invalid targetAccountId' });
  }
  try {
    if (!db) await initDB();
    const targetUser = await db.get('SELECT accountId FROM accounts WHERE accountId = ?', [targetAccountId]);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const channelId = dmChannelId(me, targetAccountId);
    const existing = await db.get('SELECT * FROM dm_channels WHERE channelId = ?', [channelId]);
    if (!existing) {
      await db.run(
        'INSERT INTO dm_channels (channelId, member1, member2, createdAt) VALUES (?, ?, ?, ?)',
        [channelId, ...([me, targetAccountId].sort()), Date.now()]
      );
    }
    res.json({ channelId });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 自分の DM チャンネル一覧
app.get('/dm/list', requireAuth, async (req, res) => {
  const me = req.user.accountId;
  try {
    if (!db) await initDB();
    const rows = await db.all(
      `SELECT c.channelId, c.member1, c.member2,
              (SELECT MAX(timestamp) FROM messages m WHERE m.channelId = c.channelId AND (m.isDeleted IS NULL OR m.isDeleted = 0)) as lastMessageAt
       FROM dm_channels c 
       WHERE c.member1 = ? OR c.member2 = ? 
       ORDER BY (lastMessageAt IS NULL) ASC, lastMessageAt DESC`,
      [me, me]
    );
    const result = rows.map(r => ({
      channelId: r.channelId,
      partnerAccountId: r.member1 === me ? r.member2 : r.member1,
      lastMessageAt: r.lastMessageAt || null,
    }));
    res.json({ dms: result });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 既読位置を更新（チャンネルを開いたとき）
app.post('/read', requireAuth, async (req, res) => {
  const { channelId } = req.body;
  if (!channelId) return res.status(400).json({ error: 'Missing channelId' });
  const accountId = req.user.accountId;
  try {
    if (!db) await initDB();
    if (!(await canAccessChannel(accountId, channelId))) return res.status(403).json({ error: 'Forbidden' });
    await db.run(
      `INSERT INTO read_state (accountId, channelId, lastReadAt) VALUES (?, ?, ?)
       ON CONFLICT(accountId, channelId) DO UPDATE SET lastReadAt = excluded.lastReadAt`,
      [accountId, channelId, Date.now()]
    );
    
    io.to('user:' + accountId).emit('mark_read', { channelId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 全チャンネルの未読数を取得（ログイン時・リロード時）
app.get('/unread', requireAuth, async (req, res) => {
  const me = req.user.accountId;
  try {
    await dbReady;
    const dms = await db.all('SELECT channelId FROM dm_channels WHERE member1 = ? OR member2 = ?', [me, me]);
    const threads = await db.all("SELECT channelId FROM read_state WHERE accountId = ? AND channelId LIKE 'thread\\_%' ESCAPE '\\'", [me]);
    const channels = [
      ...PUBLIC_CHANNELS,
      ...[...RESTRICTED_CHANNELS].filter(() => isAdmin(me)),
      ...dms.map(d => d.channelId),
      ...threads.map(t => t.channelId),
    ];
    const reads = await db.all('SELECT channelId, lastReadAt FROM read_state WHERE accountId = ?', [me]);
    const lastRead = Object.fromEntries(reads.map(r => [r.channelId, r.lastReadAt]));
    const counts = {};
    const mentions = {};
    await Promise.all(channels.map(async (ch) => {
      const row = await db.get(
        `SELECT COUNT(*) AS c FROM (
           SELECT 1 FROM messages
           WHERE channelId = ? AND timestamp > ? AND isDeleted = 0 AND user != ?
           LIMIT 100
         )`,
        [ch, lastRead[ch] || 0, me]
      );
      if (row && row.c > 0) {
        counts[ch] = row.c;
        // 未読の中で自分宛てメンション（<accountId> / <everyone> / <hamachill>）の数
        const mrow = await db.get(
          `SELECT COUNT(*) AS c FROM (
             SELECT 1 FROM messages
             WHERE channelId = ? AND timestamp > ? AND isDeleted = 0 AND user != ?
               AND (instr(text, ?) > 0 OR instr(text, '<everyone>') > 0 OR instr(text, '<hamachill>') > 0)
             LIMIT 100
           )`,
          [ch, lastRead[ch] || 0, me, `<${me}>`]
        );
        if (mrow && mrow.c > 0) mentions[ch] = mrow.c;
      }
    }));
    res.json({ counts, mentions });
  } catch (err) {
    console.error('[Unread] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post(['/upload', '/api/upload'], requireAuth, singleFileUpload, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    if (!takeUploadQuota(req.user.accountId, req.file.size)) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(429).json({ error: 'Daily upload limit reached', code: 'daily_upload_limit' });
    }
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 200);
    let ext = path.extname(originalName).toLowerCase();
    if (!UPLOAD_EXT.has(ext)) ext = '.bin';
    // ボイスメッセージ：録音形式はブラウザで違う（Chrome は webm、Firefox は ogg、Safari は mp4）。
    // mimetype には ";codecs=opus" が付くことがあるので、その手前だけで判定する。
    const baseMime = String(req.file.mimetype || '').split(';')[0].trim().toLowerCase();
    const VOICE_TYPES = { '.webm': /^(audio|video)\/webm$/, '.ogg': /^audio\/ogg$/, '.m4a': /^audio\/(mp4|x-m4a)$/ };
    const isVoice = req.body?.kind === 'voice' && !!VOICE_TYPES[ext]
      && VOICE_TYPES[ext].test(baseMime) && req.file.size <= 10 * 1024 * 1024;
    const isImage = IMAGE_EXT.has(ext) && /^image\/(png|jpeg|gif|webp)$/.test(req.file.mimetype);
    const prefix = isVoice ? 'audio' : (isImage ? 'img' : 'file');
    let thumbUrl = null;
    if (isImage && sharp && ext !== '.gif' && req.file.size <= 25 * 1024 * 1024) {
      const thumbFilename = `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}_w1280.webp`;
      const thumbPath = path.join(generalUploadDir, thumbFilename);
      try {
        const img = sharp(req.file.path, { limitInputPixels: 40e6, failOn: 'error' }).rotate();
        const meta = await img.metadata();
        if (['jpeg', 'png', 'webp'].includes(meta.format)) {
          await img.resize(1280, null, { withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(thumbPath);
          thumbUrl = `/uploads/${thumbFilename}`;
        }
      } catch (e) {
        log.warn('[Upload] Thumb generation failed:', e.message);
      }
    }
    const newFilename = `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    await fs.promises.rename(req.file.path, path.join(generalUploadDir, newFilename));
    res.json({
      url: `/uploads/${newFilename}`,
      thumbUrl: thumbUrl || `/uploads/${newFilename}`,
      name: originalName,
      size: req.file.size,
      type: req.file.mimetype
    });
  } catch (err) {
    console.error('[Upload] error:', err);
    await fs.promises.unlink(req.file.path).catch(() => {});
    res.status(500).json({ error: 'Upload failed', code: 'upload_failed' });
  }
});

// 定期クリーンアップ：3日経過したファイルを削除
setInterval(() => {
  if (!fs.existsSync(generalUploadDir)) return;
  fs.readdir(generalUploadDir, (err, files) => {
    if (err) return;
    const now = Date.now();
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
    files.forEach(f => {
      if (f.startsWith('file_')) {
        const filePath = path.join(generalUploadDir, f);
        fs.stat(filePath, (err, stats) => {
          if (!err && now - stats.mtimeMs > THREE_DAYS) {
            fs.unlink(filePath, () => {});
          }
        });
      }
    });
  });
}, 1000 * 60 * 60); // 1時間ごとにチェック
// ------------------------------------------

// ---- クライアント向け設定（ICE サーバー・GIF 検索の有無・自分の権限）----
// ICE_SERVERS: JSON（[{"urls":"stun:stun.example.com:3478"}]）か、カンマ区切りの URL（stun:a:3478,turn:b:3478）
// 空なら ICE サーバーなし（同じ LAN 内でだけ通話できる）
function parseIceServers(raw) {
  const v = String(raw || '').trim();
  if (!v) return [];
  if (v.startsWith('[') || v.startsWith('{')) {
    try {
      const j = JSON.parse(v);
      const list = Array.isArray(j) ? j : [j];
      return list.filter(x => x && (typeof x.urls === 'string' || Array.isArray(x.urls)));
    } catch (e) {
      console.error('[Config] ICE_SERVERS is not valid JSON:', e.message);
      return [];
    }
  }
  return splitList(v).map(urls => ({ urls }));
}
const ICE_SERVERS = parseIceServers(process.env.ICE_SERVERS);
const gifEnabled = () => !!(process.env.KLIPY_API || process.env.VITE_KLIPY_API);

app.get('/config', async (req, res) => {
  const out = { iceServers: ICE_SERVERS, gifEnabled: gifEnabled(), maxUploadBytes: MAX_UPLOAD_BYTES, me: null };
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(auth.slice(7), JWT_SECRET, JWT_VERIFY_OPTS);
      await dbReady;
      const acc = decoded?.accountId && await db.get('SELECT tokenVersion FROM accounts WHERE accountId = ?', [decoded.accountId]);
      if (acc && (acc.tokenVersion || 0) === (decoded.tv ?? 0)) {
        if (!firstAccountId) await refreshFirstAccount();
        out.me = { accountId: decoded.accountId, isAdmin: isAdmin(decoded.accountId) };
      }
    } catch { /* 未ログイン扱い */ }
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json(out);
});

// オンラインメンバー一覧（Socket 接続中）
app.get('/members', requireAuth, async (req, res) => {
  try {
    if (!db) await initDB();
    const all = await db.all('SELECT accountId, firstName, displayName, pronouns, bio, profileColor1, profileColor2, profileColor3, profileBannerColor, nameStyle, avatarUrl, bannerUrl FROM accounts');
    res.json({ members: all });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});



// Klipy API Proxy
app.get('/gifs', requireAuth, async (req, res) => {
  const { query, limit, pos } = req.query;
  const klipyKey = process.env.KLIPY_API || process.env.VITE_KLIPY_API;
  
  if (!klipyKey) {
    return res.status(404).json({ error: 'GIF search is disabled (KLIPY_API is not configured)' });
  }

  try {
    const limitParam = limit || 20;
    const posParam = pos ? `&pos=${pos}` : '';
    
    const endpoint = query && query.trim() !== ''
      ? `https://api.klipy.com/v2/search?q=${encodeURIComponent(query)}&key=${klipyKey}&limit=${limitParam}${posParam}&contentfilter=off`
      : `https://api.klipy.com/v2/featured?key=${klipyKey}&limit=${limitParam}${posParam}&contentfilter=off`;
      
    const fetchRes = await fetch(endpoint);
    const data = await fetchRes.json();
    res.json(data);
  } catch (err) {
    console.error('[API/GIFs] error:', err);
    res.status(500).json({ error: 'Failed to fetch GIFs' });
  }
});

// ---- YouTube チャンネル情報取得（T4-3 / S10・M12）----
const ytChannelCache = new Map(); // url -> { at, ok, data }
const YT_CHANNEL_RE = /^https:\/\/(?:www\.|m\.)?youtube\.com\/(?:@[A-Za-z0-9._-]{1,100}|channel\/UC[A-Za-z0-9_-]{22}|c\/[A-Za-z0-9._-]{1,100}|user\/[A-Za-z0-9._-]{1,100})\/?$/;
const metaContent = (html, prop) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i'));
  return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'") : null;
};
app.get('/yt-channel', requireAuth, async (req, res) => {
  const url = String(req.query.url || '').split('?')[0];
  if (!YT_CHANNEL_RE.test(url)) return res.status(400).json({ error: 'bad url' });
  const hit = ytChannelCache.get(url);
  const ttl = hit && hit.ok ? 24 * 3600e3 : 3600e3;
  if (hit && Date.now() - hit.at < ttl) return hit.ok ? res.json(hit.data) : res.status(404).json({ error: 'not found' });
  try {
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'Accept-Language': 'ja,en;q=0.8', 'User-Agent': 'Mozilla/5.0' } });
    const html = r.ok ? (await r.text()).slice(0, 2_000_000) : '';
    const channelId = (html.match(/"channelId":"(UC[A-Za-z0-9_-]{22})"/) || [])[1] || metaContent(html, 'identifier');
    const data = channelId ? {
      channelId,
      channelName: metaContent(html, 'og:title'),
      iconUrl: metaContent(html, 'og:image'),
      description: (metaContent(html, 'og:description') || '').slice(0, 300),
    } : null;
    ytChannelCache.set(url, { at: Date.now(), ok: !!data, data });
    if (ytChannelCache.size > 500) ytChannelCache.delete(ytChannelCache.keys().next().value);
    return data ? res.json(data) : res.status(404).json({ error: 'not found' });
  } catch {
    ytChannelCache.set(url, { at: Date.now(), ok: false, data: null });
    return res.status(502).json({ error: 'fetch failed' });
  }
});

// ---- Socket.io ----
// 一時的な瞬断で VC 切断→再参加が頻発しないよう、切断猶予（15秒）を設ける
const VOICE_DISCONNECT_GRACE_MS = 15000;
const pendingVoiceDisconnects = new Map(); // accountId -> { timer, socketId, roomId, peerId }

function clearPendingVoiceDisconnect(key) {
  if (!key) return null;
  const entry = pendingVoiceDisconnects.get(key);
  if (entry) {
    clearTimeout(entry.timer);
    pendingVoiceDisconnects.delete(key);
  }
  return entry;
}

function broadcastVoiceState() {
  io.emit('voice_state_update', Object.values(voiceUsers));
}

function cleanupVoiceUser(socketId) {
  const user = voiceUsers[socketId];
  if (!user) return;
  delete voiceUsers[socketId];
  io.emit('user_left_voice', { socketId, peerId: user.peerId });
  broadcastVoiceState();
}

// 接続中ソケット → accountId のマップ
const socketAccounts = {};


// ===== チャンネル権限・送信の共通ヘルパー（T1-3）=====
 
// 管理者: .env の ADMIN_IDS（カンマ区切り）。空なら最初に作られたアカウントが管理者
const ADMIN_IDS = new Set(splitList(process.env.ADMIN_IDS));
let firstAccountId = null;
async function refreshFirstAccount() {
  if (ADMIN_IDS.size > 0 || !db) return;
  try {
    const row = await db.get('SELECT accountId FROM accounts ORDER BY createdAt ASC, rowid ASC LIMIT 1');
    firstAccountId = row ? row.accountId : null;
  } catch { /* まだテーブルがない */ }
}
const adminIdList = () => (ADMIN_IDS.size > 0 ? [...ADMIN_IDS] : (firstAccountId ? [firstAccountId] : []));
// ※ App.jsx の allChannels を増やしたらここも増やすこと
const PUBLIC_CHANNELS = new Set([
  'rules', 'announcements', 'general', 'threads', 'forum_metadata',
]);
const RESTRICTED_CHANNELS = new Set(['logs']); // 管理者だけ
const THREAD_RE = /^thread_[0-9A-Za-z]{1,40}$/;

const isAdmin = (accountId) => !!accountId && adminIdList().includes(accountId);
const isDmChannel = (channelId) => typeof channelId === 'string' && channelId.includes('__dm__');
const RESERVED_MARKERS_RE = /__(SVG|HYPIXEL|HOPLITE)__/g; // 昔のカード形式。ユーザーには使わせない
const RESERVED_MARKERS_TEST_RE = /__(SVG|HYPIXEL|HOPLITE)__/;
function stripReservedMarkers(text) {
  if (typeof text !== 'string') return '';
  let clean = text;
  let prev;
  do {
    prev = clean;
    clean = clean.replace(RESERVED_MARKERS_RE, '');
  } while (clean !== prev);
  return clean;
}
const MAX_TEXT = 8000; // 投票・フィードバックの JSON があるので本文上限より大きくする
const MAX_MESSAGE_CHARS = 1256; // 普通のメッセージ本文の上限（src/constants/limits.js と揃える）

// "a__dm__b" が「正しい並び順の 2 人分」になっているときだけ [a, b] を返す
function dmMembersFromId(channelId) {
  const parts = channelId.split('__dm__');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  if (dmChannelId(parts[0], parts[1]) !== channelId) return null;
  return parts;
}

// DM のメンバーは dm_channels テーブルを正とする
async function getDmMembers(channelId) {
  const row = await db.get('SELECT member1, member2 FROM dm_channels WHERE channelId = ?', [channelId]);
  return row ? [row.member1, row.member2] : null;
}

// 読める？（履歴・検索・ピン・ルーム参加の前に必ず呼ぶ）
async function canAccessChannel(accountId, channelId) {
  if (!accountId || typeof channelId !== 'string' || channelId.length === 0 || channelId.length > 200) return false;
  if (isDmChannel(channelId)) {
    // 行がまだない新しい DM は、ID の形が正しくて自分が入っているときだけ OK（中身は空）
    const members = (await getDmMembers(channelId)) || dmMembersFromId(channelId);
    return !!members && members.includes(accountId);
  }
  if (channelId === 'logs') return isAdmin(accountId);
  if (PUBLIC_CHANNELS.has(channelId)) return true;
  if (THREAD_RE.test(channelId)) return true;
  return false; // 知らないチャンネルは拒否
}

// 書ける？（send_message の前に呼ぶ）
async function canPostChannel(accountId, channelId) {
  if (!(await canAccessChannel(accountId, channelId))) return false;
  if (channelId === 'logs') return false;                                   // システムだけが書く
  if (channelId === 'announcements' || channelId === 'rules') return isAdmin(accountId);
  if (isDmChannel(channelId) && !(await getDmMembers(channelId))) {
    // DM の行がなければ、相手が実在するときだけ作る（/dm/open と同じ）
    const m = dmMembersFromId(channelId);
    const other = m && m.find(x => x !== accountId);
    if (!other) return false;
    const exists = await db.get('SELECT 1 FROM accounts WHERE accountId = ?', [other]);
    if (!exists) return false;
    await db.run(
      'INSERT OR IGNORE INTO dm_channels (channelId, member1, member2, createdAt) VALUES (?, ?, ?, ?)',
      [channelId, m[0], m[1], Date.now()]
    );
  }
  return true;
}

// 送り先のアカウント一覧。null = 全員（公開チャンネル）
async function recipientsOf(channelId) {
  if (isDmChannel(channelId)) return (await getDmMembers(channelId)) || dmMembersFromId(channelId) || [];
  if (channelId === 'logs') return adminIdList();
  return null;
}

// チャンネル宛ての送信は全部これを通す（DM・制限チャンネルは本人たちの全タブだけに届く）
async function emitToChannel(channelId, event, payload) {
  const to = await recipientsOf(channelId);
  if (to === null) { io.emit(event, payload); return; }
  if (to.length === 0) return;
  let op = io.to('user:' + to[0]);
  for (let i = 1; i < to.length; i++) op = op.to('user:' + to[i]);
  op.emit(event, payload);
}

// 壊れた JSON でも落ちない行変換（7 か所のコピペを置き換える）
const MSG_COLS = 'id, user, timestamp, text, imageUrl, audioUrl, fileUrl, fileName, fileSize, fileType, channelId, replyTo, reactions, isEdited, editHistory, pollVotes, isPinned, isDeleted, updatedAt';
const noDataUrl = (v) => (typeof v === 'string' && v.startsWith('data:') ? null : v);

function safeJson(s, fallback) {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}
function rowToMessage(r) {
  if (r.isDeleted) {
    return {
      id: r.id,
      channelId: r.channelId,
      timestamp: r.timestamp,
      updatedAt: r.updatedAt,
      isDeleted: true,
      user: r.user,
      text: '',
      editHistory: [],
      reactions: [],
      replyTo: null,
      imageUrl: null,
      audioUrl: null,
      fileUrl: null,
      fileName: null,
      fileSize: null,
      fileType: null,
      isEdited: false,
      isPinned: false,
      pollVotes: {},
    };
  }
  return {
    ...r,
    imageUrl: noDataUrl(r.imageUrl),
    audioUrl: noDataUrl(r.audioUrl),
    isEdited: !!r.isEdited,
    isPinned: !!r.isPinned,
    editHistory: safeJson(r.editHistory, []),
    pollVotes: safeJson(r.pollVotes, {}),
    replyTo: safeJson(r.replyTo, null),
    reactions: safeJson(r.reactions, []),
  };
}

// メッセージ ID はサーバーが出す（C3）。
// 13 桁の数字だけにする: メッセージリンク <13桁_チャンネルID> の "_" 以降は
// チャンネル ID として読まれる（Message.jsx:1368-1374 / ChatControls.jsx:101）ので、
// ID に "_乱数" を付けるとリンクが壊れる。同じミリ秒なら +1 してずらす。
let lastMsgId = 0;
function newMessageId() {
  lastMsgId = Math.max(Date.now(), lastMsgId + 1);
  return String(lastMsgId);
}

// INSERT OR REPLACE は使わない。ID がかぶったら新しい ID で入れ直す
async function insertMessage(m) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.run(
        `INSERT INTO messages (id, user, timestamp, text, imageUrl, audioUrl, fileUrl, fileName, fileSize, fileType, channelId, replyTo, reactions, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [m.id, m.user, m.timestamp, m.text ?? '', m.imageUrl ?? null, m.audioUrl ?? null,
         m.fileUrl ?? null, m.fileName ?? null, m.fileSize ?? null, m.fileType ?? null,
         m.channelId, m.replyTo ? JSON.stringify(m.replyTo) : null, JSON.stringify(m.reactions || []), m.timestamp]
      );
      return m;
    } catch (e) {
      if (e && e.code === 'SQLITE_CONSTRAINT' && attempt < 4) { m.id = newMessageId(); continue; }
      throw e;
    }
  }
}

// システム・ボットの投稿はこれを使う
// システムメッセージは言語に依存しない形で保存し、表示側（src/utils/systemMessages.js）で翻訳する
const systemText = (k, data = {}) => '__SYS__' + JSON.stringify({ k, ...data });

async function sendSystemMessage({ user = 'hamachill', channelId, text = '', replyTo = null, imageUrl = null, audioUrl = null }) {
  const msg = { id: newMessageId(), user, timestamp: Date.now(), text, channelId, imageUrl, audioUrl, replyTo, reactions: [] };
  await insertMessage(msg);
  await emitToChannel(channelId, 'receive_message', msg);
  return msg;
}

// 「自分が読めるチャンネルのメッセージ」だけを返す（H3 で使う）
async function getAccessibleMessage(accountId, messageId) {
  if (typeof messageId !== 'string' || messageId.length > 100) return null;
  const row = await db.get('SELECT * FROM messages WHERE id = ?', [messageId]);
  if (!row) return null;
  if (!(await canAccessChannel(accountId, row.channelId))) return null;
  return row;
}

// 同じメッセージへの読み書きを順番に実行する（投票・リアクションの lost update 対策 / M4）
const msgLocks = new Map();
function withMessageLock(id, fn) {
  const prev = msgLocks.get(id) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  msgLocks.set(id, run);
  run.finally(() => { if (msgLocks.get(id) === run) msgLocks.delete(id); }).catch(() => {});
  return run;
}

function clampPollEndTime(text) {
  if (typeof text !== 'string' || !text.includes('__POLL__')) return text;
  const parts = text.split('__POLL__');
  try {
    const pollData = JSON.parse(parts[1]);
    const now = Date.now();
    const maxEnd = now + 30 * 24 * 60 * 60 * 1000;
    if (!pollData.endTime || typeof pollData.endTime !== 'number' || isNaN(pollData.endTime)) {
      pollData.endTime = now + 24 * 60 * 60 * 1000;
    } else if (pollData.endTime > maxEnd) {
      pollData.endTime = maxEnd;
    }
    return parts[0] + '__POLL__' + JSON.stringify(pollData);
  } catch {
    return text;
  }
}

function normalizePoll(text) {
  const i = text.indexOf('__POLL__');
  if (i < 0) return text;
  const p = safeJson(text.slice(i + 8), null);
  if (!p || typeof p !== 'object' || typeof p.question !== 'string' || !Array.isArray(p.options)) return null;
  const options = p.options.filter(o => typeof o === 'string').map(o => o.slice(0, 80)).slice(0, 10);
  if (options.length < 2) return null;
  const clean = {
    question: p.question.slice(0, 300),
    options,
    endTime: p.endTime,
    multipleChoice: p.multipleChoice === true,
    anonymous: p.anonymous === true,
    allowAddOptions: p.allowAddOptions === true
  };
  return clampPollEndTime(text.slice(0, i) + '__POLL__' + JSON.stringify(clean));
}

function normalizeFeedback(text) {
  if (!text.startsWith('__FEEDBACK__')) return null;
  const p = safeJson(text.slice(12), null);
  if (!p || typeof p !== 'object' || typeof p.title !== 'string') return null;
  const clean = {
    title: p.title.slice(0, 300),
    anonymous: p.anonymous === true,
    endTime: typeof p.endTime === 'number' && Number.isFinite(p.endTime) ? p.endTime : null,
    responses: []
  };
  return '__FEEDBACK__' + JSON.stringify(clean);
}

// ---- 投票の自動締め切り（T6-5 / L3）----
async function checkClosedPolls() {
  try {
    await dbReady;
    const now = Date.now();
    const rows = await db.all("SELECT id, user, text, channelId, pollVotes FROM messages WHERE instr(text, '__POLL__') > 0 AND (pollClosed IS NULL OR pollClosed = 0)");
    for (const row of rows) {
      if (!row.text || !row.text.includes('__POLL__')) continue;
      const parts = row.text.split('__POLL__');
      const pollData = safeJson(parts[1], null);
      if (!pollData || typeof pollData.endTime !== 'number') {
        await db.run('UPDATE messages SET pollClosed = 1 WHERE id = ?', [row.id]);
        continue;
      }
      if (pollData.endTime <= now) {
        await db.run('UPDATE messages SET pollClosed = 1 WHERE id = ?', [row.id]);
        const votes = safeJson(row.pollVotes, {});
        const results = (Array.isArray(pollData.options) ? pollData.options : []).map((opt, idx) => ({
          option: String(opt),
          count: Object.values(votes).filter(v => Array.isArray(v) ? v.includes(idx) : v === idx).length,
        }));
        await sendSystemMessage({
          channelId: row.channelId,
          text: systemText('poll_closed', { results }),
          replyTo: { id: row.id, user: row.user, text: pollData.question || '' },
        });
      }
    }
  } catch (err) {
    console.error('[Poll Check Error]', err);
  }
}
dbReady.then(() => checkClosedPolls()).catch(() => {});
const pollInterval = setInterval(checkClosedPolls, 60 * 1000);
pollInterval.unref();

 

function rateOk(socket, key, max, perMs) {
  const now = Date.now();
  const buckets = socket.data.rl || (socket.data.rl = {});
  let b = buckets[key];
  if (!b || now - b.t >= perMs) b = buckets[key] = { t: now, n: 0 };
  return ++b.n <= max;
}
const SOUND_FILE_RE = /^(?:[A-Za-z0-9_-]+\/)?[^/\\]{1,120}\.(mp3|wav|ogg)$/i;
const VC_ROOMS = new Set(['vc1', 'vc2', 'vc3']);
const PEER_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

let vcNames = { vc1: 'VC 1', vc2: 'VC 2', vc3: 'VC 3' };

// ---- Socket.io 接続時の認証（T1-2 / C2）----
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (typeof token !== 'string' || token.length === 0 || token.length > 4096) {
      return next(new Error('unauthorized'));
    }
    const payload = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTS);
    if (!payload || typeof payload.accountId !== 'string') return next(new Error('unauthorized'));
    await dbReady;
    const acc = await db.get('SELECT accountId, displayName, firstName, tokenVersion FROM accounts WHERE accountId = ?', [payload.accountId]);
    if (!acc || (acc.tokenVersion || 0) !== (payload.tv ?? 0)) return next(new Error('unauthorized'));
    if (!firstAccountId) await refreshFirstAccount();
    socket.data.accountId = acc.accountId;
    socket.data.displayName = acc.displayName || acc.firstName || acc.accountId;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  // ---- すべての handler を守るラッパー（T3-1 / H2）----
  // 第 1 引数の型。書いていないイベントは「プレーンオブジェクト」が必要
  const ARG_KIND = {
    join_room: 'string',
    preload_channels: 'array',
    // 引数なしのイベント
    authenticate: 'any', leave_voice: 'any', stop_screen_share: 'any',
    // socket.io の予約イベント
    disconnect: 'any', disconnecting: 'any', error: 'any',
  };
  const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const argOk = (kind, v) =>
    kind === 'any' ? true :
    kind === 'string' ? typeof v === 'string' && v.length <= 200 :
    kind === 'array' ? Array.isArray(v) :
    kind === 'number' ? typeof v === 'number' && Number.isFinite(v) :
    isPlainObject(v);
  const rawOn = socket.on.bind(socket);
  socket.on = (event, handler) => rawOn(event, (...args) => {
    const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (!argOk(ARG_KIND[event] || 'object', args[0])) {
      if (ack) { try { ack(null); } catch {} }
      return;
    }
    try {
      const r = handler(...args);
      if (r && typeof r.then === 'function') r.catch(err => console.error(`[Socket] ${event} failed:`, err));
    } catch (err) {
      console.error(`[Socket] ${event} failed:`, err);
    }
  });

  const me = socket.data.accountId; // ← このソケットの本人。以降はこれだけを信じる
  socketAccounts[socket.id] = me;
  socket.join('user:' + me);
  socket.emit('online_users', getOnlineUsers());
  broadcastOnline();

  socket.emit('vc_names', vcNames);
  log.debug(`[Socket] +${socket.id}`);
  socket.emit('voice_state_update', Object.values(voiceUsers));

  // 互換用: 古いクライアントが送ってくるだけ。認証は接続時（io.use）に済んでいる
  socket.on('authenticate', () => {
    socket.emit('authenticated', { ok: true });
  });

  // ---- Chat ----
  let openRoom = null;
  socket.on('open_channel', async ({ channelId, since } = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    try {
      if (!(await canAccessChannel(me, channelId))) { socket.emit('dm_unauthorized'); return reply(null); }
      if (openRoom && openRoom !== channelId) socket.leave(openRoom);
      socket.join(channelId);
      openRoom = channelId;

      const rs = await db.get('SELECT lastReadAt FROM read_state WHERE accountId = ? AND channelId = ?', [me, channelId]);
      const lastReadAt = rs?.lastReadAt || 0;
      await db.run(
        `INSERT INTO read_state (accountId, channelId, lastReadAt) VALUES (?, ?, ?)
         ON CONFLICT(accountId, channelId) DO UPDATE SET lastReadAt = excluded.lastReadAt`,
        [me, channelId, Date.now()]
      );
      io.to('user:' + me).emit('mark_read', { channelId });

      let rows, full;
      if (Number.isFinite(since) && since > 0) {
        rows = await db.all(
          `SELECT ${MSG_COLS} FROM messages WHERE channelId = ? AND updatedAt > ? ORDER BY timestamp ASC LIMIT 51`,
          [channelId, since]
        );
        full = false;
        if (rows.length > 50) { // 差分が多すぎる → 最新 30 件を取り直す
          rows = (await db.all(`SELECT ${MSG_COLS} FROM messages WHERE channelId = ? AND isDeleted = 0 ORDER BY timestamp DESC LIMIT 30`, [channelId])).reverse();
          full = true;
        }
      } else {
        rows = (await db.all(`SELECT ${MSG_COLS} FROM messages WHERE channelId = ? AND isDeleted = 0 ORDER BY timestamp DESC LIMIT 30`, [channelId])).reverse();
        full = true;
      }
      reply({ channelId, messages: rows.map(rowToMessage), full, hasMore: full ? rows.length === 30 : undefined, lastReadAt });
    } catch (err) { console.error('[DB] open_channel:', err); reply(null); }
  });

  socket.on('preload_channels', async (channelIds) => {
    try {
      const ids = [...new Set((Array.isArray(channelIds) ? channelIds : []).filter(x => typeof x === 'string'))].slice(0, 100);
      const allowed = [];
      for (const id of ids) if (await canAccessChannel(me, id)) allowed.push(id);
      if (allowed.length === 0) return socket.emit('all_channels_history', {});
      const ph = allowed.map(() => '?').join(',');
      const reads = await db.all(`SELECT channelId, lastReadAt FROM read_state WHERE accountId = ? AND channelId IN (${ph})`, [me, ...allowed]);
      const rows = await db.all(
        `SELECT * FROM (
           SELECT ${MSG_COLS}, ROW_NUMBER() OVER (PARTITION BY channelId ORDER BY timestamp DESC) AS rn
           FROM messages WHERE channelId IN (${ph}) AND isDeleted = 0
         ) WHERE rn <= 31 ORDER BY channelId, timestamp ASC`,
        allowed
      );
      const result = {};
      for (const id of allowed) result[id] = { messages: [], hasMore: false, lastReadAt: 0 };
      for (const r of reads) result[r.channelId].lastReadAt = r.lastReadAt;
      for (const r of rows) {
        const slot = result[r.channelId];
        if (r.rn === 31) { slot.hasMore = true; continue; } // 31 件目は「まだある」の印
        delete r.rn;
        slot.messages.push(rowToMessage(r));
      }
      socket.emit('all_channels_history', result);
    } catch (err) { console.error('[DB] preload_channels error:', err); }
  });

  socket.on('join_room', async (roomId) => {
    try {
      if (!(await canAccessChannel(me, roomId))) { socket.emit('dm_unauthorized'); return; }
      socket.join(roomId);
      const rs = await db.get('SELECT lastReadAt FROM read_state WHERE accountId = ? AND channelId = ?', [me, roomId]);
      const rows = await db.all(
        'SELECT * FROM messages WHERE channelId = ? AND isDeleted = 0 ORDER BY timestamp DESC LIMIT 30', [roomId]
      );
      socket.emit('message_history', {
        channelId: roomId, messages: rows.reverse().map(rowToMessage), hasMore: rows.length === 30, lastReadAt: rs?.lastReadAt || 0,
      });
    } catch (err) { console.error('[DB] join_room:', err); }
  });

  // スレッド一覧用: forum_metadata（スレッドのメタ情報）を全件返す。履歴の 30 件制限とは別
  socket.on('forum_threads', async (_opts, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    try {
      if (!rateOk(socket, 'forum_threads', 10, 10000)) return reply({ ok: false, error: 'rate_limited' });
      if (!(await canAccessChannel(me, 'forum_metadata'))) return reply({ ok: false, error: 'forbidden' });
      const rows = await db.all(
        `SELECT ${MSG_COLS} FROM messages WHERE channelId = 'forum_metadata' AND isDeleted = 0 ORDER BY timestamp ASC LIMIT 5000`
      );
      reply({ ok: true, channelId: 'forum_metadata', messages: rows.map(rowToMessage) });
    } catch (err) {
      console.error('[DB] forum_threads:', err);
      reply({ ok: false, error: 'server_error' });
    }
  });

  socket.on('load_more', async ({ channelId, before, reqId } = {}) => {
    try {
      if (typeof before !== 'number' || !(await canAccessChannel(me, channelId))) return;
      const rows = await db.all(
        'SELECT * FROM messages WHERE channelId = ? AND timestamp < ? AND isDeleted = 0 ORDER BY timestamp DESC LIMIT 30',
        [channelId, before]
      );
      socket.emit('load_more_result', { channelId, messages: rows.reverse().map(rowToMessage), hasMore: rows.length === 30, reqId: Number.isInteger(reqId) ? reqId : undefined });
    } catch (err) { console.error('[DB] load_more:', err); }
  });

  socket.on('load_newer', async ({ channelId, after, reqId } = {}) => {
    try {
      if (typeof after !== 'number' || !(await canAccessChannel(me, channelId))) return;
      const rows = await db.all(
        'SELECT * FROM messages WHERE channelId = ? AND timestamp > ? AND isDeleted = 0 ORDER BY timestamp ASC LIMIT 30',
        [channelId, after]
      );
      socket.emit('load_newer_result', { channelId, messages: rows.map(rowToMessage), hasNewer: rows.length === 30, reqId: Number.isInteger(reqId) ? reqId : undefined });
    } catch (err) { console.error('[DB] load_newer:', err); }
  });

  socket.on('get_message_context', async ({ messageId } = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    try {
      const target = await getAccessibleMessage(me, messageId);   // 行の channelId で判定
      if (!target) return reply(null);
      const ch = target.channelId;
      const beforeRows = await db.all(
        'SELECT * FROM messages WHERE channelId = ? AND timestamp <= ? AND isDeleted = 0 ORDER BY timestamp DESC LIMIT 20',
        [ch, target.timestamp]
      );
      const afterRows = await db.all(
        'SELECT * FROM messages WHERE channelId = ? AND timestamp > ? AND isDeleted = 0 ORDER BY timestamp ASC LIMIT 20',
        [ch, target.timestamp]
      );
      reply({
        messages: [...beforeRows.reverse(), ...afterRows].map(rowToMessage),
        hasOlder: beforeRows.length === 20, hasNewer: afterRows.length === 20, targetChannelId: ch,
      });
    } catch (err) { console.error('[DB] get_message_context:', err); reply(null); }
  });

  socket.on('get_message', async ({ messageId } = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    try {
      const row = await getAccessibleMessage(me, messageId);
      reply(row ? rowToMessage(row) : null);
    } catch (err) { console.error('[DB] get_message:', err); reply(null); }
  });

  socket.on('typing_status', async ({ channelId, isTyping } = {}) => {
    try {
      if (typeof channelId !== 'string' || !(await canAccessChannel(me, channelId))) return;
      const isPrivate = isDmChannel(channelId) || RESTRICTED_CHANNELS.has(channelId);
      if (isPrivate) {
        await emitToChannel(channelId, 'typing_status', { channelId, user: me, isTyping: !!isTyping });
      } else {
        socket.to(channelId).emit('typing_status', { channelId, user: me, isTyping: !!isTyping });
      }
    } catch (err) { console.error('[Socket] typing_status:', err); }
  });

  socket.on('mark_read_req', async ({ channelId } = {}) => {
    try {
      if (typeof channelId !== 'string' || !(await canAccessChannel(me, channelId))) return;
      await db.run(
        `INSERT INTO read_state (accountId, channelId, lastReadAt) VALUES (?, ?, ?)
         ON CONFLICT(accountId, channelId) DO UPDATE SET lastReadAt = excluded.lastReadAt`,
        [me, channelId, Date.now()]
      );
      io.to('user:' + me).emit('mark_read', { channelId });
    } catch (e) { console.error('[DB] mark_read error:', e); }
  });

  socket.on('open_dm', async ({ targetAccountId } = {}) => {
    try {
      if (typeof targetAccountId !== 'string' || targetAccountId === me) return;
      const channelId = dmChannelId(me, targetAccountId);
      const members = await getDmMembers(channelId);       // /dm/open で作られたものだけ
      if (!members || !members.includes(me)) return;
      io.to('user:' + targetAccountId).emit('open_dm', { targetAccountId: me, channelId, fromAccountId: me });
      io.to('user:' + me).emit('open_dm', { targetAccountId, channelId, fromAccountId: me });
    } catch (err) { console.error('[Socket] open_dm:', err); }
  });

  // ---- 選択肢の追加 ----
  socket.on('add_poll_option', async ({ messageId, optionText } = {}) => {
    try {
      if (typeof optionText !== 'string') return;
      const trimmed = optionText.trim().slice(0, 80);
      if (!trimmed) return;
      const first = await getAccessibleMessage(me, messageId);
      if (!first || first.isDeleted) return;
      await withMessageLock(first.id, async () => {
        const row = await db.get('SELECT * FROM messages WHERE id = ?', [first.id]);
        if (!row || !row.text || !row.text.includes('__POLL__')) return;
        const [textContent, json] = row.text.split('__POLL__');
        const pollData = safeJson(json, null);
        if (!pollData || !pollData.allowAddOptions || !Array.isArray(pollData.options)) return;
        if (Date.now() >= pollData.endTime || pollData.options.length >= 10 || pollData.options.includes(trimmed)) return;
        pollData.options.push(trimmed);
        const newText = `${textContent}__POLL__${JSON.stringify(pollData)}`;
        const now = Date.now();
        await db.run('UPDATE messages SET text = ?, updatedAt = ? WHERE id = ?', [newText, now, row.id]);
        await emitToChannel(row.channelId, 'message_edited', rowToMessage({ ...row, text: newText, updatedAt: now }));
      });
    } catch (err) { console.error('[DB] add_poll_option error:', err); }
  });

  // ---- フィードバック ----
  socket.on('submit_feedback', async ({ messageId, text } = {}) => {
    try {
      if (typeof text !== 'string') return;
      const trimmed = text.trim().slice(0, 500);
      if (!trimmed) return;
      const first = await getAccessibleMessage(me, messageId);
      if (!first || first.isDeleted) return;
      await withMessageLock(first.id, async () => {
        const row = await db.get('SELECT * FROM messages WHERE id = ?', [first.id]);
        if (!row || !row.text || !row.text.startsWith('__FEEDBACK__')) return;
        const fb = safeJson(row.text.slice(12), null);
        if (!fb || (fb.endTime && Date.now() >= fb.endTime)) return;
        if (!Array.isArray(fb.responses)) fb.responses = [];
        fb.responses.push({
          id: newMessageId(),
          user: me,
          text: trimmed,
          timestamp: Date.now(),
          upvotes: [],
          downvotes: [],
        });
        const newText = `__FEEDBACK__${JSON.stringify(fb)}`;
        const now = Date.now();
        await db.run('UPDATE messages SET text = ?, updatedAt = ? WHERE id = ?', [newText, now, row.id]);
        await emitToChannel(row.channelId, 'message_edited', rowToMessage({ ...row, text: newText, updatedAt: now }));
      });
    } catch (err) { console.error('[DB] submit_feedback error:', err); }
  });

  socket.on('feedback_react', async ({ messageId, responseId, reactionType } = {}) => {
    try {
      if (typeof responseId !== 'string' || !['up', 'down', 'none'].includes(reactionType)) return;
      const first = await getAccessibleMessage(me, messageId);
      if (!first || first.isDeleted) return;
      await withMessageLock(first.id, async () => {
        const row = await db.get('SELECT * FROM messages WHERE id = ?', [first.id]);
        if (!row || !row.text || !row.text.startsWith('__FEEDBACK__')) return;
        const fb = safeJson(row.text.slice(12), null);
        const res = fb && Array.isArray(fb.responses) ? fb.responses.find(r => r.id === responseId) : null;
        if (!res) return;
        res.upvotes = (res.upvotes || []).filter(u => u !== me);
        res.downvotes = (res.downvotes || []).filter(u => u !== me);
        if (reactionType === 'up') res.upvotes.push(me);
        if (reactionType === 'down') res.downvotes.push(me);
        const newText = `__FEEDBACK__${JSON.stringify(fb)}`;
        const now = Date.now();
        await db.run('UPDATE messages SET text = ?, updatedAt = ? WHERE id = ?', [newText, now, row.id]);
        await emitToChannel(row.channelId, 'message_edited', rowToMessage({ ...row, text: newText, updatedAt: now }));
      });
    } catch (err) { console.error('[DB] feedback_react error:', err); }
  });

  // ---- 投票 ----
  socket.on('vote_poll', async ({ messageId, optionIndex } = {}) => {
    try {
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 50) return;
      const first = await getAccessibleMessage(me, messageId);
      if (!first || first.isDeleted) return;
      await withMessageLock(first.id, async () => {
        const row = await db.get('SELECT * FROM messages WHERE id = ?', [first.id]); // ロックの中で読み直す
        if (!row || !row.text || !row.text.includes('__POLL__')) return;
        const pollData = safeJson(row.text.split('__POLL__')[1], null);
        if (!pollData || !Array.isArray(pollData.options) || optionIndex >= pollData.options.length) return;
        if (pollData.endTime && Date.now() >= pollData.endTime) return;

        const votes = safeJson(row.pollVotes, {});
        let mine = votes[me];
        if (typeof mine === 'number') mine = [mine];
        else if (!Array.isArray(mine)) mine = [];
        if (pollData.multipleChoice === true) {
          mine = mine.includes(optionIndex) ? mine.filter(v => v !== optionIndex) : [...mine, optionIndex];
        } else {
          mine = mine.includes(optionIndex) ? [] : [optionIndex];
        }
        if (mine.length === 0) delete votes[me]; else votes[me] = mine;

        await db.run('UPDATE messages SET pollVotes = ?, updatedAt = ? WHERE id = ?', [JSON.stringify(votes), Date.now(), row.id]);
        await emitToChannel(row.channelId, 'poll_voted', { messageId: row.id, channelId: row.channelId, pollVotes: votes });
      });
    } catch (err) { console.error('[DB] vote_poll:', err); }
  });

  // ---- 編集 ----
  socket.on('edit_message', async ({ messageId, text } = {}) => {
    try {
      if (typeof text !== 'string') return;
      if (text.includes('__POLL__') || text.includes('__FEEDBACK__') || RESERVED_MARKERS_TEST_RE.test(text)) return;
      if (text.length > MAX_MESSAGE_CHARS) { socket.emit('edit_error', { messageId, error: 'too_long' }); return; }
      let clean = stripReservedMarkers(text);
      if (!clean.trim()) return;
      const first = await getAccessibleMessage(me, messageId);
      if (!first || first.isDeleted || first.user !== me) return;
      await withMessageLock(first.id, async () => {
        const row = await db.get('SELECT * FROM messages WHERE id = ?', [first.id]);
        if (!row || row.user !== me || row.isDeleted) return;
        if (row.text && (row.text.includes('__POLL__') || row.text.includes('__FEEDBACK__'))) return;
        const history = safeJson(row.editHistory, []);
        history.push({ text: row.text, timestamp: Date.now() });
        const now = Date.now();
        await db.run('UPDATE messages SET text = ?, isEdited = 1, editHistory = ?, updatedAt = ? WHERE id = ?',
          [clean, JSON.stringify(history.slice(-20)), now, row.id]);
        await emitToChannel(row.channelId, 'message_edited',
          rowToMessage({ ...row, text: clean, isEdited: 1, editHistory: JSON.stringify(history.slice(-20)), updatedAt: now }));
      });
    } catch (err) { console.error('[DB] edit_message:', err); }
  });
  socket.on('send_message', async (raw, ack) => {
    // ack（コールバック）を渡してきたクライアントには必ず ok / エラーを返す。渡さない古いクライアントは従来どおり send_error だけ
    const reply = typeof ack === 'function' ? ack : null;
    let replied = false;
    let clientTempId = null;
    const respond = (res) => {
      if (replied) return;
      replied = true;
      if (reply) { try { reply(res); } catch { /* ignore */ } }
    };
    const fail = (error) => {
      if (replied) return;
      socket.emit('send_error', { clientTempId, error });
      respond({ ok: false, error, clientTempId });
    };
    try {
      if (!raw || typeof raw !== 'object') { respond({ ok: false, error: 'bad_request' }); return; }
      clientTempId = typeof raw.clientTempId === 'string' ? raw.clientTempId.slice(0, 64)
        : (typeof raw.id === 'string' ? raw.id.slice(0, 64) : null);
      if (!rateOk(socket, 'send_message', 10, 5000)) {
        fail('rate_limited');
        return;
      }
      const channelId = raw.channelId;
      if (!(await canPostChannel(me, channelId))) {
        fail('forbidden');
        return;
      }
      let text = typeof raw.text === 'string' ? raw.text : '';
      if (text.length > MAX_TEXT) { fail('too_long'); return; }
      if (RESERVED_MARKERS_TEST_RE.test(text)) {
        fail('reserved_marker');
        return;
      }
      text = stripReservedMarkers(text);

      if (text.includes('__POLL__')) {
        const norm = normalizePoll(text);
        if (!norm) { fail('invalid_poll'); return; }
        text = norm;
      }

      if (text.includes('__FEEDBACK__')) {
        const norm = normalizeFeedback(text);
        if (!norm) { fail('invalid_feedback'); return; }
        text = norm;
      }

      // 投票・フィードバック以外は本文の上限で弾く
      if (!text.startsWith('__POLL__') && !text.startsWith('__FEEDBACK__') && text.length > MAX_MESSAGE_CHARS) {
        fail('too_long');
        return;
      }

      // 返信先は DB から引く（同じチャンネルのものだけ）
      let replyTo = null;
      if (raw.replyTo && typeof raw.replyTo.id === 'string') {
        const r = await db.get('SELECT id, user, text, channelId, isDeleted FROM messages WHERE id = ?', [raw.replyTo.id]);
        if (r && r.channelId === channelId && !r.isDeleted) replyTo = { id: r.id, user: r.user, text: (r.text || '').slice(0, 300) };
      }

      const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);
      const nums = (v) => (Array.isArray(v) ? v.slice(0, 10).map(n => (Number.isFinite(n) && n > 0 && n < 20000 ? Math.round(n) : null)) : undefined);
      const data = {
        id: newMessageId(),
        user: me,
        timestamp: Date.now(),
        text,
        channelId,
        imageUrl: str(raw.imageUrl, 20 * 1024 * 1024),   // base64 が来るので大きめ（T2-5 で絞る）
        audioUrl: str(raw.audioUrl, 10 * 1024 * 1024),
        fileUrl: str(raw.fileUrl, 2048),
        fileName: str(raw.fileName, 255),
        fileSize: Number.isFinite(raw.fileSize) ? raw.fileSize : null,
        fileType: str(raw.fileType, 100),
        imageWidths: nums(raw.imageWidths),
        imageHeights: nums(raw.imageHeights),
        replyTo,
        reactions: [],
      };
      if (data.imageUrl) {
        const parts = data.imageUrl.split('|||').slice(0, 5);   // 最大 5 枚
        const out = [];
        for (let i = 0; i < parts.length; i++) {
          const u = parts[i];
          let saved = u.startsWith('data:') ? await saveDataUrl(u, 'media', 'image', me) : cleanMediaUrl(u);
          if (saved && u.startsWith('data:') && data.imageWidths?.[i] && data.imageHeights?.[i]) {
            saved += `?w=${data.imageWidths[i]}&h=${data.imageHeights[i]}`;
          }
          if (saved) out.push(saved);
        }
        data.imageUrl = out.length ? out.join('|||') : null;
      }
      if (data.audioUrl) {
        data.audioUrl = data.audioUrl.startsWith('data:')
          ? await saveDataUrl(data.audioUrl, 'audio', 'audio', me)
          : (data.audioUrl.startsWith('/uploads/') && !data.audioUrl.includes('..') ? data.audioUrl : null);
      }
      if (data.fileUrl && !(data.fileUrl.startsWith('/uploads/') && !data.fileUrl.includes('..'))) data.fileUrl = null;
      if (!data.text && !data.imageUrl && !data.audioUrl && !data.fileUrl) {
        fail('bad_media');
        return;
      }

      delete data.imageWidths;   // 保存・配信には不要
      delete data.imageHeights;
      await insertMessage(data);
      await emitToChannel(data.channelId, 'receive_message', { ...data, clientTempId });
      respond({ ok: true, message: { ...data, clientTempId } });
    } catch (err) {
      console.error('[DB] send_message:', err);
      // 保存・配信に失敗したらエラーを返す
      fail('server_error');
    }
  });

  socket.on('search_messages', async ({ channelId, query, user, mention, limit, dateFrom, dateTo, aroundMsgId, offset, sortOrder } = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    if (!rateOk(socket, 'search_messages', 10, 5000)) return reply({ success: false, error: 'rate_limited' });
    try {
      if (!(await canAccessChannel(me, channelId))) return reply({ success: false, error: 'forbidden' });
      if (query != null && typeof query !== 'string') return reply({ success: false, error: 'bad query' });
      if (!db) await initDB();
      let q = `
        SELECT m.* 
        FROM messages m
        LEFT JOIN accounts a ON m.user = a.accountId
        WHERE m.channelId = ? AND m.isDeleted = 0
      `;
      let params = [channelId];

      if (aroundMsgId) {
        const targetMsg = await db.get('SELECT timestamp FROM messages WHERE id = ? AND channelId = ?', [aroundMsgId, channelId]);
        if (targetMsg) {
          q += ' AND m.timestamp >= ? AND m.timestamp <= ?';
          params.push(targetMsg.timestamp - 1000 * 60 * 60 * 24 * 3);
          params.push(targetMsg.timestamp + 1000 * 60 * 60 * 24 * 3);
        }
      }

      let cleanQuery = query || '';

      const fromRegex = /from:([^\s　]+)/g;
      let fromMatch;
      while ((fromMatch = fromRegex.exec(cleanQuery)) !== null) {
        const fromVal = fromMatch[1];
        q += ' AND (m.user = ? OR a.displayName LIKE ? OR a.firstName LIKE ?)';
        params.push(fromVal, '%' + fromVal + '%', '%' + fromVal + '%');
      }
      cleanQuery = cleanQuery.replace(/from:[^\s　]+/g, '');

      const hasRegex = /has:([^\s　]+)/g;
      let hasMatch;
      while ((hasMatch = hasRegex.exec(cleanQuery)) !== null) {
        const hasVal = hasMatch[1].toLowerCase();
        if (hasVal === 'image' || hasVal === 'images') q += ' AND m.imageUrl IS NOT NULL';
        else if (hasVal === 'audio') q += ' AND m.audioUrl IS NOT NULL';
        else if (hasVal === 'file' || hasVal === 'files') q += ' AND m.fileUrl IS NOT NULL';
        else if (hasVal === 'link' || hasVal === 'links') q += " AND m.text LIKE '%http%'";
        else if (hasVal === 'video' || hasVal === 'videos') q += " AND (m.text LIKE '%youtube.com%' OR m.text LIKE '%youtu.be%' OR m.text LIKE '%nicovideo.jp%' OR m.fileType LIKE 'video/%')";
      }
      cleanQuery = cleanQuery.replace(/has:[^\s　]+/g, '');

      // メンションは本文に <accountId> の形で保存されている。表示名が来たら accountId に変換して探す
      const mentionVals = [];
      const mentionRegex = /mentions?:([^\s　]+)/g;
      let mentionMatch;
      while ((mentionMatch = mentionRegex.exec(cleanQuery)) !== null) mentionVals.push(mentionMatch[1]);
      if (typeof mention === 'string' && mention.trim()) mentionVals.push(mention.trim());
      for (const raw of mentionVals.slice(0, 5)) {
        const val = raw.replace(/^[@＠]/, '').replace(/^<|>$/g, '').slice(0, 64);
        let ids;
        if (/^(user_[A-Za-z0-9_]+|hamachill|everyone)$/.test(val)) {
          ids = [val];
        } else {
          const accs = await db.all(
            'SELECT accountId FROM accounts WHERE displayName = ? OR firstName = ? OR displayName LIKE ? OR firstName LIKE ? LIMIT 20',
            [val, val, '%' + val + '%', '%' + val + '%']
          );
          ids = accs.map(a => a.accountId);
        }
        if (ids.length === 0) { q += ' AND 0'; continue; }
        q += ' AND (' + ids.map(() => 'instr(m.text, ?) > 0').join(' OR ') + ')';
        params.push(...ids.map(id => `<${id}>`));
      }
      cleanQuery = cleanQuery.replace(/mentions?:[^\s　]+/g, '');

      // 日付は JST（UTC+9）の 0 時で区切る。サーバーのタイムゾーンには依存しない
      const jstDayStart = (str) => {
        const m = String(str).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (!m) return null;
        return Date.UTC(+m[1], +m[2] - 1, +m[3]) - 9 * 60 * 60 * 1000;
      };

      const beforeRegex = /before:(\d{4}[-/]\d{1,2}[-/]\d{1,2})/g;
      let beforeMatch;
      while ((beforeMatch = beforeRegex.exec(cleanQuery)) !== null) {
        // その日を含める（翌日 0 時 JST より前）
        const start = jstDayStart(beforeMatch[1]);
        if (start === null) continue;
        q += ' AND m.timestamp < ?';
        params.push(start + 24 * 60 * 60 * 1000);
      }
      cleanQuery = cleanQuery.replace(/before:[^\s　]+/g, '');

      const afterRegex = /after:(\d{4}[-/]\d{1,2}[-/]\d{1,2})/g;
      let afterMatch;
      while ((afterMatch = afterRegex.exec(cleanQuery)) !== null) {
        const start = jstDayStart(afterMatch[1]);
        if (start === null) continue;
        q += ' AND m.timestamp >= ?';
        params.push(start);
      }
      cleanQuery = cleanQuery.replace(/after:[^\s　]+/g, '');

      const pinnedRegex = /pinned:(true|false|1|0)/g;
      let pinnedMatch;
      while ((pinnedMatch = pinnedRegex.exec(cleanQuery)) !== null) {
        const isPinned = (pinnedMatch[1] === 'true' || pinnedMatch[1] === '1') ? 1 : 0;
        q += ' AND m.isPinned = ?';
        params.push(isPinned);
      }
      cleanQuery = cleanQuery.replace(/pinned:[^\s　]+/g, '');

      cleanQuery = cleanQuery.trim();

      if (cleanQuery) { q += ' AND m.text LIKE ?'; params.push('%' + cleanQuery + '%'); }
      if (user) {
        q += ' AND (m.user = ? OR a.displayName LIKE ? OR a.firstName LIKE ?)';
        params.push(user, '%' + user + '%', '%' + user + '%');
      }
      // dateFrom / dateTo はクライアントが JST 基準で計算した epoch ms。dateTo は「この時刻より前」（翌日 0 時 JST を渡す）
      if (Number.isFinite(dateFrom) && dateFrom > 0) { q += ' AND m.timestamp >= ?'; params.push(dateFrom); }
      if (Number.isFinite(dateTo) && dateTo > 0) { q += ' AND m.timestamp < ?'; params.push(dateTo); }

      let orderClause = 'DESC';
      if (sortOrder === 'asc') orderClause = 'ASC';
      else if (sortOrder === 'desc') orderClause = 'DESC';

      const countQ = q.replace('SELECT m.*', 'SELECT COUNT(*) as count');
      const countRow = await db.get(countQ, params);
      const totalCount = countRow ? countRow.count : 0;

      q += ` ORDER BY m.timestamp ${orderClause} LIMIT ? OFFSET ?`;
      params.push(Math.min(Math.max(parseInt(limit) || 50, 1), 500));
      params.push(Math.max(parseInt(offset) || 0, 0));

      const results = await db.all(q, params);
      
      const finalResults = sortOrder ? results : results.reverse();
      
      reply({ success: true, messages: finalResults.map(rowToMessage), totalCount });
    } catch (err) {
      console.error('[DB] search_messages error:', err);
      reply({ success: false, error: 'server error' });
    }
  });

  // ---- リアクション（add_reaction を置き換え）----
  socket.on('add_reaction', async ({ messageId, emoji, op } = {}) => {
    try {
      if (!rateOk(socket, 'add_reaction', 15, 3000)) return;
      if (typeof emoji !== 'string' || emoji.length === 0 || emoji.length > 64) return;
      if (op !== 'add' && op !== 'remove') return;
      const first = await getAccessibleMessage(me, messageId);
      if (!first || first.isDeleted) return;
      await withMessageLock(first.id, async () => {
        const row = await db.get('SELECT * FROM messages WHERE id = ?', [first.id]);
        if (!row) return;
        let reactions = safeJson(row.reactions, []);
        if (!Array.isArray(reactions)) reactions = [];
        let r = reactions.find(x => x && x.emoji === emoji);
        const has = !!r && Array.isArray(r.users) && r.users.includes(me);
        if (op === 'add' && !has) {
          if (!r) { if (reactions.length >= 15) return; r = { emoji, count: 0, users: [] }; reactions.push(r); }
          r.users = [...(r.users || []), me];
        } else if (op === 'remove' && has) {
          r.users = r.users.filter(u => u !== me);
        } else {
          return; // 変化なし
        }
        reactions = reactions
          .map(x => ({ emoji: x.emoji, users: Array.isArray(x.users) ? x.users : [], count: Array.isArray(x.users) ? x.users.length : 0 }))
          .filter(x => x.count > 0);
        await db.run('UPDATE messages SET reactions = ?, updatedAt = ? WHERE id = ?', [JSON.stringify(reactions), Date.now(), row.id]);
        await emitToChannel(row.channelId, 'reaction_updated', { messageId: row.id, channelId: row.channelId, reactions });
      });
    } catch (err) { console.error('[DB] add_reaction:', err); }
  });

  socket.on('delete_message', async ({ messageId } = {}) => {
    try {
      const row = await getAccessibleMessage(me, messageId);
      if (!row || row.isDeleted) return;
      if (row.user !== me && !isAdmin(me)) return; // 本人か管理者だけ

      await db.run(
        "UPDATE messages SET text = '', isDeleted = 1, editHistory = '[]', imageUrl = NULL, audioUrl = NULL, fileUrl = NULL, fileName = NULL, fileSize = NULL, fileType = NULL, reactions = '[]', isPinned = 0, updatedAt = ? WHERE id = ?",
        [Date.now(), row.id]
      );
      await emitToChannel(row.channelId, 'message_deleted', { messageId: row.id, channelId: row.channelId });
      // ピン留めされていたらピン一覧からも外す
      if (row.isPinned) {
        await emitToChannel(row.channelId, 'message_pinned', { messageId: row.id, channelId: row.channelId, isPinned: false, message: null });
      }

      // 削除ログ（logs は管理者だけに届く）。DM は本文を残さない
      const dm = isDmChannel(row.channelId);
      await sendSystemMessage({
        channelId: 'logs',
        text: systemText('delete_log', { by: me, author: row.user, channel: row.channelId, dm, body: dm ? '' : (row.text || '').slice(0, 1000) }),
      });
    } catch (err) { console.error('[DB] delete_message:', err); }
  });

  // ---- ピン（toggle_pin を置き換え）----
  socket.on('toggle_pin', async ({ messageId, isPinned } = {}) => {
    try {
      const row = await getAccessibleMessage(me, messageId);
      if (!row || row.isDeleted) return;
      if (row.user !== me && !isAdmin(me)) return;   // 投稿者か管理者だけ
      const next = isPinned ? 1 : 0;
      if ((row.isPinned ? 1 : 0) === next) return;
      const now = Date.now();
      await db.run('UPDATE messages SET isPinned = ?, updatedAt = ? WHERE id = ?', [next, now, row.id]);
      await emitToChannel(row.channelId, 'message_pinned', {
        messageId: row.id, channelId: row.channelId, isPinned: next === 1,
        message: next === 1 ? rowToMessage({ ...row, isPinned: 1, updatedAt: now }) : null,
      });
      if (next === 1) {
        await sendSystemMessage({
          channelId: row.channelId,
          text: systemText('pin', { user: me }),
          replyTo: { id: row.id, user: row.user, text: (row.text || '').slice(0, 300) },
        });
      }
    } catch (err) { console.error('[DB] toggle_pin:', err); }
  });

  socket.on('get_pinned_messages', async ({ channelId } = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    try {
      if (!(await canAccessChannel(me, channelId))) return reply({ success: false, error: 'forbidden' });
      const rows = await db.all(
        'SELECT * FROM messages WHERE channelId = ? AND isPinned = 1 AND isDeleted = 0 ORDER BY timestamp DESC LIMIT 200',
        [channelId]
      );
      reply({ success: true, messages: rows.map(r => ({ ...rowToMessage(r), isPinned: true })) });
    } catch (err) { console.error('[DB] get_pinned_messages:', err); reply({ success: false, error: 'server error' }); }
  });

function cleanVoiceState(raw, socket, roomId) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  return {
    accountId: socket.data.accountId,
    name: socket.data.displayName,
    id: '@' + socket.data.accountId,
    displayName: socket.data.displayName,
    avatarUrl: str(s.avatarUrl, 2048),
    bannerUrl: str(s.bannerUrl, 2048),
    pronouns: str(s.pronouns, 40),
    bio: str(s.bio, 500),
    profileColor1: str(s.profileColor1, 32),
    profileColor2: str(s.profileColor2, 32),
    profileColor3: str(s.profileColor3, 32),
    profileBannerColor: str(s.profileBannerColor, 32),
    nameStyle: str(s.nameStyle, 32),
    isMuted: !!s.isMuted,
    isDeafened: !!s.isDeafened,
    hasMicrophone: s.hasMicrophone !== false,
    isScreenSharing: !!s.isScreenSharing,
    connectedRoom: roomId,
  };
}

  // ---- Voice ----
  socket.on('join_voice', ({ roomId, peerId, userState } = {}) => {
    if (!VC_ROOMS.has(roomId) || typeof peerId !== 'string' || !PEER_ID_RE.test(peerId)) return;

    // 切断猶予中の再接続なら、同じ部屋・同じ peerId の場合は無切断で引き継ぐ
    const pendingKey = socket.data.accountId || socket.id;
    const pending = clearPendingVoiceDisconnect(pendingKey);
    if (pending && voiceUsers[pending.socketId]) {
      const prevUser = voiceUsers[pending.socketId];
      if (prevUser.roomId === roomId && prevUser.peerId === peerId) {
        delete voiceUsers[pending.socketId];
        const cleaned = cleanVoiceState(userState, socket, roomId);
        voiceUsers[socket.id] = { socketId: socket.id, peerId, userState: cleaned, roomId, isSpeaking: false };
        socket.join(roomId);
        const roomMembers = Object.values(voiceUsers).filter(u => u.roomId === roomId && u.socketId !== socket.id);
        socket.emit('voice_room_members', roomMembers);
        broadcastVoiceState();
        return;
      }
      cleanupVoiceUser(pending.socketId);
    }

    const dup = Object.values(voiceUsers).find(u => u.peerId === peerId && u.socketId !== socket.id);
    if (dup) {
      if (dup.userState?.accountId !== socket.data.accountId) {
        socket.emit('voice_error', { error: 'peer_in_use' });
        return;
      }
      io.sockets.sockets.get(dup.socketId)?.leave(dup.roomId);
      if (dup.roomId === roomId) {
        // 同じアカウント・同じ部屋・同じ peerId のソケット張り替えなら WebRTC を維持したまま引き継ぐ
        delete voiceUsers[dup.socketId];
        const cleaned = cleanVoiceState(userState, socket, roomId);
        voiceUsers[socket.id] = { socketId: socket.id, peerId, userState: cleaned, roomId, isSpeaking: false };
        socket.join(roomId);
        const roomMembers = Object.values(voiceUsers).filter(u => u.roomId === roomId && u.socketId !== socket.id);
        socket.emit('voice_room_members', roomMembers);
        broadcastVoiceState();
        return;
      }
      cleanupVoiceUser(dup.socketId); // user_left_voice + voice_state_update が出る
    }
    if (voiceUsers[socket.id]) {
      const existing = voiceUsers[socket.id];
      if (existing.roomId === roomId && existing.peerId === peerId) {
        // 既に同じ部屋・同じ peerId で参加中なら切断せず状態のみ更新
        const cleaned = cleanVoiceState(userState, socket, roomId);
        existing.userState = cleaned;
        const roomMembers = Object.values(voiceUsers).filter(u => u.roomId === roomId && u.socketId !== socket.id);
        socket.emit('voice_room_members', roomMembers);
        io.emit('voice_user_updated', { socketId: socket.id, roomId, userState: cleaned });
        return;
      }
      const oldRid = existing.roomId;
      socket.leave(oldRid);
      io.to(oldRid).emit('user_left_voice', { socketId: socket.id, peerId: existing.peerId });
    }
    const cleaned = cleanVoiceState(userState, socket, roomId);
    voiceUsers[socket.id] = { socketId: socket.id, peerId, userState: cleaned, roomId };
    socket.join(roomId);
    const roomMembers = Object.values(voiceUsers).filter(u => u.roomId === roomId && u.socketId !== socket.id);
    socket.emit('voice_room_members', roomMembers);
    socket.to(roomId).emit('user_joined_voice', { socketId: socket.id, peerId, roomId, userState: cleaned });
    broadcastVoiceState();
  });

  socket.on('update_voice_state', ({ userState } = {}) => {
    const v = voiceUsers[socket.id];
    if (!v || !rateOk(socket, 'update_voice_state', 10, 1000)) return;
    const next = cleanVoiceState(userState, socket, v.roomId);
    const same = Object.keys(next).every(k => next[k] === v.userState[k]);
    if (same) return;
    v.userState = next;
    io.emit('voice_user_updated', { socketId: socket.id, roomId: v.roomId, userState: next });
  });

  socket.on('speaking_state', ({ isSpeaking } = {}) => {
    const v = voiceUsers[socket.id];
    if (!v || !rateOk(socket, 'speaking_state', 30, 1000)) return;
    const next = !!isSpeaking;
    if (v.isSpeaking === next) return;
    v.isSpeaking = next;
    io.emit('voice_speaking', { socketId: socket.id, isSpeaking: next });
  });

  socket.on('stop_screen_share', () => {
    const v = voiceUsers[socket.id];
    if (!v) return;
    socket.to(v.roomId).emit('peer_stopped_screen_share', { socketId: socket.id, peerId: v.peerId });
  });

  socket.on('leave_voice', () => {
    clearPendingVoiceDisconnect(socket.data.accountId || socket.id);
    if (voiceUsers[socket.id]) {
      const rid = voiceUsers[socket.id].roomId;
      socket.leave(rid);
      cleanupVoiceUser(socket.id);
    }
  });

  socket.on('set_presence', ({ status }) => {
    const accountId = socketAccounts[socket.id];
    if (!accountId) return;
    if (status === 'invisible') {
      invisibleAccounts.add(accountId);
    } else {
      invisibleAccounts.delete(accountId);
    }
    broadcastOnline();
  });

  socket.on('disconnect', (reason) => {
    log.debug(`[Socket] -${socket.id} (${reason})`);
    delete socketAccounts[socket.id];
    broadcastOnline();
    const v = voiceUsers[socket.id];
    if (v) {
      if (v.isSpeaking) {
        v.isSpeaking = false;
        io.emit('voice_speaking', { socketId: socket.id, isSpeaking: false });
      }
      const key = socket.data.accountId || socket.id;
      clearPendingVoiceDisconnect(key);
      const disconnectedSocketId = socket.id;
      const timer = setTimeout(() => {
        pendingVoiceDisconnects.delete(key);
        if (voiceUsers[disconnectedSocketId]) {
          cleanupVoiceUser(disconnectedSocketId);
        }
      }, VOICE_DISCONNECT_GRACE_MS);
      pendingVoiceDisconnects.set(key, { timer, socketId: disconnectedSocketId, roomId: v.roomId, peerId: v.peerId });
    }
  });

  socket.on('error', err => console.error(`[Socket] error ${socket.id}:`, err));

  socket.on('rename_vc', ({ id, name } = {}) => {
    if (!VC_ROOMS.has(id) || typeof name !== 'string') return;
    const clean = name.trim().slice(0, 32);
    if (!clean || !rateOk(socket, 'rename_vc', 3, 10000)) return;
    vcNames[id] = clean;
    io.emit('vc_names', vcNames);
  });

  socket.on('play_soundboard', async ({ roomId, filename } = {}) => {
    const v = voiceUsers[socket.id];
    if (!v || v.roomId !== roomId) return;                       // その部屋の VC にいる人だけ
    if (typeof filename !== 'string' || filename.includes('..') || !SOUND_FILE_RE.test(filename)) return;
    if (!rateOk(socket, 'play_soundboard', 3, 2000)) return;
    try { await fs.promises.access(path.join(soundboardDir, filename)); } catch { return; }
    io.to(roomId).emit('play_soundboard', { filename, sender: socket.id });
  });

});
// ---- カスタム絵文字 (1人15個まで) ----
const CUSTOM_EMOJI_NAME_RE = /^[a-zA-Z0-9_]{2,24}$/;
const CUSTOM_EMOJI_LIMIT_PER_USER = 15;

app.get(['/custom-emojis', '/api/custom-emojis'], async (req, res) => {
  try {
    if (!db) await initDB();
    const rows = await db.all('SELECT id, name, url, ownerAccountId, createdAt FROM custom_emojis ORDER BY createdAt DESC');
    res.json({ emojis: rows || [] });
  } catch (err) {
    console.error('[CustomEmoji GET Error]', err);
    res.status(500).json({ error: 'Failed to load custom emojis' });
  }
});

app.post(['/custom-emojis', '/api/custom-emojis'], requireAuth, upload.single('emoji'), async (req, res) => {
  const accountId = req.user.accountId;
  const rawName = String(req.body?.name || '').trim().replace(/^:+|:+$/g, '');
  const cleanupTmp = () => {
    if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
  };

  if (!req.file) {
    return res.status(400).json({ error: 'Please choose an image file.', code: 'image_required' });
  }
  if (!CUSTOM_EMOJI_NAME_RE.test(rawName)) {
    cleanupTmp();
    return res.status(400).json({ error: 'Emoji names must be 2-24 letters, numbers or underscores.', code: 'invalid_emoji_name' });
  }

  try {
    if (!db) await initDB();
    if (!isAdmin(accountId)) {
      const countRow = await db.get('SELECT COUNT(*) AS cnt FROM custom_emojis WHERE ownerAccountId = ?', [accountId]);
      if ((countRow?.cnt || 0) >= CUSTOM_EMOJI_LIMIT_PER_USER) {
        cleanupTmp();
        return res.status(400).json({ error: `Up to ${CUSTOM_EMOJI_LIMIT_PER_USER} custom emoji per person.`, code: 'emoji_limit', params: { max: CUSTOM_EMOJI_LIMIT_PER_USER } });
      }
    }

    const existing = await db.get('SELECT id FROM custom_emojis WHERE LOWER(name) = LOWER(?)', [rawName]);
    if (existing) {
      cleanupTmp();
      return res.status(409).json({ error: 'A custom emoji with this name already exists.', code: 'emoji_name_taken' });
    }

    const ext = path.extname(req.file.originalname || '').toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
      cleanupTmp();
      return res.status(400).json({ error: 'Only PNG / JPG / WebP / GIF are supported.', code: 'unsupported_image_type' });
    }

    const id = crypto.randomBytes(8).toString('hex');
    const isGif = ext === '.gif';
    const outName = `cemoji_${id}${isGif ? '.gif' : '.webp'}`;
    const destPath = path.join(generalUploadDir, outName);

    if (isGif) {
      await fs.promises.copyFile(req.file.path, destPath);
    } else if (sharp) {
      await sharp(req.file.path, { limitInputPixels: 25e6 })
        .rotate()
        .resize(128, 128, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 90 })
        .toFile(destPath);
    } else {
      await fs.promises.copyFile(req.file.path, destPath);
    }
    cleanupTmp();

    const item = {
      id,
      name: rawName,
      url: `/uploads/${outName}`,
      ownerAccountId: accountId,
      createdAt: Date.now(),
    };
    await db.run(
      'INSERT INTO custom_emojis (id, name, url, ownerAccountId, createdAt) VALUES (?, ?, ?, ?, ?)',
      [item.id, item.name, item.url, item.ownerAccountId, item.createdAt]
    );

    io.emit('custom_emojis_updated');
    res.json({ success: true, emoji: item });
  } catch (err) {
    cleanupTmp();
    console.error('[CustomEmoji Upload Error]', err);
    res.status(500).json({ error: 'Failed to add the custom emoji.', code: 'emoji_add_failed' });
  }
});

app.delete(['/custom-emojis/:id', '/api/custom-emojis/:id'], requireAuth, async (req, res) => {
  const id = String(req.params.id || '');
  if (!id) return res.status(400).json({ error: 'Invalid ID' });
  try {
    if (!db) await initDB();
    const row = await db.get('SELECT * FROM custom_emojis WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Not found.', code: 'not_found' });
    if (row.ownerAccountId !== req.user.accountId && !isAdmin(req.user.accountId)) {
      return res.status(403).json({ error: 'You are not allowed to delete this.', code: 'no_delete_permission' });
    }
    await db.run('DELETE FROM custom_emojis WHERE id = ?', [id]);
    if (row.url?.startsWith('/uploads/')) {
      const filePath = path.join(generalUploadDir, path.basename(row.url));
      fs.promises.unlink(filePath).catch(() => {});
    }
    io.emit('custom_emojis_updated');
    res.json({ success: true });
  } catch (err) {
    console.error('[CustomEmoji Delete Error]', err);
    res.status(500).json({ error: 'Delete failed.', code: 'delete_failed' });
  }
});

// サウンドボードのファイルを配信
app.use('/soundboards', express.static(soundboardDir, {
  maxAge: '1h',
  setHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));
const INLINE_OK = /\.(png|jpe?g|gif|webp|mp4|webm|mov|ogg|mp3|wav|m4a|flac)$/i;
app.use('/uploads', express.static(generalUploadDir, {
  fallthrough: false,
  maxAge: '1y',
  immutable: true,
  setHeaders(res, filePath) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    if (!INLINE_OK.test(filePath)) res.setHeader('Content-Disposition', 'attachment');
  },
}));

app.get('/soundboards', async (req, res) => {
  const sbDir = soundboardDir;
  const result = [];
  
  try {
    if (fs.existsSync(sbDir)) {
      // 1. Root files (hamachill)
      const rootFiles = fs.readdirSync(sbDir, { withFileTypes: true })
        .filter(dirent => !dirent.isDirectory() && (dirent.name.toLowerCase().endsWith('.mp3') || dirent.name.toLowerCase().endsWith('.wav') || dirent.name.toLowerCase().endsWith('.ogg')))
        .map(dirent => dirent.name);
      
      if (rootFiles.length > 0) {
        result.push({ owner: 'hamachill', files: rootFiles });
      }
      
      // 2. User directories
      const dirs = fs.readdirSync(sbDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && dirent.name !== 'tmp');
        
      if (dirs.length > 0 && db) {
        // Fetch users to map accountId to names
        const users = await db.all('SELECT accountId, firstName, displayName FROM accounts');
        const userMap = {};
        users.forEach(u => { userMap[u.accountId] = u.displayName || u.firstName || u.accountId; });
        
        for (const dir of dirs) {
          const accountId = dir.name;
          const userDir = path.join(sbDir, accountId);
          const userFiles = fs.readdirSync(userDir)
            .filter(f => f.toLowerCase().endsWith('.mp3') || f.toLowerCase().endsWith('.wav') || f.toLowerCase().endsWith('.ogg'))
            .map(f => `${accountId}/${f}`);
            
          if (userFiles.length > 0) {
            result.push({ owner: userMap[accountId] || accountId, files: userFiles });
          }
        }
      }
    }
  } catch (err) {
    console.error('[Soundboard GET Error]', err);
  }
  
  res.json(result);
});

const SB_DIR = soundboardDir;
function resolveSound(file, accountId) {
  if (typeof file !== 'string' || file.length > 200 || file.includes('\0')) return null;
  const abs = path.resolve(SB_DIR, file);
  if (!abs.startsWith(SB_DIR + path.sep)) return null;            // ディレクトリの外は不可
  const parts = path.relative(SB_DIR, abs).split(path.sep);
  const owner = parts.length === 1 ? null : parts[0];
  if (parts.length > 2 || owner === 'tmp') return null;
  const allowed = owner === null ? isAdmin(accountId) : owner === accountId;
  return allowed ? { abs, dir: path.dirname(abs) } : null;
}

app.post('/soundboards/upload', requireAuth, upload.single('sound'), async (req, res) => {
  const accountId = req.user.accountId;
  const { name } = req.body;
  if (!req.file || !name || typeof name !== 'string') {
    if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ error: 'File and name required' });
  }
  
  try {
    const userDir = path.join(SB_DIR, accountId);
    if (!fs.existsSync(userDir)) await fs.promises.mkdir(userDir, { recursive: true });
    
    // Check limit
    const existingFiles = (await fs.promises.readdir(userDir)).filter(f => f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.ogg'));
    if (existingFiles.length >= 50) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'Up to 50 per person.', code: 'sound_limit', params: { max: 50 } });
    }
    
    // Validate extension
    const extMatch = req.file.originalname.match(/\.(mp3|wav|ogg)$/i);
    const ext = extMatch ? extMatch[0].toLowerCase() : '.mp3';
    
    const safeName = name.replace(/[^a-zA-Z0-9_\-\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF\u2605-\u2606\u2190-\u2195\u203B]/g, '').substring(0, 30) || 'sound';
    
    const destPath = path.join(userDir, `${safeName}${ext}`);
    try {
      await fs.promises.access(destPath);
      // Already exists!
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(409).json({ error: 'A file with this name already exists.', code: 'file_name_taken' });
    } catch {
      // Doesn't exist, proceed
    }
    await fs.promises.rename(req.file.path, destPath);
    
    io.emit('soundboard_updated');
    
    res.json({ success: true, filename: `${accountId}/${safeName}${ext}` });
  } catch (err) {
    console.error('[Soundboard Upload Error]', err);
    if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
    res.status(500).json({ error: 'Upload failed', code: 'upload_failed' });
  }
});

app.post('/soundboards/delete', requireAuth, async (req, res) => {
  const { file } = req.body;
  const t = resolveSound(file, req.user.accountId);
  if (!t) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  
  try {
    await fs.promises.unlink(t.abs);
    io.emit('soundboard_updated');
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'Not found', code: 'not_found' });
    console.error('[Soundboard Delete Error]', err);
    res.status(500).json({ error: 'Delete failed', code: 'delete_failed' });
  }
});

app.post('/soundboards/rename', requireAuth, async (req, res) => {
  const { file, newName } = req.body;
  if (!newName || typeof newName !== 'string') return res.status(400).json({ error: 'Invalid name', code: 'invalid_name' });
  const t = resolveSound(file, req.user.accountId);
  if (!t) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  
  try {
    const extMatch = file.match(/\.(mp3|wav|ogg)$/i);
    const ext = extMatch ? extMatch[0].toLowerCase() : '.mp3';
    const safeName = newName.replace(/[^a-zA-Z0-9_\-\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF\u2605-\u2606\u2190-\u2195\u203B]/g, '').substring(0, 30) || 'sound';
    
    const newPath = path.join(t.dir, `${safeName}${ext}`);
    if (newPath !== t.abs) {
      try {
        await fs.promises.access(newPath);
        return res.status(409).json({ error: 'A file with this name already exists.', code: 'file_name_taken' });
      } catch {
        // Doesn't exist, proceed
      }
    }
    
    await fs.promises.rename(t.abs, newPath);
    io.emit('soundboard_updated');
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'Not found', code: 'not_found' });
    console.error('[Soundboard Rename Error]', err);
    res.status(500).json({ error: 'Rename failed' });
  }
});


// フロントエンドのビルド済みファイルを配信（本番環境用）
// dist 静的配信の前に /uploads の変種リクエスト（//uploads, /%75ploads, /uploads%2f 等）を確実に遮断
app.use((req, res, next) => {
  let p;
  try { p = decodeURIComponent(req.path); } catch { return res.status(400).end(); }
  if (/^[\/\\]*uploads([\/\\]|$)/i.test(p)) return res.status(404).end();
  next();
});

app.use('/assets', express.static(path.join(__dirname, '../dist/assets'), { immutable: true, maxAge: '1y' }));
app.use(express.static(path.join(__dirname, '../dist'), {
  index: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// SPAフォールバック (存在しないパスは index.html を返す。ただし /assets 等の静的アセット欠損は 404 にする)
app.use((req, res, next) => {
  if (req.path.startsWith('/assets/') || /\.(js|mjs|css|wasm|map|png|jpe?g|gif|webp|svg|ico)$/i.test(req.path)) {
    return res.status(404).end();
  }
  if (req.method === 'GET' && !req.originalUrl.startsWith('/api') && !req.path.startsWith('/socket.io') && !req.path.startsWith('/peerjs')) {
    const indexPath = path.join(__dirname, '../dist/index.html');
    if (fs.existsSync(indexPath)) {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexPath, (err) => {
        if (err) {
          log.error('[Serve] Error sending index.html:', err);
          if (!res.headersSent) res.status(500).send('Error loading frontend');
        }
      });
    } else {
      res.status(404).send('Frontend not built yet. Please run "npm run build".');
    }
  } else {
    next();
  }
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`\n🚀 hamachill is running: http://localhost:${PORT}`);
  console.log(`   - Frontend: http://localhost:${PORT}`);
  console.log(`   - API:      http://localhost:${PORT}/api`);
  console.log(`   - PeerJS:   http://localhost:${PORT}/peerjs\n`);
});

 
process.on('unhandledRejection', (err) => console.error('[FATAL] unhandledRejection:', err));
 
process.on('uncaughtException', (err) => console.error('[FATAL] uncaughtException:', err));
