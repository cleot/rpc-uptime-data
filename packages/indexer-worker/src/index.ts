/// <reference types="@cloudflare/workers-types" />

import { ContractKit, newKit } from "@celo/contractkit";
import type { ElectionWrapper } from "@celo/contractkit/lib/wrappers/Election";
import type {
	ValidatorsWrapper,
	ValidatorGroup,
} from "@celo/contractkit/lib/wrappers/Validators"; // Added ValidatorGroup type
import type { AccountsWrapper } from "@celo/contractkit/lib/wrappers/Accounts";
import {
	D1DataAccessLayer,
	IDataAccessLayer,
	NetworkRecord,
	ValidatorInput,
	ValidatorGroupInput,
	ValidatorNameInput,
	RPCMeasurementHeaderInput,
	RPCMeasurementInput,
	ValidatorRPCInput,
	ValidatorGroupValidatorInput,
} from "@rpc-uptime/database-core"; // Added ValidatorGroupValidatorInput

// Define the expected environment bindings based on wrangler.toml
export interface Env {
	// D1 Database binding
	DB: D1Database;

	// Environment variables set in wrangler.toml
	NETWORK_ID: string; // e.g., "mainnet", "alfajores", "baklava"
	CELO_RPC_URL: string; // RPC endpoint for the target network

	// Optional secrets (uncomment in wrangler.toml and below if needed)
	// RPC_API_KEY: string;
}

// Helper: Basic RPC check using fetch
async function checkRPCEndpoint(
	rpcUrl: string
): Promise<{
	up: boolean;
	blockNumber?: number;
	responseTimeMs?: number;
	statusCode?: number;
}> {
	const startTime = performance.now();
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

		const response = await fetch(rpcUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				method: "eth_blockNumber",
				params: [],
				id: 1,
			}),
			signal: controller.signal,
		});
		clearTimeout(timeoutId);

		const duration = performance.now() - startTime;
		const statusCode = response.status;

		if (!response.ok) {
			console.warn(
				`[${rpcUrl}] Health check failed with status: ${statusCode}`
			);
			return { up: false, statusCode };
		}

		const json: any = await response.json();
		if (json.error || !json.result) {
			console.warn(
				`[${rpcUrl}] Health check failed with RPC error: ${
					json.error?.message || "No result"
				}`
			);
			return { up: false, statusCode };
		}

		const blockNumber = parseInt(json.result, 16);
		if (isNaN(blockNumber)) {
			console.warn(
				`[${rpcUrl}] Health check failed: Invalid block number format.`
			);
			return { up: false, statusCode };
		}

		console.log(
			`[${rpcUrl}] Health check OK: Block ${blockNumber}, Time ${duration.toFixed(
				0
			)}ms`
		);
		return {
			up: true,
			blockNumber,
			responseTimeMs: Math.round(duration),
			statusCode,
		};
	} catch (error: any) {
		const duration = performance.now() - startTime;
		console.error(
			`[${rpcUrl}] Health check failed: ${
				error.message
			} after ${duration.toFixed(0)}ms`
		);
		// Distinguish timeout/abort errors if needed
		const statusCode = error.name === "AbortError" ? 408 : 500; // Use 408 for timeout
		return { up: false, statusCode };
	}
}

// --- Main Worker Logic ---

export default {
	async scheduled(
		event: ScheduledEvent,
		env: Env,
		ctx: ExecutionContext
	): Promise<void> {
		console.log(
			`[${env.NETWORK_ID}] Cron event triggered at: ${new Date(
				event.scheduledTime
			)}`
		);
		const dal = new D1DataAccessLayer(env.DB);

		try {
			const kit: ContractKit = newKit(env.CELO_RPC_URL);
			const accountsWrapper: AccountsWrapper =
				await kit.contracts.getAccounts(); // Initialize once
			console.log(
				`[${env.NETWORK_ID}] Initialized ContractKit for ${env.CELO_RPC_URL}`
			);

			const network = await dal.getOrInsertNetwork(env.NETWORK_ID);

			console.log(`[${env.NETWORK_ID}] Starting indexing process...`);
			await runIndexingLogic(kit, dal, network, accountsWrapper); // Pass accountsWrapper
			console.log(
				`[${env.NETWORK_ID}] Indexing process completed successfully.`
			);
		} catch (error: any) {
			console.error(
				`[${env.NETWORK_ID}] Error during scheduled execution:`,
				error,
				error.stack
			);
			// Consider reporting errors to an external service
		}
	},
};

// --- Core Indexing Logic ---

