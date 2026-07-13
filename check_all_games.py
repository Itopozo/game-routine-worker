import os

import requests


GAMES = {
    "原神": {
        "url": "https://sg-hk4e-api.hoyolab.com/event/sol/info",
        "act_id": "e202102251931481",
        "signgame": "gi",
    },
    "崩壊：スターレイル": {
        "url": "https://sg-public-api.hoyolab.com/event/luna/os/info",
        "act_id": "e202303301540311",
        "signgame": "hsr",
    },
    "ゼンレスゾーンゼロ": {
        "url": "https://sg-act-nap-api.hoyolab.com/event/luna/zzz/os/info",
        "act_id": "e202406031448091",
        "signgame": "zzz",
    },
}


ltuid_v2 = os.environ.get("HOYOLAB_LTUID_V2")
ltoken_v2 = os.environ.get("HOYOLAB_LTOKEN_V2")
cookie_token_v2 = os.environ.get("HOYOLAB_COOKIE_TOKEN_V2")
discord_webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")

if not all(
    [
        ltuid_v2,
        ltoken_v2,
        cookie_token_v2,
        discord_webhook_url,
    ]
):
    raise RuntimeError("必要な環境変数が不足しています。")

cookies = {
    "ltuid_v2": ltuid_v2,
    "ltoken_v2": ltoken_v2,
    "cookie_token_v2": cookie_token_v2,
}

headers = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://act.hoyolab.com/",
}

results = {}

for game_name, game in GAMES.items():
    response = requests.get(
    game["url"],
    params={
        "act_id": game["act_id"],
        "lang": "ja-jp",
    },
    cookies=cookies,
    headers={
        **headers,
        "x-rpc-signgame": game["signgame"],
    },
    timeout=15,
    )
    response.raise_for_status()

    result = response.json()

    if result.get("retcode") != 0:
        raise RuntimeError(
            f"{game_name}のAPIエラー: "
            f"retcode={result.get('retcode')}, "
            f"message={result.get('message')}"
        )

    is_signed = result.get("data", {}).get("is_sign")

    if not isinstance(is_signed, bool):
        raise RuntimeError(f"{game_name}の受取状況を判定できませんでした。")

    results[game_name] = is_signed


for game_name, is_signed in results.items():
    status = "受取済み" if is_signed else "未受取"
    print(f"{game_name}: {status}")


unsigned_games = [
    game_name
    for game_name, is_signed in results.items()
    if not is_signed
]

if unsigned_games:
    status_lines = [
        f"{'✅' if is_signed else '❌'} {game_name}"
        for game_name, is_signed in results.items()
    ]

    message = (
        "🔔 今日のゲーム日課に未受取があります！\n\n"
        + "\n".join(status_lines)
        + "\n\n【エンドフィールド】\n"
        + "ログボページ：\n"
        + "https://game.skport.com/endfield/sign-in\n\n"
        + "リセットまであと少しです。"
    )

    discord_response = requests.post(
        discord_webhook_url,
        json={"content": message},
        timeout=10,
    )
    discord_response.raise_for_status()

    print("未受取状況をDiscordへ送信しました。")
else:
    print("すべてのHoYoLABログボが受取済みです。")