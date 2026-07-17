# CHANGELOG

このプロジェクトの主な変更を記録します。

## [Unreleased]

### Added

- プロジェクトの移行経緯・運用・検証をまとめた `docs/PROJECT_HISTORY.md`
- HoYoLab APIに15秒のタイムアウト処理
- Discord Webhookに10秒のタイムアウト処理
- タイムアウトと接続失敗を区別する安全なエラーメッセージ

### Planned

- エンドフィールドの受取状況判定
- Discord Embed対応
- エラー通知と通知文面の改善
- テストと品質チェックの整備

## [0.2.0] - 2026-07-17

### Added

- Cloudflare Workers版のTypeScript実装
- 23:00 JSTと23:10 JSTのCron Trigger
- Workers KVによる通常通知とエラー通知の重複防止
- HoYoLab 3ゲームの並列確認
- Discord通知とリンクプレビュー抑制
- 実行時刻、Cron、API結果、Discord応答のログ
- エンドフィールドのログインボーナスページ案内
- `AGENTS.md` とWrangler生成型定義

### Changed

- 実行基盤をGitHub ActionsからCloudflare Workersへ移行
- GitHubリポジトリをWorkers版のソース管理へ移行

### Removed

- 旧Python実装
- GitHub Actionsの定期実行ワークフロー

## [0.1.0] - 2026-07-14

### Added

- PythonによるHoYoLab受取状況確認
- Discord Webhook通知
- GitHub Actionsによる実行