async function runIndexingLogic(
	kit: ContractKit,
	dal: IDataAccessLayer,
	network: NetworkRecord,
	accountsWrapper: AccountsWrapper // Receive accountsWrapper
): Promise<void> {
	const start = performance.now();
	console.log(`[${network.networkName}] --- Running Core Indexing Logic ---`);

	// 1. Process Validators and Groups (replaces processValidatorsAndGroups)
	await syncValidatorsAndGroups(kit, dal, network, accountsWrapper); // Pass accountsWrapper

	// 2. Get Validator RPC URLs (replaces getRPCList and subsequent loop)
	// We'll fetch metadata URLs and update the rpcUrl field in the Validator table
	await updateValidatorMetadataUrls(kit, dal, network, accountsWrapper); // Pass accountsWrapper

	// 3. Monitor Elected Validators' RPCs (replaces monitorRPCsAndUpdate)
	await monitorElectedValidators(kit, dal, network, accountsWrapper); // Pass accountsWrapper

	const duration = performance.now() - start;
	console.log(
		`[${
			network.networkName
		}] --- Finished Core Indexing Logic (${duration.toFixed(0)}ms) ---`
	);
}

// --- Helper Functions for Indexing Logic ---

async function syncValidatorsAndGroups(
	kit: ContractKit,
	dal: IDataAccessLayer,
	network: NetworkRecord,
	accountsWrapper: AccountsWrapper // Receive accountsWrapper
): Promise<void> {
	console.log(`[${network.networkName}] Syncing validators and groups...`);
	const validatorsWrapper: ValidatorsWrapper =
		await kit.contracts.getValidators();
	// accountsWrapper is now passed in
	const currentBlock = await kit.web3.eth.getBlockNumber();

	// --- Sync Groups ---
	const registeredGroupAddresses =
		await validatorsWrapper.getRegisteredValidatorGroupsAddresses(); // Get addresses first
	const dbGroups = await dal.getAllValidatorGroups(network.id);
	const groupsToInsert: ValidatorGroupInput[] = [];
	const groupAddressToDbId: { [address: string]: number } = {};

	for (const groupAddress of registeredGroupAddresses) {
		const groupInfo: ValidatorGroup =
			await validatorsWrapper.getValidatorGroup(groupAddress, false); // Fetch details for each group
		const dbGroup = dbGroups.find((dg) => dg.address === groupInfo.address);
		const groupName = groupInfo.name; // Assume name is available directly

		if (!dbGroup) {
			groupsToInsert.push({
				networkId: network.id,
				address: groupInfo.address,
				name: groupName,
			});
		} else {
			groupAddressToDbId[groupInfo.address] = dbGroup.id;
			if (groupName !== dbGroup.name) {
				console.log(
					`[${network.networkName}] Updating group name for ${groupInfo.address} from ${dbGroup.name} to ${groupName}`
				);
				await dal.updateValidatorGroupName(dbGroup.id, groupName);
			}
		}
	}
	if (groupsToInsert.length > 0) {
		await dal.bulkInsertValidatorGroups(groupsToInsert);
		// Re-fetch groups to get IDs for newly inserted ones
		const newDbGroups = await dal.getAllValidatorGroups(network.id);
		newDbGroups.forEach((g) => {
			groupAddressToDbId[g.address] = g.id;
		});
	}

	// --- Sync Validators ---
	// Get *all* registered validators, not just elected, to ensure DB is complete
	const registeredValidatorAddresses =
		await validatorsWrapper.getRegisteredValidatorsAddresses(); // Get addresses first
	const dbValidators = await dal.getAllValidators(network.id);
	const validatorsToInsert: ValidatorInput[] = [];
	const validatorAddressToDbId: { [address: string]: number } = {};

	for (const validatorAddress of registeredValidatorAddresses) {
		const dbValidator = dbValidators.find(
			(dv) => dv.address === validatorAddress
		);
		if (dbValidator) {
			// Check if dbValidator exists before accessing id
			validatorAddressToDbId[validatorAddress] = dbValidator.id; // Store ID if exists
		}
		if (!dbValidator) {
			validatorsToInsert.push({
				networkId: network.id,
				address: validatorAddress,
				rpcUrl: null,
			}); // rpcUrl updated later
		}
		// Name updates handled separately
	}
	if (validatorsToInsert.length > 0) {
		await dal.bulkInsertValidators(validatorsToInsert);
		// Re-fetch validators to get IDs
		const newDbValidators = await dal.getAllValidators(network.id);
		newDbValidators.forEach((v) => {
			validatorAddressToDbId[v.address] = v.id;
		});
	}

	// --- Sync Validator Names (Simplified - just insert current name if missing) ---
	for (const validatorAddress of registeredValidatorAddresses) {
		const validatorId = validatorAddressToDbId[validatorAddress];
		if (!validatorId) continue; // Skip if validator wasn't found/inserted

		const currentNameRecord = await dal.getValidatorNameAtBlock(
			network.id,
			validatorId,
			currentBlock
		);
		let currentName: string | undefined;
		try {
			// Fetch name using accounts wrapper
			currentName = await accountsWrapper.getName(validatorAddress);
		} catch (e) {
			console.error(
				`[${network.networkName}] Error fetching name for validator ${validatorAddress}: ${e}`
			);
		}

		if (
			currentName &&
			(!currentNameRecord ||
				currentNameRecord.validatorName !== currentName)
		) {
			console.log(
				`[${network.networkName}] Updating name for validator ${validatorAddress} to ${currentName} at block ${currentBlock}`
			);
			const nameInput: ValidatorNameInput = {
				networkId: network.id,
				validatorId: validatorId,
				validatorName: currentName,
				fromBlock: currentBlock, // Use current block as start
				toBlock: null, // Mark as current
			};
			await dal.insertValidatorName(nameInput); // This handles closing previous record
		}
	}

	// --- Sync Group Membership (Simplified - just insert current membership if missing) ---
	const currentEpoch = await validatorsWrapper.getEpochNumberOfBlock(
		currentBlock
	); // Removed .toNumber()
	for (const groupAddress of registeredGroupAddresses) {
		const groupId = groupAddressToDbId[groupAddress];
		if (!groupId) continue;

		const groupInfo = await validatorsWrapper.getValidatorGroup(
			groupAddress,
			true
		); // Fetch group with members
		const members = groupInfo.members; // Access members from the fetched group info

		for (const memberAddress of members) {
			const validatorId = validatorAddressToDbId[memberAddress];
			if (!validatorId) continue;

			const currentMembership =
				await dal.getValidatorGroupMembershipAtEpoch(
					network.id,
					validatorId,
					currentEpoch
				);

			if (
				!currentMembership ||
				currentMembership.validatorGroupId !== groupId
			) {
				console.log(
					`[${network.networkName}] Updating membership for validator ${memberAddress} to group ${groupAddress} at epoch ${currentEpoch}`
				);
				const membershipInput: ValidatorGroupValidatorInput = {
					// Correct type usage
					networkId: network.id,
					validatorId: validatorId,
					validatorGroupId: groupId,
					fromEpoch: currentEpoch, // Use current epoch as start
					toEpoch: null, // Mark as current
				};
				await dal.insertValidatorGroupMembership(membershipInput); // Handles closing previous record
			}
		}
	}

	console.log(
		`[${network.networkName}] Finished syncing validators and groups.`
	);
}

