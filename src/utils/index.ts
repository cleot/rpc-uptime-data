import { performance } from "perf_hooks";

export const defaultEpochSeconds = 946684800; // is time of (2000, 1, 1)

export function titleCaseWord(word: string): string {
	if (!word) return word;
	return word[0].toUpperCase() + word.substring(1).toLowerCase();
}

export function logTimeElapsed(t0: number, prefix: string) {
	const t1 = performance.now();
	console.log(`TimeSpan ${prefix} ${t1 - t0} ms`);
}

export function sleep(ms: number): Promise<unknown> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function millisecondsForHumans(milliseconds: number): string {
	const seconds: number = Math.floor(milliseconds / 1000);

	const levels: [number, string][] = [
		[Math.floor(seconds / 31536000), "years"],
		[Math.floor((seconds % 31536000) / 86400), "days"],
		[Math.floor(((seconds % 31536000) % 86400) / 3600), "hours"],
		[Math.floor((((seconds % 31536000) % 86400) % 3600) / 60), "minutes"],
		[(((seconds % 31536000) % 86400) % 3600) % 60, "seconds"],
	];
	let returntext = "";

	for (let i = 0, max = levels.length; i < max; i++) {
		if (levels[i][0] === 0) continue;
		returntext +=
			" " +
			levels[i][0] +
			" " +
			(levels[i][0] === 1
				? levels[i][1].substr(0, levels[i][1].length - 1)
				: levels[i][1]);
	}
	return returntext.trim();
}

export function encodeBase64(data: string) {
	return Buffer.from(data ? data : "", "utf8").toString("base64");
}
export function decodeBase64(data: string) {
	return data ? Buffer.from(data, "base64").toString("utf8") : "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function log(args: any): void {
	if (process.env.DEBUG?.toLowerCase() === "true") console.log(args);
}

export function pp(obj: unknown): string {
	return JSON.stringify(obj, null, 2);
}

export function cleanInt(x: string) {
	const data = Number(x);
	return data >= 0 ? Math.floor(data) : Math.ceil(data);
}
