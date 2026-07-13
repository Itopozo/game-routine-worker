import os

import requests


webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")

if not webhook_url:
    raise RuntimeError("環境変数 DISCORD_WEBHOOK_URL が設定されていません。")

response = requests.post(
    webhook_url,
    json={"content": "🎉 game-routine-bot 初通知"},
    timeout=10,
)

response.raise_for_status()

print("Discordへの通知に成功しました。")