async function updateValidatorMetadataUrls(
	kit: ContractKit,
	dal: IDataAccessLayer,
	network: NetworkRecord,
	accountsWrapper: AccountsWrapper // Receive accountsWrapper
): Promise<void> {
	console.log(
		`[${network.networkName}] Fetching and updating validator metadata URLs...`
	);
	// accountsWrapper is now passed in
	const dbValidators = await dal.getAllValidators(network.id);
	const updates: Promise<void>[] = [];

	for (const validator of dbValidators) {
		try {
			const metadataURL = await accountsWrapper.getMetadataURL(
				validator.address
			);
			// Assuming the metadata URL *is* the RPC URL based on original logic's use of `celocli network:rpc-urls`
			const rpcUrl = metadataURL || null; // Use null if empty string
			if (validator.rpcUrl !== rpcUrl) {
				console.log(
					`[${network.networkName}] Updating RPC URL for ${validator.address} to ${rpcUrl}`
				);
				updates.push(dal.updateValidatorRpcUrl(validator.id, rpcUrl));
			}
		} catch (error: any) {
			console.error(
				`[${network.networkName}] Error fetching metadata URL for ${validator.address}: ${error.message}`
			);
			// Optionally set rpcUrl to null if fetch fails
			if (validator.rpcUrl !== null) {
				updates.push(dal.updateValidatorRpcUrl(validator.id, null));
			}
		}
	}
	await Promise.all(updates);
	console.log(
		`[${network.networkName}] Finished updating validator metadata URLs.`
	);
}

