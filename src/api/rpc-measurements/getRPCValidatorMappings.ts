import * as dbService from "../../service/database";
import { log } from "../../utils";
import {
	cacheKeyRPCValidatorMappings,
	getFromCache,
	setCacheWithExpiry,
} from "../../service/cache";
import { ApiValidator, flattenValidator } from "./models/types";

export async function getRPCValidatorMappings(
	network: string
): Promise<ApiValidator[]> {
	const fromCache = await getFromCache<ApiValidator[]>(
		cacheKeyRPCValidatorMappings,
		network
	);
	if (fromCache) {
		return fromCache;
	}
	const distinctValidatorRPCs: dbService.ValidatorRPC[] =
		await dbService.ValidatorRPC.findAll({
			attributes: [
				[
					dbService.sequelize.fn(
						"DISTINCT",
						dbService.sequelize.col("validatorId")
					),
					"validatorId",
				],
			],
		});
	const validatorIds = distinctValidatorRPCs.map((v) => v.validatorId);
	const validators = await dbService.getRPCValidatorMappingsByIDs(
		network,
		validatorIds,
		["api"]
	);

	const apiValidators: ApiValidator[] = validators.map(flattenValidator);
	if (!apiValidators) {
		return null;
	}
	let ttl = 60;
	await setCacheWithExpiry<ApiValidator[]>(
		cacheKeyRPCValidatorMappings,
		apiValidators,
		ttl,
		network
	);
	log("getValidatorMappings is " + JSON.stringify(apiValidators));
	return apiValidators;
}
