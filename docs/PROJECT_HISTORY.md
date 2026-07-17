# Game Routine Worker 作業・運用記録

最終更新: 2026-07-17

## 1. この文書の目的

Game Routine Workerの構成、これまでの移行作業、動作確認結果、運用方法、今後の課題をまとめた記録です。日常運用や障害対応、別チャットでの開発再開時に参照します。

## 2. 現在のシステム

Cloudflare Workersが毎日HoYoLabの日課受取状況を確認し、未受取または確認エラーがある場合にDiscordへ通知します。ログインボーナスの自動受取は行いません。

### 対応状況

| ゲーム | 現在の処理 |
|---|---|
| 原神 | HoYoLab APIで受取状況を確認 |
| 崩壊：スターレイル | HoYoLab APIで受取状況を確認 |
| ゼンレスゾーンゼロ | HoYoLab APIで受取状況を確認 |
| アークナイツ：エンドフィールド | ログインボーナスページのURLを通知 |

### 構成

```text
PCの game-routine-worker
        ↕ Git
GitHub: Itopozo/game-routine-worker
        ↓ npm run deploy
Cloudflare Workers
        ├─ HoYoLab API
        ├─ Workers KV
        └─ Discord Webhook
```

GitHubの `main` をコードの正本とし、Cloudflareは実行環境として使用します。

## 3. 定期実行と通知

WranglerのCronはUTCで設定されています。

| Cron | 日本時間 | 用途 |
|---|---:|---|
| `0 14 * * *` | 23:00 | 通常確認 |
| `10 14 * * *` | 23:10 | バックアップ確認 |

3ゲームの確認は `Promise.all` で並列実行します。

### 判定後の動作

- 未受取が1件以上: 全ゲームの状態をまとめてDiscordへ通常通知
- 未受取なし・確認エラーあり: Discordへ障害通知
- すべて受取済み: 通知せずログのみ出力
- 23:00に確認エラー: 通常通知済みにはせず、23:10に再確認
- 通常通知済み: 同日のバックアップ実行では重複通知しない

Discordの `flags: 4` は、エンドフィールドURLなどのリンクプレビューを抑制するために使用しています。

## 4. Workers KV

バインディング名は `NOTIFICATION_STATE` です。

| キー | 用途 |
|---|---|
| `notification-sent:YYYY-MM-DD` | 通常通知済み判定 |
| `error-notification-sent:YYYY-MM-DD` | 障害通知済み判定 |

キーの有効期間は48時間です。ローカル開発時のKVは本番KVと分離されています。

## 5. 秘密情報

次の4項目をCloudflareのシークレットとして設定しています。

- `DISCORD_WEBHOOK_URL`
- `HOYOLAB_LTUID_V2`
- `HOYOLAB_LTOKEN_V2`
- `HOYOLAB_COOKIE_TOKEN_V2`

ローカルでは `.dev.vars` に保存します。このファイルは `.gitignore` で除外されており、GitHubへ登録しません。

Cookieは失効する可能性があるため、認証エラーが続く場合は値を更新します。

## 6. GitHub移行作業

### 移行前

- GitHubの `game-routine-bot`: Python／GitHub Actions版
- PCの `game-routine-worker`: 現行Cloudflare Workers版
- Cloudflare: Workers版を本番運用

現行コードがPCにしかなく、GitHubには旧版しか保存されていない状態でした。

### 実施内容

1. GitHub連携へPrivateリポジトリのアクセス権を追加
2. 移行用ブランチを作成
3. Workers版のTypeScript、Wrangler設定、依存関係を登録
4. 旧PythonコードとGitHub Actionsワークフローを削除
5. `README.md`、`TODO.md`、`CHANGELOG.md` を整備
6. `wrangler types` で型定義を生成
7. `npx tsc --noEmit` で型チェック
8. Pull Request #1をレビューして `main` へマージ
9. リポジトリ名を `game-routine-worker` へ変更
10. PC側のGit管理フォルダと `.dev.vars` を一本化
11. 内容を確認後、旧重複フォルダを削除

