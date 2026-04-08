# Slack Bulk Inviter — 実装計画

## 概要
Slack API/Bot権限なしで、ブラウザセッション(xoxc+xoxd)を使い大量ユーザーをチャンネルに一括招待するデスクトップアプリ。Electron + TypeScript。CLI/GUI両対応。

## 技術スタック
- **ランタイム**: Electron 34+ (Chromium同梱でブラウザ自動化が容易)
- **フロントエンド**: React 19 + Vite + shadcn/ui + Tailwind CSS v4 + TanStack Table v8
- **状態管理**: Zustand
- **DB**: better-sqlite3 + SQLCipher (暗号化キーはOS Keychain)
- **CLI**: commander.js
- **ビルド**: electron-builder (.dmg / .exe)

## プロジェクト構造
```
slack-bulk-inviter/
├── config/categories.yml       # 学籍番号パターン定義
├── src/
│   ├── core/                   # CLI/GUI共通ロジック
│   │   ├── slack-client.ts     # Slack API (xoxc+xoxd認証)
│   │   ├── auth.ts             # トークン取得・保存
│   │   ├── database.ts         # SQLCipher操作
│   │   ├── category.ts         # 分類エンジン(YAML駆動)
│   │   ├── invite.ts           # バッチ招待(最大1000人/req, Tier3)
│   │   └── sync.ts             # ユーザー・チャンネル同期
│   ├── cli/index.ts            # CLIエントリ (commander.js)
│   ├── main/                   # Electron メインプロセス
│   │   ├── index.ts
│   │   ├── ipc-handlers.ts
│   │   └── auth-window.ts      # Google SAML SSO用
│   └── renderer/               # React UI
│       ├── components/         # LoginScreen, UserTable, CategoryFilter,
│       │                       # ChannelPicker, InvitePanel, InviteConfirm
│       ├── hooks/
│       └── stores/
```

## 認証フロー
- **GUI**: BrowserWindow → workspace.slack.com → Google SAML → executeJavaScript()でlocalStorage.localConfig_v2からxoxc取得 + Cookie d= → Keychain保存
- **CLI**: システムブラウザ起動 → localhostコールバック or bookmarkletでトークン送信

## 実装フェーズ

### Phase 1: プロジェクト基盤 ✅
- [x] Electron + Vite + React + TS 初期化 + shadcn/ui
- [x] categories.yml 作成・パーサー実装

### Phase 2: コアロジック ✅
- [x] SlackClient (xoxc+xoxd認証、カーソルページネーション)
- [x] Database (AES-256-GCM暗号化JSON + safeStorage)
- [x] CategoryEngine (YAML設定ファイル駆動)
- [x] SyncService / InviteService (バッチ+リトライ+レート制限)

### Phase 3: CLI ✅
- [x] auth login(ブラウザ+localhost受信+stdin貼り付け) / status / logout
- [x] sync users / channels / all (進捗表示付き)
- [x] users list / channels list (--category, --member, --format table|json)
- [x] invite --channel --category/--users (--dry-run対応)

### Phase 4: GUI認証 ✅
- [x] Electron IPC設定 + 認証BrowserWindow (Google SAML SSO対応)
- [x] ログイン画面UI

### Phase 5: GUIメイン画面 ✅
- [x] 3カラムレイアウト (サイドバー + テーブル + 招待パネル)
- [x] UserTable (チェックボックス + カテゴリ一括ON/OFF + 検索)
- [x] ChannelPicker + InviteConfirm + ダークモード(OS追従)
- [x] shadcn/ui コンポーネント一式
- [x] SyncStatus (同期状態表示 + 進捗バー)

### Phase 6: 仕上げ ✅
- [x] エラーハンドリング (uncaughtException/unhandledRejection + ErrorToast通知UI)
- [x] Mac/Windowsビルド設定・アイコン (.icns/.png生成済み)
- [x] electron-builder: extraResources でcategories.yml同梱
- [x] macOS信号機ボタン位置調整 (trafficLightPosition)
