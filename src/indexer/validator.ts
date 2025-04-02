import { ContractKit, newKit } from "@celo/contractkit";
import * as dbService from "../service/database";
import * as blockchainService from "../service/blockchain";
import * as utils from "../utils";
import { performance } from "perf_hooks";
import { IGroupMembership } from "../utils/types";

let kit: ContractKit;

export function initializeContractKit(url: string) {
	kit = newKit(url);
}

export async function initializeNetwork(
	networkName: string
): Promise<dbService.Network> {
	const network = await dbService.getOrInsertNetwork(networkName);
	return network;
}

export async function updateValidatorNames(
	blockNumber: number,
	network: dbService.Network,
	overrideKit?: ContractKit
): Promise<dbService.ValidatorName[]> {
	const t0 = performance.now();
	utils.log("Start updateValidatorNames()...");

	if (overrideKit) {
		kit = overrideKit;
	}

	const validators: dbService.Validator[] = await dbService.getAllValidators(
		network.networkName
	);
	const validatorNamesToInsert: dbService.ValidatorName[] = [];

	for (let i = 0; i < validators?.length; i++) {
		const validator = validators[i];

		// Get the validator name from on-chain for this block
		const validatorNameOnChain: string =
			await blockchainService.getAccountName(
				kit,
				validator.address,
				blockNumber
			);

		// If we found an existing database record for this block
		// If the name is different to what we just found from on-chain
		// Close off this database record
		const validatorNameFromDatabase =
			await dbService.getValidatorNameAtBlock(
				network.networkName,
				validator.id,
				blockNumber
			);

		const newValidatorName: dbService.ValidatorName =
			dbService.ValidatorName.build({
				networkId: network.id,
				validatorId: validator.id,
				fromBlock: blockNumber,
				validatorName: validatorNameOnChain,
			});
		if (!validatorNameFromDatabase) {
			validatorNamesToInsert.push(newValidatorName);
		} else if (
			validatorNameFromDatabase?.validatorName !== validatorNameOnChain
		) {
			validatorNameFromDatabase.toBlock = blockNumber - 1;
			await validatorNameFromDatabase.save();
			validatorNamesToInsert.push(newValidatorName);
		}
	}
	const insertedValidatorNames: dbService.ValidatorName[] =
		await dbService.bulkInsertValidatorNames(validatorNamesToInsert);
	utils.log(
		`Inserted ${
			insertedValidatorNames?.length
		} new validator names ${utils.pp(insertedValidatorNames)}`
	);
	utils.logTimeElapsed(t0, "updateValidatorNames()");

	return insertedValidatorNames;
}