旧Python版はGit履歴から確認・復元できます。

## 7. Cloudflareとの照合

Wranglerで最新デプロイ情報を確認し、次がGitHub版と一致することを確認しました。

- Worker名
- `fetch` と `scheduled` ハンドラー
- 互換日
- `nodejs_compat`
- KVバインディング
- シークレット名4件

`wrangler init --from-dash` によるソース取得は、Windows／Node.js v24.18.0環境で `UV_HANDLE_CLOSING` のアサーションエラーが発生しました。生成された初期テンプレートはデプロイ済みソースではないと判断し、比較用フォルダを削除しました。

ローカルソースの更新時刻と当時のデプロイ時刻が1分差であり、設定も一致しているため、GitHubへ移行したコードがデプロイ元である可能性は非常に高いと判断しました。

## 8. 通信タイムアウト改善

外部サービスが応答しない場合に処理が長時間待機しないよう、Pull Request #2でタイムアウト処理を追加しました。

| 通信先 | タイムアウト |
|---|---:|
| HoYoLab API | 15秒 |
| Discord Webhook | 10秒 |

### 実装上の配慮

- `AbortSignal.timeout()` を使用
- レスポンスヘッダー取得だけでなく本文読了まで対象
- タイムアウトと一般的な接続失敗を区別
- エラー文にCookieやWebhook URLを含めない
- 既存の23:10再確認とKV動作を維持

### 確認内容

- セルフレビュー
- `npx tsc --noEmit`
- `npm run dev`
- ローカルHTTP応答: 200
- ローカルCron実行
- HoYoLab 3ゲームの並列確認
- 3ゲームすべて受取済みと正常判定
- 意図しないDiscord通知なし
- 作業ツリーがクリーンであること

## 9. 本番デプロイ結果

タイムアウト対応版をCloudflareへデプロイしました。

- デプロイ日時: 2026-07-17
- Cloudflare Version ID: `1e1e6ce3-a224-4701-8b8d-b5c0fede175c`
- トラフィック: 新バージョンへ100%
- 本番URL: https://game-routine-worker.itopozo.workers.dev
- 本番HTTP確認: 200 / `game-routine-worker is running`
- Cron: 23:00 JST、23:10 JSTの2件を確認
- KV、シークレット、互換設定: 維持を確認

## 10. 標準的な開発手順

```text
mainを最新化
  ↓
作業ブランチを作成
  ↓
コードと文書を変更
  ↓
型チェック・ローカルテスト
  ↓
セルフレビュー
  ↓
Pull Requestを作成
  ↓
最終レビュー後にmainへマージ
  ↓
PCのmainを同期
  ↓
Cloudflareへ手動デプロイ
  ↓
バージョン・HTTP・Cronを確認
```

主なコマンド:

```bash
git switch main
git pull --ff-only
git switch -c <branch-name>

npm install
npm run cf-typegen
npx tsc --noEmit
npm run dev

git push -u origin <branch-name>
npm run deploy
npx wrangler deployments status
```

`wrangler.jsonc` のバインディングを変更した場合は、必ず `npm run cf-typegen` を実行します。

## 11. 今後の優先課題

詳細は [../TODO.md](../TODO.md) で管理します。現在の主な候補は次のとおりです。

1. 必須環境変数の実行時検証
2. 安全な手動テスト方法の整備
3. エラー通知から秘密情報が漏れないことの継続確認
4. Discord Embed対応
5. エンドフィールドの受取状況自動判定
6. 自動テスト、formatter、lint、CI/CDの整備

## 12. 関連リンク

- [README](../README.md)
- [TODO](../TODO.md)
- [CHANGELOG](../CHANGELOG.md)
- [GitHubリポジトリ](https://github.com/Itopozo/game-routine-worker)
- [Cloudflare Workers公式ドキュメント](https://developers.cloudflare.com/workers/)
