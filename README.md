# Game Routine Worker

Cloudflare WorkersでHoYoLABの日課受取状況を確認し、未受取や確認エラーをDiscordへ通知するWorkerです。

## 対応ゲーム

- 原神
- 崩壊：スターレイル
- ゼンレスゾーンゼロ
- アークナイツ：エンドフィールド（現在はログインボーナスページの案内のみ）

## 主な機能

- 毎日20:00～23:30 JSTに30分間隔で受取状況を確認
- HoYoLabに未受取がある間は、エンドフィールドの案内を含めて毎回通知
- 3ゲームのHoYoLAB APIを並列取得
- Workers KVによるエラー通知の重複防止
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

### 2. ローカル用の環境変数と秘密情報を設定

プロジェクト直下に `.dev.vars` を作成します。このファイルはGit管理対象外です。

```dotenv
DISCORD_WEBHOOK_URL=
HOYOLAB_LTUID_V2=
HOYOLAB_LTOKEN_V2=
HOYOLAB_COOKIE_TOKEN_V2=
```

`DISCORD_USER_ID` は通常の環境変数として `wrangler.jsonc` で管理し、Webhook URLとHoYoLAB CookieはSecretとして管理します。

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

`main` ブランチへのpushをCloudflareのGit連携が検知し、自動でビルド・デプロイします。
本番用シークレットはCloudflareダッシュボードで管理し、値をGitHubへ保存しないでください。
通常変数 `DISCORD_USER_ID` は `wrangler.jsonc` を設定元としてGitHubで管理します。

手動でデプロイする場合は以下を実行します。

```bash
npm run deploy
```

## スケジュール

WranglerのCronはUTCで指定しています。

| Cron | 日本時間 | 用途 |
|---|---:|---|
| `0,30 11-14 * * *` | 20:00～23:30（30分間隔） | 未受取確認・反復通知 |

## 通知状態

Workers KVのバインディング名は `NOTIFICATION_STATE` です。

- `error-notification-sent:YYYY-MM-DD`: エラー通知済み

通常の未受取通知はKVで抑止せず、未受取がある間は各Cron実行時に送信します。

キーは48時間で自動削除されます。

## 運用上の注意

- HoYoLabのCookieは失効することがあります。
- Discord Webhook URLやCookieをコード、README、Issue、ログへ貼らないでください。
- 本システムは受取状況の確認のみを行い、ログインボーナスの自動受取は行いません。
- 変更予定は [TODO.md](TODO.md)、変更履歴は [CHANGELOG.md](CHANGELOG.md) で管理します。
- 移行経緯・運用手順・検証記録は [docs/PROJECT_HISTORY.md](docs/PROJECT_HISTORY.md) を参照してください。
