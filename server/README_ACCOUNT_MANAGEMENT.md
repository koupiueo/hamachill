# hamachill management console (`manage.js`)

[English](#english) · [日本語](#日本語)

## English

`server/manage.js` is one tool for starting the server, managing accounts and checking the database. Accounts can only be created here; there is no public sign-up.

It uses the same database as the server (`DATA_DIR/db.db`, default `server/db.db`) and reads the project's `.env`.

The language follows your terminal's locale (`LANG`, `LC_ALL`, ...): Japanese for `ja*`, English otherwise. Force it with `HAMACHILL_LANG=en` or `HAMACHILL_LANG=ja`.

### Interactive mode

```bash
npm run admin          # from the project root
# or
cd server && node manage.js
```

A numbered menu opens:

| # | Action |
| --- | --- |
| 1 | Start the server |
| 2 | List accounts (with message / DM counts) |
| 3 | Add an account |
| 4 | Change a password (signs the account out everywhere) |
| 5 | Create an account with a random temporary password |
| 6 | Remove an account and all its messages, DMs and read state |
| 7 | Inspect the database (row counts, orphaned messages) |
| 8 | Reset all data (asks twice: `yes`, then `YES`) |
| 0 | Exit |

### Commands

| Command | What it does |
| --- | --- |
| `node manage.js server` | Start the server |
| `node manage.js list` | List accounts |
| `node manage.js add <id> <password> <displayName> [firstName]` | Add an account |
| `node manage.js passwd <id> <newPassword>` | Change a password |
| `node manage.js make <id> <firstName> [displayName]` | Create an account with a temporary password (printed once) |
| `node manage.js remove <id>` | Remove an account and its data |
| `node manage.js stats` | Inspect the database |
| `node manage.js reset` | Delete all data |
| `node manage.js help` | Show help |

Aliases: `ls`, `password`, `new`, `rm` / `del`, `inspect` / `check`.

With Docker, run the same commands inside the container:

```bash
docker compose exec hamachill node manage.js add alice s3cret "Alice"
```

Rules:

- Account IDs are 1-64 characters of letters, digits, `-` and `_` (`__dm__` is not allowed).
- Passwords need at least 4 characters. They are stored as bcrypt hashes (12 rounds).
- When `ADMIN_IDS` in `.env` is empty, the first account created is the admin.
- `list` and `stats` work before the server has ever run; chat tables are created on the server's first start.

### Database (`db.db`)

`accounts`: `accountId` (primary key), `firstName`, `passwordHash`, `displayName`, `pronouns`, `bio`, `profileColor1-3`, `profileBannerColor`, `nameStyle` (`solid`, `gradient`, `pop`, `neon`), `avatarUrl`, `bannerUrl`, `createdAt`, `tokenVersion` (bumped on password change to sign out old sessions). `shards` / `lastShardClaim` are legacy columns and unused.

Related tables: `messages`, `dm_channels` (`member1`, `member2`), `read_state`.

---

## 日本語

`server/manage.js` は、サーバー起動・アカウント管理・データベース点検をまとめたツールです。アカウントはここでだけ作れます（公開の新規登録はありません）。

サーバーと同じ DB（`DATA_DIR/db.db`、既定は `server/db.db`）を使い、プロジェクトの `.env` を読みます。

表示言語は端末のロケール（`LANG`、`LC_ALL` など）で決まり、`ja*` なら日本語、それ以外は英語です。`HAMACHILL_LANG=ja` / `HAMACHILL_LANG=en` で固定できます。

### 対話モード

```bash
npm run admin          # プロジェクトのルートから
# または
cd server && node manage.js
```

番号で選ぶメニューが出ます。

| 番号 | 内容 |
| --- | --- |
| 1 | サーバーを起動 |
| 2 | アカウント一覧（メッセージ数・DM 数つき） |
| 3 | アカウントを追加 |
| 4 | パスワードを変更（そのアカウントは全端末でログアウト） |
| 5 | ランダムな一時パスワードでアカウントを作成 |
| 6 | アカウントと、そのメッセージ・DM・既読状態をすべて削除 |
| 7 | データベースを点検（件数、削除済みユーザーのメッセージ） |
| 8 | 全データを削除（`yes` → `YES` の 2 回確認） |
| 0 | 終了 |

### コマンド

| コマンド | 内容 |
| --- | --- |
| `node manage.js server` | サーバーを起動 |
| `node manage.js list` | アカウント一覧 |
| `node manage.js add <ID> <パスワード> <表示名> [名前]` | アカウントを追加 |
| `node manage.js passwd <ID> <新しいパスワード>` | パスワードを変更 |
| `node manage.js make <ID> <名前> [表示名]` | 一時パスワード付きで作成（パスワードは 1 回だけ表示） |
| `node manage.js remove <ID>` | アカウントと関連データを削除 |
| `node manage.js stats` | データベースを点検 |
| `node manage.js reset` | 全データを削除 |
| `node manage.js help` | ヘルプを表示 |

別名: `ls`、`password`、`new`、`rm` / `del`、`inspect` / `check`。

Docker ではコンテナの中で同じコマンドを実行します。

```bash
docker compose exec hamachill node manage.js add alice s3cret "Alice"
```

ルール:

- アカウント ID は半角英数字・`-`・`_` の 1〜64 文字（`__dm__` は使えません）。
- パスワードは 4 文字以上。bcrypt（12 ラウンド）でハッシュ化して保存します。
- `.env` の `ADMIN_IDS` が空なら、最初に作ったアカウントが管理者になります。
- `list` と `stats` はサーバーを一度も起動していなくても動きます（チャット用のテーブルはサーバーの初回起動時に作られます）。

### データベース（`db.db`）

`accounts`: `accountId`（主キー）、`firstName`、`passwordHash`、`displayName`、`pronouns`、`bio`、`profileColor1〜3`、`profileBannerColor`、`nameStyle`（`solid`、`gradient`、`pop`、`neon`）、`avatarUrl`、`bannerUrl`、`createdAt`、`tokenVersion`（パスワード変更で増え、古いログインを無効化）。`shards` / `lastShardClaim` は旧機能の名残で、今は使っていません。

関連テーブル: `messages`、`dm_channels`（`member1`、`member2`）、`read_state`。
