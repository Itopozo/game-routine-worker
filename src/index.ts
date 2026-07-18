type GameConfig = {
	name: string;
	url: string;
	actId: string;
	signGame: string;
};

const GAMES: GameConfig[] = [
	{
		name: "原神",
		url: "https://sg-hk4e-api.hoyolab.com/event/sol/info",
		actId: "e202102251931481",
		signGame: "gi",
	},
	{
		name: "崩壊：スターレイル",
		url: "https://sg-public-api.hoyolab.com/event/luna/os/info",
		actId: "e202303301540311",
		signGame: "hsr",
	},
	{
		name: "ゼンレスゾーンゼロ",
		url: "https://sg-act-nap-api.hoyolab.com/event/luna/zzz/os/info",
		actId: "e202406031448091",
		signGame: "zzz",
	},
];

const HOYOLAB_REQUEST_TIMEOUT_MS = 15_000;
const DISCORD_REQUEST_TIMEOUT_MS = 10_000;
const DISCORD_USER_ID = "322055600194453527";

type HoYoLabResponse = {
	retcode: number;
	message: string;
	data?: {
		is_sign?: boolean;
	};
};

type GameCheckResult =
	| {
		name: string;
		status: "signed";
	}
	| {
		name: string;
		status: "unsigned";
	}
	| {
		name: string;
		status: "error";
		errorMessage: string;
	};

function isTimeoutError(error: unknown): boolean {
	return error instanceof Error && error.name === "TimeoutError";
}

function getJstDateKey(date = new Date()): string {
	const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
	return jstDate.toISOString().slice(0, 10);
}

function formatJstDateTime(date = new Date()): string {
	return new Intl.DateTimeFormat("ja-JP", {
		timeZone: "Asia/Tokyo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).format(date);
}

async function checkGame(
	game: GameConfig,
	env: Env,
): Promise<boolean> {
	const url = new URL(game.url);
	url.searchParams.set("act_id", game.actId);
	url.searchParams.set("lang", "ja-jp");

	const cookie = [
		`ltuid_v2=${env.HOYOLAB_LTUID_V2}`,
		`ltoken_v2=${env.HOYOLAB_LTOKEN_V2}`,
		`cookie_token_v2=${env.HOYOLAB_COOKIE_TOKEN_V2}`,
	].join("; ");

	let response: Response;

	try {
		response = await fetch(url.toString(), {
			method: "GET",
			headers: {
				"User-Agent": "Mozilla/5.0",
				Referer: "https://act.hoyolab.com/",
				Cookie: cookie,
				"x-rpc-signgame": game.signGame,
			},
			signal: AbortSignal.timeout(HOYOLAB_REQUEST_TIMEOUT_MS),
		});
	} catch (error) {
		if (isTimeoutError(error)) {
			throw new Error(
				`${game.name}: HoYoLab APIが${HOYOLAB_REQUEST_TIMEOUT_MS / 1000}秒以内に応答しませんでした。`,
			);
		}

		throw new Error(
			`${game.name}: HoYoLab APIへの接続に失敗しました。`,
		);
	}

	if (!response.ok) {
		throw new Error(
			`${game.name}: HTTP ${response.status} ${response.statusText}`,
		);
	}

	let result: HoYoLabResponse;

	try {
		result = await response.json<HoYoLabResponse>();
	} catch (error) {
		if (isTimeoutError(error)) {
			throw new Error(
				`${game.name}: HoYoLab APIが${HOYOLAB_REQUEST_TIMEOUT_MS / 1000}秒以内に応答しませんでした。`,
			);
		}

		throw new Error(
			`${game.name}: HoYoLab APIの応答を読み取れませんでした。`,
		);
	}

	if (result.retcode !== 0) {
		throw new Error(
			`${game.name}: retcode=${result.retcode}, message=${result.message}`,
		);
	}

	const isSigned = result.data?.is_sign;

	if (typeof isSigned !== "boolean") {
		throw new Error(`${game.name}: 受取状況を判定できませんでした。`);
	}

	return isSigned;
}

async function sendDiscordMessage(
	env: Env,
	message: string,
): Promise<void> {
	let response: Response;

	try {
		response = await fetch(env.DISCORD_WEBHOOK_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				content: message,
				allowed_mentions: {
					users: [DISCORD_USER_ID],
				},
				flags: 4,
			}),
			signal: AbortSignal.timeout(DISCORD_REQUEST_TIMEOUT_MS),
		});
	} catch (error) {
		if (isTimeoutError(error)) {
			throw new Error(
				`Discord通知失敗: ${DISCORD_REQUEST_TIMEOUT_MS / 1000}秒以内に応答しませんでした。`,
			);
		}

		throw new Error(
			"Discord通知失敗: Webhookへの接続に失敗しました。",
		);
	}

	let responseBody: string;

	try {
		responseBody = await response.text();
	} catch (error) {
		if (isTimeoutError(error)) {
			throw new Error(
				`Discord通知失敗: ${DISCORD_REQUEST_TIMEOUT_MS / 1000}秒以内に応答しませんでした。`,
			);
		}

		throw new Error(
			"Discord通知失敗: Webhookの応答を読み取れませんでした。",
		);
	}

	console.log(`Discord HTTPステータス: ${response.status}`);

	if (responseBody) {
		console.log(`Discordレスポンス: ${responseBody}`);
	}

	if (!response.ok) {
		throw new Error(
			`Discord通知失敗: HTTP ${response.status} ${response.statusText} ${responseBody}`,
		);
	}
}

