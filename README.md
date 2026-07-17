# Game Routine Worker

Cloudflare WorkersでHoYoLABの日課受取状況を確認し、未受取や確認エラーをDiscordへ通知するWorkerです。

## 対応ゲーム

- 原神
- 崩壊：スターレイル
- ゼンレスゾーンゼロ
- アークナイツ：エンドフィールド（現在はログインボーナスページの案内のみ）

## 主な機能

- 毎日23:00 JSTに受取状況を確認
- 23:10 JSTにバックアップ確認
- 3ゲームのHoYoLAB APIを並列取得
- Workers KVによる通知の重複防止
- 未受取通知とAPIエラー通知をDiscordへ送信
- Discordのリンクプレビューを抑制
- Cloudflare Workers Logs向けの詳細ログ出力

## 技術構成

- Cloudflare Workers
- TypeScript
- Wrangler
- Workers KV
- Discord Webhook
- HoYoLab API

## ディレクトリ構成

```text
.
├─ src/
│  └─ index.ts
├─ wrangler.jsonc
├─ worker-configuration.d.ts
├─ package.json
├─ TODO.md
└─ CHANGELOG.md
```

## セットアップ

### 1. 依存関係をインストール

```bash
npm install
```

### 2. ローカル用の秘密情報を設定

プロジェクト直下に `.dev.vars` を作成します。このファイルはGit管理対象外です。

```dotenv
DISCORD_WEBHOOK_URL=
HOYOLAB_LTUID_V2=
HOYOLAB_LTOKEN_V2=
HOYOLAB_COOKIE_TOKEN_V2=
```

### 3. 型定義を生成

```bash
npm run cf-typegen
```

`wrangler.jsonc` のバインディングを変更した場合は、必ず再実行してください。

## ローカル実行

```bash
npm run dev
```

`--test-scheduled` が有効なため、Cron Triggerのローカルテストが可能です。

## デプロイ

本番用シークレットはWranglerまたはCloudflareダッシュボードで設定し、値をGitHubへ保存しないでください。

```bash
npm run deploy
```

## スケジュール

WranglerのCronはUTCで指定しています。

| Cron | 日本時間 | 用途 |
|---|---:|---|
| `0 14 * * *` | 23:00 | 通常確認 |
| `10 14 * * *` | 23:10 | バックアップ確認 |

## 通知状態

Workers KVのバインディング名は `NOTIFICATION_STATE` です。

- `notification-sent:YYYY-MM-DD`: 通常通知済み
- `error-notification-sent:YYYY-MM-DD`: エラー通知済み

キーは48時間で自動削除されます。

## 運用上の注意

- HoYoLabのCookieは失効することがあります。
- Discord Webhook URLやCookieをコード、README、Issue、ログへ貼らないでください。
- 本システムは受取状況の確認のみを行い、ログインボーナスの自動受取は行いません。
- 変更予定は [TODO.md](TODO.md)、変更履歴は [CHANGELOG.md](CHANGELOG.md) で管理します。
