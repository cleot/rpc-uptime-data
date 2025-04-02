import * as utils from "../utils";
import { md5 } from "js-md5";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;

export const cacheKeyRPCValidatorMappings = "rpcValidatorMappings";
export const cacheKeyRPC = "rpc-measurements";

let client: Redis;

export function initializeCache() {
	client = new Redis(REDIS_URL);
}

export async function getFromCache<T>(key: string, network: string) {
	try {
		if (client.status !== "ready") {
			return null;
		}
		key = getCacheKey(key, network);
		const data = await client.get(key);
		utils.log(
			`getFromCache key: ${key} data: ${data ? " not null" : " is null"}`
		);
		return <T>JSON.parse(data);
	} catch (e) {
		utils.log(`Error:${e}`);
	}
}

export async function setCache<T>(key: string, data: T, network: string) {
	try {
		await setCacheWithExpiry(
			key,
			data,
			getExpiryInSecondsByCacheKey(key),
			network
		);
	} catch (e) {
		utils.log(`Error:${e}`);
	}
}

export async function setCacheWithExpiry<T>(
	key: string,
	data: T,
	ttl: number,
	network: string
) {
	try {
		if (client.status !== "ready") {
			return;
		}
		key = getCacheKey(key, network);
		await client.set(key, JSON.stringify(data), "EX", ttl);
		utils.log(`setCache key ${key}`);
	} catch (e) {
		utils.log(`Error:${e}`);
	}
}

export function getExpiryInSecondsByCacheKey(key: string) {
	switch (key) {
		case cacheKeyRPCValidatorMappings:
			return 5;
		case cacheKeyRPC:
			return 5;
		default:
			return 5;
	}
}

export function getCacheKey(key: string, network: string) {
	return `${key}_${network}`;
}

export function getHashCacheKey<T>(key: string, keyData: T) {
	var hash = md5.create();
	hash.update(JSON.stringify(keyData));
	return `${key}_${hash.hex()}`;
}