async function monitorElectedValidators(
	kit: ContractKit,
	dal: IDataAccessLayer,
	network: NetworkRecord,
	accountsWrapper: AccountsWrapper // Receive accountsWrapper
): Promise<void> {
	console.log(
		`[${network.networkName}] Starting RPC monitoring for elected validators...`
	);
	const electionWrapper: ElectionWrapper = await kit.contracts.getElection();

	// Get current elected validator signers
	const signerAddresses = await electionWrapper.getCurrentValidatorSigners();
	if (!signerAddresses || signerAddresses.length === 0) {
		console.log(`[${network.networkName}] No elected validators found.`);
		return;
	}

	// Convert signers to validator addresses (accounts)
	// accountsWrapper is now passed in
	const validatorAddresses = await Promise.all(
		signerAddresses.map((signer) => accountsWrapper.signerToAccount(signer))
	);

	// Get the corresponding validator records from DB
	const dbValidators = await dal.getValidatorsByAddresses(
		network.id,
		validatorAddresses
	);
	// const electedValidatorsMap = new Map(dbValidators.map(v => [v.address, v])); // Removed unused map

	const measurementId = crypto.randomUUID(); // Use standard crypto API
	const executedAt = new Date();
	const measurementPromises: Promise<RPCMeasurementInput | null>[] = [];

	console.log(
		`[${network.networkName}] Checking ${dbValidators.length} elected validators...`
	);

	for (const validator of dbValidators) {
		if (!validator.rpcUrl) {
			console.warn(
				`[${network.networkName}] Validator ${validator.address} has no RPC URL set. Marking as down.`
			);
			measurementPromises.push(
				Promise.resolve({
					networkId: network.id,
					validatorId: validator.id,
					rpcMeasurementHeaderId: 0, // Placeholder, will be set after header insert
					up: 0, // false
					blockNumber: null,
					statusCode: null,
					responseTimeMs: null,
				})
			);
			continue;
		}

		measurementPromises.push(
			checkRPCEndpoint(validator.rpcUrl).then((result) => ({
				networkId: network.id,
				validatorId: validator.id,
				rpcMeasurementHeaderId: 0, // Placeholder
				up: result.up ? 1 : 0,
				blockNumber: result.blockNumber ?? null,
				statusCode: result.statusCode ?? null,
				responseTimeMs: result.responseTimeMs ?? null,
			}))
		);
	}

	const measurementResults = (
		await Promise.all(measurementPromises)
	).filter((m) => m !== null) as RPCMeasurementInput[];

	if (measurementResults.length === 0) {
		console.log(
			`[${network.networkName}] No measurement results obtained.`
		);
		return;
	}

	// Insert Header first to get ID
	const headerInput: RPCMeasurementHeaderInput = {
		networkId: network.id,
		measurementId: measurementId,
		executedAt: executedAt.toISOString(),
	};
	const headerResult = await dal.insertMeasurementHeader(headerInput);
	if (!headerResult) {
		console.error(
			`[${network.networkName}] Failed to insert measurement header, aborting measurement save.`
		);
		return;
	}
	const measurementHeaderId = headerResult.id;

	// Update measurements with the actual header ID
	measurementResults.forEach((m) => {
		m.rpcMeasurementHeaderId = measurementHeaderId;
	});

	// Prepare ValidatorRPC records
	const validatorRpcRecords: ValidatorRPCInput[] = dbValidators
		.filter((v) => v.rpcUrl) // Only include validators that had an RPC URL
		.map((v) => ({
			networkId: network.id,
			validatorId: v.id,
			rpcMeasurementHeaderId: measurementHeaderId,
			rpcUrl: v.rpcUrl!, // Assert non-null as we filtered
		}));

	// Batch insert measurements and validator RPC records
	// Note: D1 batch doesn't guarantee atomicity across different statements like a transaction.
	// If one batch fails, the other might still succeed. More robust error handling might be needed.
	try {
		const batchPromises: Promise<any>[] = [];
		if (measurementResults.length > 0) {
			batchPromises.push(dal.bulkInsertMeasurements(measurementResults));
		}
		// Insert ValidatorRPC records individually for now, as batch insert isn't strictly necessary here
		// and avoids potential issues if bulkInsertMeasurements fails partially.
		// Alternatively, create a separate batch for ValidatorRPC inserts if performance is critical.
		if (validatorRpcRecords.length > 0) {
			validatorRpcRecords.forEach((record) => {
				batchPromises.push(dal.insertValidatorRPCRecord(record));
			});
		}

		await Promise.all(batchPromises);
		console.log(
			`[${network.networkName}] Saved ${measurementResults.length} measurements and ${validatorRpcRecords.length} validator RPC records for header ID ${measurementHeaderId}.`
		);
	} catch (error: any) {
		console.error(
			`[${network.networkName}] Error saving measurements or validator RPC records for header ID ${measurementHeaderId}:`,
			error
		);
		// Consider cleanup or retry logic here if needed
	}
}