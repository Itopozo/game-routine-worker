import os

import requests


ltuid_v2 = os.environ.get("HOYOLAB_LTUID_V2")
ltoken_v2 = os.environ.get("HOYOLAB_LTOKEN_V2")
cookie_token_v2 = os.environ.get("HOYOLAB_COOKIE_TOKEN_V2")

discord_webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")

if not all([
    ltuid_v2, ltoken_v2, cookie_token_v2,
    discord_webhook_url,
]):
    raise RuntimeError("必要な環境変数が不足しています。")

url = "https://sg-hk4e-api.hoyolab.com/event/sol/info"

params = {
    "act_id": "e202102251931481",
    "lang": "ja-jp",
}

cookies = {
    "ltuid_v2": ltuid_v2,
    "ltoken_v2": ltoken_v2,
    "cookie_token_v2": cookie_token_v2,
}

response = requests.get(
    url,
    params=params,
    cookies=cookies,
    headers={
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://act.hoyolab.com/",
    },
    timeout=15,
)

response.raise_for_status()
result = response.json()

if result.get("retcode") != 0:
    raise RuntimeError(
        f"HoYoLAB APIエラー: "
        f"retcode={result.get('retcode')}, "
        f"message={result.get('message')}"
    )

data = result.get("data", {})
is_signed = data.get("is_sign")

if is_signed is True:
    print("今日のHoYoLABログボは受取済みです。")

elif is_signed is False:
    message = (
        "🔔 今日のHoYoLABログボが未受取です！\n"
        "リセットまであと少しです。"
    )

    discord_response = requests.post(
        discord_webhook_url,
        json={"content": message},
        timeout=10,
    )

    discord_response.raise_for_status()
    print("未受取通知をDiscordへ送信しました。")

else:
    raise RuntimeError("受取状況を判定できませんでした。")