export async function updateValidatorGroups(
	network: dbService.Network,
	overrideKit?: ContractKit
): Promise<void> {
	const t0 = performance.now();
	utils.log("Start updateValidatorGroups()...");

	if (overrideKit) {
		kit = overrideKit;
	}

	const validators: dbService.Validator[] = await dbService.getAllValidators(
		network.networkName
	);

	for (let i = 0; i < validators?.length; i++) {
		const validator = validators[i];

		// Get the validator group membership list from on-chain for this validator (all groups in history)
		//
		const validatorGroups: IGroupMembership[] =
			await blockchainService.getValidatorGroups(kit, validator.address);
		utils.log(
			`Found ${validatorGroups?.length} group history records for validator ${validator.address}`
		);

		const sortedValidatorGroups: IGroupMembership[] = validatorGroups?.sort(
			(a, b) => (a.epoch > b.epoch ? 1 : -1)
		);

		// Loop through history in order and make sure database matches
		//
		for (let j = 0; j < sortedValidatorGroups?.length; j++) {
			const validatorGroupOnChain = sortedValidatorGroups[j];
			utils.log(
				`Processing ${utils.pp(validatorGroupOnChain)} for validator ${
					validator.address
				}...`
			);

			// Find an existing database record for this epoch
			//
			const validatorValidatorGroupFromDatabase =
				await dbService.getValidatorGroupValidatorAtEpoch(
					network.networkName,
					validator.id,
					validatorGroupOnChain.epoch,
					"full"
				);

			if (validatorValidatorGroupFromDatabase)
				utils.log(
					`Found an existing database record matching this epoch for validator ${validator.address} with fromEpoch ${validatorValidatorGroupFromDatabase.fromEpoch} and toEpoch ${validatorValidatorGroupFromDatabase.toEpoch} and validatorGroup ${validatorValidatorGroupFromDatabase.validatorGroup?.address}`
				);
			else
				utils.log(
					`Did not find an existing group relationship for validator ${validator.address} group ${validatorGroupOnChain.group} and epoch ${validatorGroupOnChain.epoch}`
				);

			// Find an existing validator group for this record
			//
			const validatorGroup: dbService.ValidatorGroup =
				await dbService.getValidatorGroupByAddress(
					network.networkName,
					validatorGroupOnChain.group
				);

			// If existing group doesn't exist, create it
			//
			let newValidatorGroup: dbService.ValidatorGroup;
			if (!validatorGroup) {
				const validatorGroupName: string =
					await blockchainService.getAccountName(
						kit,
						validatorGroupOnChain.group,
						await blockchainService.getBlockNumber(kit)
					);
				newValidatorGroup = await dbService.ValidatorGroup.create({
					networkId: network.id,
					address: validatorGroupOnChain.group,
					name: validatorGroupName,
				});

				// Retrieve again because creation doesn't necessarily return
				// the table IDs in MySQL
				//
				newValidatorGroup = await dbService.getValidatorGroupByAddress(
					network.networkName,
					validatorGroupOnChain.group
				);

				utils.log(
					`Validator group for this relationship does not exist. Created for first time new group ${newValidatorGroup.address} / ${newValidatorGroup.name}`
				);
			} else
				utils.log(
					`Validator group for this relationship already exists for group ${validatorGroup.address} / ${validatorGroup.name}`
				);

			// Since we are processing in sorted order
			// If a relationship record already exists with a different group
			// it's probably the prior record that needs to be closed off
			//
			if (
				validatorValidatorGroupFromDatabase &&
				validatorValidatorGroupFromDatabase.validatorGroup?.address !==
					validatorGroupOnChain.group
			) {
				utils.log(
					`Relationship already exists for this epoch but with a different group address. Since we are processing sequentially, this is a prior group relationship that may be closed off and a new relationship created...`
				);
				validatorValidatorGroupFromDatabase.toEpoch =
					validatorGroupOnChain.epoch - 1;
				await validatorValidatorGroupFromDatabase.save();
				utils.log(
					`Updated record for group ${
						validatorValidatorGroupFromDatabase.validatorGroup
							?.address
					} with toEpoch ${validatorGroupOnChain.epoch - 1}`
				);
			}

			const newValidatorGroupValidator: dbService.ValidatorGroupValidator =
				dbService.ValidatorGroupValidator.build({
					networkId: network.id,
					validatorId: validator.id,
					validatorGroupId:
						newValidatorGroup?.id || validatorGroup.id,
					fromEpoch: validatorGroupOnChain.epoch,
				});
			await dbService.bulkInsertValidatorGroupValidators([
				newValidatorGroupValidator,
			]);
			utils.log(
				`Upserted relationship for group ${validatorGroupOnChain.group} with fromEpoch ${validatorGroupOnChain.epoch}`
			);
			const syncrhonizedRelationship: dbService.ValidatorGroupValidator =
				await dbService.getValidatorGroupValidatorAtEpoch(
					network.networkName,
					validator.id,
					validatorGroupOnChain.epoch
				);
			utils.log(
				`Completed group relationship for epoch ${
					validatorGroupOnChain.epoch
				} from database is ${utils.pp(syncrhonizedRelationship)}`
			);
		}
		utils.log(
			`Finished processing groups for validator ${validator.address}`
		);
	}

	utils.log(`Now updating Validator Group names...`);
	const validatorGroups: dbService.ValidatorGroup[] =
		await dbService.ValidatorGroup.findAll({
			where: { networkId: network.id },
		});

	const blockNumber = await blockchainService.getBlockNumber(kit);
	for (let k = 0; k < validatorGroups?.length; k++) {
		const group = validatorGroups[k];
		const validatorGroupName: string =
			await blockchainService.getAccountName(
				kit,
				group.address,
				blockNumber
			);
		group.name = validatorGroupName ? validatorGroupName : group.name;
		await group.save();
	}

	utils.logTimeElapsed(t0, "updateValidatorGroups()");
}