async function runDailyCheck(
	env: Env,
	cronExpression: string,
): Promise<void> {
	const startedAt = new Date();
	const startedAtJst = formatJstDateTime(startedAt);

	console.log(`--Cron開始: ${startedAt.toISOString()}`);
	console.log(`Cron式: ${cronExpression}`);
	console.log(`日本時間: ${startedAtJst}`);

	const dateKey = getJstDateKey(startedAt);
	const notificationKey = `notification-sent:${dateKey}`;
	const errorNotificationKey = `error-notification-sent:${dateKey}`;

	const alreadySent =
		await env.NOTIFICATION_STATE.get(notificationKey);

	if (alreadySent !== null) {
		console.log(
			`本日は通常通知済みのため終了します: ${notificationKey}`,
		);
		return;
	}

	const results: GameCheckResult[] = await Promise.all(
		GAMES.map(async (game): Promise<GameCheckResult> => {
			console.log(`${game.name}: 受取状況を確認します。`);

			try {
				const isSigned = await checkGame(game, env);

				console.log(
					`${game.name}: ${isSigned ? "受取済み" : "未受取"}`,
				);

				return {
					name: game.name,
					status: isSigned ? "signed" : "unsigned",
				};
			} catch (error) {
				const errorMessage =
					error instanceof Error
						? error.message
						: String(error);

				console.error(
					`${game.name}: 確認失敗: ${errorMessage}`,
				);

				return {
					name: game.name,
					status: "error",
					errorMessage,
				};
			}
		}),
	);

	const unsignedGames = results.filter(
		(result) => result.status === "unsigned",
	);

	const errorGames = results.filter(
		(
			result,
		): result is Extract<
			GameCheckResult,
			{ status: "error" }
		> => result.status === "error",
	);

	const statusLines = results.map((result) => {
		switch (result.status) {
			case "signed":
				return `✅ ${result.name}`;
			case "unsigned":
				return `❌ ${result.name}`;
			case "error":
				return `⚠️ ${result.name}（確認失敗）`;
		}
	});

	/*
	 * 未受取が1件以上ある場合：
	 * エラーが混ざっていても、結果をまとめて通常通知する。
	 */
	if (unsignedGames.length > 0) {
		const message = [
			`<@${DISCORD_USER_ID}>`,
			"🔔 今日のゲーム日課に未受取があります！",
			"",
			`実行時刻：${startedAtJst}`,
			`実行Cron：${cronExpression}`,
			"",
			...statusLines,
			"",
			...(errorGames.length > 0
				? [
					"一部ゲームの確認に失敗しています。",
					"Cloudflareのログも確認してください。",
					"",
				]
				: []),
			"【エンドフィールド】",
			"https://game.skport.com/endfield/sign-in",
			"",
			"リセットまであと少しです。お忘れなく！",
		].join("\n");

		console.log("Discordへ通常通知を送信します。");

		await sendDiscordMessage(env, message);

		await env.NOTIFICATION_STATE.put(
			notificationKey,
			startedAt.toISOString(),
			{
				expirationTtl: 172800,
			},
		);

		console.log(
			`通常通知済み状態を保存しました: ${notificationKey}`,
		);
		console.log(`--Cron終了: ${new Date().toISOString()}`);
		return;
	}
	/*
	 * 未受取は確認できなかったが、APIエラーがある場合：
	 * 障害通知を送る。ただし通常通知済みにはしない。
	 * そのため23:10に再確認できる。
	 */
	if (errorGames.length > 0) {
		const errorAlreadySent =
			await env.NOTIFICATION_STATE.get(
				errorNotificationKey,
			);

		if (errorAlreadySent !== null) {
			console.log(
				`本日は障害通知済みです: ${errorNotificationKey}`,
			);
			console.log(
				"通常通知済みにはしていないため、今回も受取状況の確認は実施しました。",
			);
			return;
		}

		const errorDetails = errorGames.flatMap((result) => [
			`・${result.name}`,
			`  ${result.errorMessage}`,
		]);

		const message = [
			`<@${DISCORD_USER_ID}>`,
			"⚠️ ゲーム日課の確認中にエラーが発生しました。",
			"",
			`実行時刻：${startedAtJst}`,
			`実行Cron：${cronExpression}`,
			"",
			...statusLines,
			"",
			"【エラー詳細】",
			...errorDetails,
			"",
			"未受取が残っていないか、手動で確認してください。",
		].join("\n");

		console.log("Discordへ障害通知を送信します。");

		await sendDiscordMessage(env, message);

		await env.NOTIFICATION_STATE.put(
			errorNotificationKey,
			startedAt.toISOString(),
			{
				expirationTtl: 172800,
			},
		);

		console.log(
			`障害通知済み状態を保存しました: ${errorNotificationKey}`,
		);
		console.log(`Cron終了: ${new Date().toISOString()}`);
		return;
	}

	console.log("すべて受取済みのため通知しません。");
	console.log(`Cron終了: ${new Date().toISOString()}`);
}

export default {
	async fetch(): Promise<Response> {
		return new Response("game-routine-worker is running");
	},
	async scheduled(
		event: ScheduledController,
		env: Env,
		ctx: ExecutionContext,
	): Promise<void> {
		ctx.waitUntil(
			runDailyCheck(env, event.cron),
		);
	},
} satisfies ExportedHandler<Env>;