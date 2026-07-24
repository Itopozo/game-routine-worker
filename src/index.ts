type WorkerEnv = Env & {
	DISCORD_USER_ID: string;
};

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

type HoYoLabResponse = {
	retcode: number;
	message: string;
	data?: { is_sign?: boolean };
};

type GameCheckResult =
	| { name: string; status: "signed" }
	| { name: string; status: "unsigned" }
	| { name: string; status: "error"; errorMessage: string };

function isTimeoutError(error: unknown): boolean {
	return error instanceof Error && error.name === "TimeoutError";
}

function getJstDateKey(date = new Date()): string {
	return new Date(date.getTime() + 9 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 10);
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

async function checkGame(game: GameConfig, env: WorkerEnv): Promise<boolean> {
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
			throw new Error(`${game.name}: HoYoLab APIが15秒以内に応答しませんでした。`);
		}
		throw new Error(`${game.name}: HoYoLab APIへの接続に失敗しました。`);
	}

	if (!response.ok) {
		throw new Error(`${game.name}: HTTP ${response.status} ${response.statusText}`);
	}

	let result: HoYoLabResponse;
	try {
		result = await response.json<HoYoLabResponse>();
	} catch (error) {
		if (isTimeoutError(error)) {
			throw new Error(`${game.name}: HoYoLab APIが15秒以内に応答しませんでした。`);
		}
		throw new Error(`${game.name}: HoYoLab APIの応答を読み取れませんでした。`);
	}

	if (result.retcode !== 0) {
		throw new Error(`${game.name}: retcode=${result.retcode}, message=${result.message}`);
	}

	if (typeof result.data?.is_sign !== "boolean") {
		throw new Error(`${game.name}: 受取状況を判定できませんでした。`);
	}
	return result.data.is_sign;
}

async function sendDiscordMessage(env: WorkerEnv, message: string): Promise<void> {
	let response: Response;
	try {
		response = await fetch(env.DISCORD_WEBHOOK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				content: message,
				allowed_mentions: { users: [env.DISCORD_USER_ID] },
				flags: 4,
			}),
			signal: AbortSignal.timeout(DISCORD_REQUEST_TIMEOUT_MS),
		});
	} catch (error) {
		if (isTimeoutError(error)) {
			throw new Error("Discord通知失敗: 10秒以内に応答しませんでした。");
		}
		throw new Error("Discord通知失敗: Webhookへの接続に失敗しました。");
	}

	const responseBody = await response.text();
	console.log(`Discord HTTPステータス: ${response.status}`);
	if (responseBody) console.log(`Discordレスポンス: ${responseBody}`);
	if (!response.ok) {
		throw new Error(`Discord通知失敗: HTTP ${response.status} ${response.statusText} ${responseBody}`);
	}
}

async function runDailyCheck(env: WorkerEnv, cronExpression: string): Promise<void> {
	const startedAt = new Date();
	const startedAtJst = formatJstDateTime(startedAt);
	console.log(`--Cron開始: ${startedAt.toISOString()}`);
	console.log(`Cron式: ${cronExpression}`);
	console.log(`日本時間: ${startedAtJst}`);

	const dateKey = getJstDateKey(startedAt);
	const errorNotificationKey = `error-notification-sent:${dateKey}`;


	const results: GameCheckResult[] = await Promise.all(
		GAMES.map(async (game): Promise<GameCheckResult> => {
			console.log(`${game.name}: 受取状況を確認します。`);
			try {
				const isSigned = await checkGame(game, env);
				console.log(`${game.name}: ${isSigned ? "受取済み" : "未受取"}`);
				return { name: game.name, status: isSigned ? "signed" : "unsigned" };
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				console.error(`${game.name}: 確認失敗: ${errorMessage}`);
				return { name: game.name, status: "error", errorMessage };
			}
		}),
	);

	const unsignedGames = results.filter((result) => result.status === "unsigned");
	const errorGames = results.filter(
		(result): result is Extract<GameCheckResult, { status: "error" }> => result.status === "error",
	);
	const statusLines = results.map((result) => {
		if (result.status === "signed") return `✅ ${result.name}`;
		if (result.status === "unsigned") return `❌ ${result.name}`;
		return `⚠️ ${result.name}（確認失敗）`;
	});

	if (unsignedGames.length > 0) {
		const message = [
			`<@${env.DISCORD_USER_ID}>`,
			"🔔 今日のゲーム日課に未受取があります！",
			"",
			`実行時刻：${startedAtJst}`,
			`実行Cron：${cronExpression}`,
			"",
			...statusLines,
			"",
			...(errorGames.length > 0 ? ["一部ゲームの確認に失敗しています。", "Cloudflareのログも確認してください。", ""] : []),
			"【エンドフィールド】",
			"https://game.skport.com/endfield/sign-in",
			"",
			"リセットまであと少しです。お忘れなく！",
		].join("\n");
		await sendDiscordMessage(env, message);
		return;
	}

	if (errorGames.length > 0) {
		if ((await env.NOTIFICATION_STATE.get(errorNotificationKey)) !== null) {
			console.log(`本日は障害通知済みです: ${errorNotificationKey}`);
			return;
		}
		const errorDetails = errorGames.flatMap((result) => [`・${result.name}`, `  ${result.errorMessage}`]);
		const message = [
			`<@${env.DISCORD_USER_ID}>`,
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
		await sendDiscordMessage(env, message);
		await env.NOTIFICATION_STATE.put(errorNotificationKey, startedAt.toISOString(), { expirationTtl: 172800 });
		console.log(`障害通知済み状態を保存しました: ${errorNotificationKey}`);
		return;
	}

	console.log("すべて受取済みのため通知しません。");
}

export default {
	async fetch(): Promise<Response> {
		return new Response("game-routine-worker is running");
	},
	async scheduled(event: ScheduledController, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
		ctx.waitUntil(runDailyCheck(env, event.cron));
	},
} satisfies ExportedHandler<WorkerEnv>;
