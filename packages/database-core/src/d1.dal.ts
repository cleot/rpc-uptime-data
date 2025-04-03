import type { D1Database } from '@cloudflare/workers-types'; // Removed unused D1Result
import type {
	ApiRPCMeasurement,
	ApiRPCMeasurementExport,
	ApiValidator,
	ApiValidatorMeasurement, // Added missing import
} from '@rpc-uptime/shared-types'; // Corrected import path
import type {
	IDataAccessLayer,
	MeasurementFilter,
	NetworkInput,
	NetworkRecord,
	RPCMeasurementHeaderInput,
	RPCMeasurementInput,
	ValidatorGroupInput,
	ValidatorGroupValidatorInput,
	ValidatorInput,
	ValidatorNameInput,
	ValidatorRPCInput,
	ValidatorRecord, // Keep for future use
	ValidatorNameRecord, // Added missing imports
	ValidatorGroupRecord,
	ValidatorGroupValidatorRecord,
	RPCMeasurementHeaderRecord,
	RPCMeasurementRecord,
	ValidatorRPCRecord,
} from './dal.interface'; // Keep local interface/record types here

// Helper function to handle potential null results from D1 first()
function checkResult<T>(result: T | null, errorMessage: string): T {
	if (result === null) {
		throw new Error(errorMessage);
	}
	return result;
}

export class D1DataAccessLayer implements IDataAccessLayer {
	private db: D1Database;

	constructor(db: D1Database) {
		if (!db) {
			throw new Error("D1Database binding is required.");
		}
		this.db = db;
	}

	// --- Network operations ---

	async getNetworkByName(networkName: string): Promise<NetworkRecord | null> {
		const stmt = this.db.prepare('SELECT * FROM Network WHERE networkName = ?');
		const result = await stmt.bind(networkName).first<NetworkRecord>();
		return result;
	}

	async getOrInsertNetwork(networkName: string): Promise<NetworkRecord> {
		let network = await this.getNetworkByName(networkName);
		if (!network) {
			console.log(`Network ${networkName} not found, creating...`);
			const insertStmt = this.db.prepare('INSERT INTO Network (networkName) VALUES (?) RETURNING *');
			const result = await insertStmt.bind(networkName).first<NetworkRecord>();
			network = checkResult(result, `Failed to insert network: ${networkName}`);
			console.log(`Network ${networkName} created with ID: ${network.id}`);
		}
		return network;
	}

	// --- Validator operations ---
	async getValidatorByAddress(networkId: number, address: string): Promise<ValidatorRecord | null> {
		const stmt = this.db.prepare('SELECT * FROM Validator WHERE networkId = ? AND address = ?');
		return await stmt.bind(networkId, address).first<ValidatorRecord>();
	}

	async getValidatorsByAddresses(networkId: number, addresses: string[]): Promise<ValidatorRecord[]> {
		if (addresses.length === 0) return [];
		const placeholders = addresses.map(() => '?').join(',');
		const stmt = this.db.prepare(`SELECT * FROM Validator WHERE networkId = ? AND address IN (${placeholders})`);
		const result = await stmt.bind(networkId, ...addresses).all<ValidatorRecord>();
		return result.results ?? [];
	}

	async getAllValidators(networkId: number): Promise<ValidatorRecord[]> {
		const stmt = this.db.prepare('SELECT * FROM Validator WHERE networkId = ?');
		const result = await stmt.bind(networkId).all<ValidatorRecord>();
		return result.results ?? [];
	}

	async insertValidator(validator: ValidatorInput): Promise<{ id: number; } | null> {
		const stmt = this.db.prepare('INSERT INTO Validator (networkId, address, rpcUrl) VALUES (?, ?, ?) RETURNING id');
		try {
			const result = await stmt.bind(validator.networkId, validator.address, validator.rpcUrl).first<{ id: number }>();
			return checkResult(result, `Failed to insert validator: ${validator.address}`);
		} catch (e: any) {
			// Handle potential unique constraint violation gracefully
			if (e.message?.includes('UNIQUE constraint failed')) {
				console.warn(`Validator already exists: networkId=${validator.networkId}, address=${validator.address}`);
				return null; // Indicate it already exists or couldn't be inserted
			}
			throw e; // Re-throw other errors
		}
	}

	async bulkInsertValidators(validators: ValidatorInput[]): Promise<void> {
		if (validators.length === 0) return;
		// D1 batch insert: Prepare one statement and run it multiple times with different bindings
		const stmt = this.db.prepare('INSERT OR IGNORE INTO Validator (networkId, address, rpcUrl) VALUES (?, ?, ?)');
		const batch = validators.map(v => stmt.bind(v.networkId, v.address, v.rpcUrl));
		await this.db.batch(batch);
		console.log(`Attempted to bulk insert/ignore ${validators.length} validators.`);
	}

	async updateValidatorRpcUrl(validatorId: number, rpcUrl: string | null): Promise<void> {
		const stmt = this.db.prepare('UPDATE Validator SET rpcUrl = ? WHERE id = ?');
		await stmt.bind(rpcUrl, validatorId).run();
	}

	// --- Validator Name operations ---
	async getValidatorNameAtBlock(networkId: number, validatorId: number, blockNumber: number): Promise<ValidatorNameRecord | null> {
		const stmt = this.db.prepare(`
			SELECT * FROM ValidatorName
			WHERE networkId = ?
			  AND validatorId = ?
			  AND fromBlock <= ?
			  AND (toBlock IS NULL OR toBlock > ?)
			ORDER BY fromBlock DESC
			LIMIT 1
		`);
		return await stmt.bind(networkId, validatorId, blockNumber, blockNumber).first<ValidatorNameRecord>();
	}

	async insertValidatorName(name: ValidatorNameInput): Promise<{ id: number } | null> {
		// Step 1: Check if an identical record already exists for this block range start
		// This prevents inserting duplicate names if the indexer reruns the same block
		const existingStmt = this.db.prepare(`
			SELECT id FROM ValidatorName
			WHERE networkId = ? AND validatorId = ? AND fromBlock = ? AND validatorName = ?
		`);
		const existing = await existingStmt.bind(name.networkId, name.validatorId, name.fromBlock, name.validatorName).first<{ id: number }>();
		if (existing) {
			console.warn(`ValidatorName record already exists for validator ${name.validatorId} at block ${name.fromBlock} with the same name.`);
			return existing; // Return existing ID
		}

		// Step 2: Update the 'toBlock' of the previous record for this validator, if it exists and overlaps
		// This ensures history continuity: the old name record ends where the new one begins.
		const updatePreviousStmt = this.db.prepare(`
			UPDATE ValidatorName
			SET toBlock = ?
			WHERE networkId = ?
			  AND validatorId = ?
			  AND toBlock IS NULL
			  AND fromBlock < ?
		`);
		// Only run update if the new record isn't the very first one for this validator
		// (i.e., if fromBlock > 0 or some known genesis block)
		// We bind name.fromBlock as the new toBlock for the previous record.
		await updatePreviousStmt.bind(name.fromBlock, name.networkId, name.validatorId, name.fromBlock).run();

		// Step 3: Insert the new record
		const insertStmt = this.db.prepare(`
			INSERT INTO ValidatorName (networkId, validatorId, validatorName, fromBlock, toBlock)
			VALUES (?, ?, ?, ?, ?)
			RETURNING id
		`);
		try {
			const result = await insertStmt.bind(
				name.networkId,
				name.validatorId,
				name.validatorName,
				name.fromBlock,
				name.toBlock // Usually null when inserting the current name
			).first<{ id: number }>();
			return checkResult(result, `Failed to insert validator name for validator ${name.validatorId} at block ${name.fromBlock}`);
		} catch (e: any) {
			// Handle potential unique constraint violation (e.g., race condition or logic error)
			if (e.message?.includes('UNIQUE constraint failed')) {
				console.error(`Failed to insert ValidatorName due to UNIQUE constraint: networkId=${name.networkId}, validatorId=${name.validatorId}, fromBlock=${name.fromBlock}`);
				// Optionally, try fetching the record again in case of a race condition
				return null;
			}
			throw e; // Re-throw other errors
		}
	}

	// --- Validator Group operations ---
	async getValidatorGroupByName(networkId: number, name: string): Promise<ValidatorGroupRecord | null> {
		const stmt = this.db.prepare('SELECT * FROM ValidatorGroup WHERE networkId = ? AND name = ?');
		return await stmt.bind(networkId, name).first<ValidatorGroupRecord>();
	}

	async getValidatorGroupByAddress(networkId: number, address: string): Promise<ValidatorGroupRecord | null> {
		const stmt = this.db.prepare('SELECT * FROM ValidatorGroup WHERE networkId = ? AND address = ?');
		return await stmt.bind(networkId, address).first<ValidatorGroupRecord>();
	}

	async getAllValidatorGroups(networkId: number): Promise<ValidatorGroupRecord[]> {
		const stmt = this.db.prepare('SELECT * FROM ValidatorGroup WHERE networkId = ?');
		const result = await stmt.bind(networkId).all<ValidatorGroupRecord>();
		return result.results ?? [];
	}

	async insertValidatorGroup(group: ValidatorGroupInput): Promise<{ id: number } | null> {
		const stmt = this.db.prepare('INSERT INTO ValidatorGroup (networkId, address, name) VALUES (?, ?, ?) RETURNING id');
		try {
			const result = await stmt.bind(group.networkId, group.address, group.name).first<{ id: number }>();
			return checkResult(result, `Failed to insert validator group: ${group.address}`);
		} catch (e: any) {
			if (e.message?.includes('UNIQUE constraint failed')) {
				console.warn(`ValidatorGroup already exists: networkId=${group.networkId}, address=${group.address}`);
				// If it already exists due to constraint, try fetching it to return the ID
				const existing = await this.getValidatorGroupByAddress(group.networkId, group.address);
				return existing ? { id: existing.id } : null;
			}
			throw e;
		}
	}

	async bulkInsertValidatorGroups(groups: ValidatorGroupInput[]): Promise<void> {
		if (groups.length === 0) return;
		const stmt = this.db.prepare('INSERT OR IGNORE INTO ValidatorGroup (networkId, address, name) VALUES (?, ?, ?)');
		const batch = groups.map(g => stmt.bind(g.networkId, g.address, g.name));
		await this.db.batch(batch);
		console.log(`Attempted to bulk insert/ignore ${groups.length} validator groups.`);
	}

	async updateValidatorGroupName(groupId: number, name: string | null): Promise<void> {
		const stmt = this.db.prepare('UPDATE ValidatorGroup SET name = ? WHERE id = ?');
		await stmt.bind(name, groupId).run();
	}

	// --- Validator Group Membership operations ---
	async getValidatorGroupMembershipAtEpoch(networkId: number, validatorId: number, epoch: number): Promise<ValidatorGroupValidatorRecord | null> {
		const stmt = this.db.prepare(`
			SELECT * FROM ValidatorGroupValidator
			WHERE networkId = ?
			  AND validatorId = ?
			  AND fromEpoch <= ?
			  AND (toEpoch IS NULL OR toEpoch > ?)
			ORDER BY fromEpoch DESC
			LIMIT 1
		`);
		return await stmt.bind(networkId, validatorId, epoch, epoch).first<ValidatorGroupValidatorRecord>();
	}

	async insertValidatorGroupMembership(membership: ValidatorGroupValidatorInput): Promise<{ id: number } | null> {
		// Step 1: Check for existing identical record
		const existingStmt = this.db.prepare(`
			SELECT id FROM ValidatorGroupValidator
			WHERE networkId = ? AND validatorId = ? AND validatorGroupId = ? AND fromEpoch = ?
		`);
		const existing = await existingStmt.bind(
			membership.networkId,
			membership.validatorId,
			membership.validatorGroupId,
			membership.fromEpoch
		).first<{ id: number }>();
		if (existing) {
			console.warn(`ValidatorGroupValidator record already exists for validator ${membership.validatorId}, group ${membership.validatorGroupId} at epoch ${membership.fromEpoch}.`);
			return existing;
		}

		// Step 2: Update previous membership record's 'toEpoch'
		const updatePreviousStmt = this.db.prepare(`
			UPDATE ValidatorGroupValidator
			SET toEpoch = ?
			WHERE networkId = ?
			  AND validatorId = ?
			  AND toEpoch IS NULL
			  AND fromEpoch < ?
		`);
		await updatePreviousStmt.bind(membership.fromEpoch, membership.networkId, membership.validatorId, membership.fromEpoch).run();

		// Step 3: Insert the new membership record
		const insertStmt = this.db.prepare(`
			INSERT INTO ValidatorGroupValidator (networkId, validatorId, validatorGroupId, fromEpoch, toEpoch)
			VALUES (?, ?, ?, ?, ?)
			RETURNING id
		`);
		try {
			const result = await insertStmt.bind(
				membership.networkId,
				membership.validatorId,
				membership.validatorGroupId,
				membership.fromEpoch,
				membership.toEpoch // Usually null for current membership
			).first<{ id: number }>();
			return checkResult(result, `Failed to insert group membership for validator ${membership.validatorId}, group ${membership.validatorGroupId} at epoch ${membership.fromEpoch}`);
		} catch (e: any) {
			if (e.message?.includes('UNIQUE constraint failed')) {
				console.error(`Failed to insert ValidatorGroupValidator due to UNIQUE constraint: networkId=${membership.networkId}, validatorId=${membership.validatorId}, groupId=${membership.validatorGroupId}, fromEpoch=${membership.fromEpoch}`);
				return null;
			}
			throw e;
		}
	}

	// --- Measurement operations ---
	async insertMeasurementHeader(header: RPCMeasurementHeaderInput): Promise<{ id: number } | null> {
		const stmt = this.db.prepare('INSERT INTO RPCMeasurementHeader (networkId, measurementId, executedAt) VALUES (?, ?, ?) RETURNING id');
		try {
			// Ensure executedAt is in ISO 8601 format string
			const executedAtString = typeof header.executedAt === 'string' ? header.executedAt : new Date(header.executedAt).toISOString();
			const result = await stmt.bind(header.networkId, header.measurementId, executedAtString).first<{ id: number }>();
			return checkResult(result, `Failed to insert measurement header: ${header.measurementId}`);
		} catch (e: any) {
			if (e.message?.includes('UNIQUE constraint failed')) {
				console.error(`Measurement header already exists: ${header.measurementId}`);
				return null;
			}
			throw e;
		}
	}

	async insertValidatorRPCRecord(record: ValidatorRPCInput): Promise<{ id: number } | null> {
		const stmt = this.db.prepare('INSERT INTO ValidatorRPC (networkId, validatorId, rpcMeasurementHeaderId, rpcUrl) VALUES (?, ?, ?, ?) RETURNING id');
		try {
			const result = await stmt.bind(
				record.networkId,
				record.validatorId,
				record.rpcMeasurementHeaderId,
				record.rpcUrl
			).first<{ id: number }>();
			return checkResult(result, `Failed to insert validator RPC record for header ${record.rpcMeasurementHeaderId}, validator ${record.validatorId}`);
		} catch (e: any) {
			// Assuming no unique constraint here unless specifically needed
			console.error(`Error inserting ValidatorRPC record: ${e.message}`);
			throw e;
		}
	}

	async bulkInsertMeasurements(measurements: RPCMeasurementInput[]): Promise<void> {
		if (measurements.length === 0) return;
		const stmt = this.db.prepare(`
			INSERT INTO RPCMeasurement (networkId, validatorId, rpcMeasurementHeaderId, up, blockNumber, statusCode, responseTimeMs)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`);
		const batch = measurements.map(m => stmt.bind(
			m.networkId,
			m.validatorId,
			m.rpcMeasurementHeaderId,
			m.up, // Should be 0 or 1
			m.blockNumber,
			m.statusCode,
			m.responseTimeMs
		));
		await this.db.batch(batch);
		console.log(`Attempted to bulk insert ${measurements.length} measurements.`);
	}

	// --- Complex Queries / Mappings ---
	async getMeasurements(filter: MeasurementFilter): Promise<ApiRPCMeasurement[]> {
		const network = await this.getOrInsertNetwork(filter.networkName);
		if (!network) {
			throw new Error(`Network not found: ${filter.networkName}`);
		}

		let validatorIds: number[] | null = null;
		if (filter.validatorAddresses && filter.validatorAddresses.length > 0) {
			const validators = await this.getValidatorsByAddresses(network.id, filter.validatorAddresses);
			validatorIds = validators.map(v => v.id);
			if (validatorIds.length === 0) {
				return []; // No matching validators found
			}
		}

		// Base query joining measurements, headers, and validators
		let query = `
			SELECT
				h.measurementId,
				h.executedAt,
				m.up,
				m.blockNumber,
				m.responseTimeMs,
				m.statusCode,
				v.address as validatorAddress
			FROM RPCMeasurement m
			JOIN RPCMeasurementHeader h ON m.rpcMeasurementHeaderId = h.id
			JOIN Validator v ON m.validatorId = v.id
			WHERE m.networkId = ?
		`;
		const params: (string | number)[] = [network.id];

		// Add time range filter
		if (filter.fromEpochSeconds) {
			query += ` AND h.executedAt >= ?`;
			params.push(new Date(filter.fromEpochSeconds * 1000).toISOString());
		}
		if (filter.toEpochSeconds) {
			query += ` AND h.executedAt <= ?`;
			params.push(new Date(filter.toEpochSeconds * 1000).toISOString());
		}

		// Add validator filter if applicable
		if (validatorIds) {
			const placeholders = validatorIds.map(() => '?').join(',');
			query += ` AND m.validatorId IN (${placeholders})`;
			params.push(...validatorIds);
		}

		query += ` ORDER BY h.executedAt ASC, v.address ASC`; // Consistent ordering

		const stmt = this.db.prepare(query);
		const rawResults = await stmt.bind(...params).all<{
			measurementId: string;
			executedAt: string; // ISO string from DB
			up: number;
			blockNumber: number | null;
			responseTimeMs: number | null;
			statusCode: number | null;
			validatorAddress: string;
		}>();

		if (!rawResults.results || rawResults.results.length === 0) {
			return [];
		}

		// Group results by measurementId in TypeScript
		const grouped = new Map<string, ApiRPCMeasurement>();

		for (const row of rawResults.results) {
			let measurementGroup = grouped.get(row.measurementId);

			if (!measurementGroup) {
				measurementGroup = {
					measurementId: row.measurementId,
					executedAt: new Date(row.executedAt), // Convert ISO string back to Date
					validators: [],
				};
				grouped.set(row.measurementId, measurementGroup);
			}

			measurementGroup.validators.push({
				validatorAddress: row.validatorAddress,
				up: !!row.up, // Convert 0/1 back to boolean
				blockNumber: row.blockNumber,
				responseTimeMs: row.responseTimeMs,
				statusCode: row.statusCode,
			});
		}

		return Array.from(grouped.values());
	}

	async getMeasurementsForExport(filter: MeasurementFilter): Promise<ApiRPCMeasurementExport[]> {
		const network = await this.getOrInsertNetwork(filter.networkName);
		if (!network) {
			throw new Error(`Network not found: ${filter.networkName}`);
		}

		let validatorIds: number[] | null = null;
		if (filter.validatorAddresses && filter.validatorAddresses.length > 0) {
			const validators = await this.getValidatorsByAddresses(network.id, filter.validatorAddresses);
			validatorIds = validators.map(v => v.id);
			if (validatorIds.length === 0) {
				return []; // No matching validators found
			}
		}

		// Base query joining measurements, headers, and validators
		let query = `
			SELECT
				h.measurementId,
				h.executedAt,
				m.up,
				m.blockNumber,
				m.responseTimeMs,
				m.statusCode,
				v.address as validatorAddress
			FROM RPCMeasurement m
			JOIN RPCMeasurementHeader h ON m.rpcMeasurementHeaderId = h.id
			JOIN Validator v ON m.validatorId = v.id
			WHERE m.networkId = ?
		`;
		const params: (string | number)[] = [network.id];

		// Add time range filter
		if (filter.fromEpochSeconds) {
			query += ` AND h.executedAt >= ?`;
			params.push(new Date(filter.fromEpochSeconds * 1000).toISOString());
		}
		if (filter.toEpochSeconds) {
			query += ` AND h.executedAt <= ?`;
			params.push(new Date(filter.toEpochSeconds * 1000).toISOString());
		}

		// Add validator filter if applicable
		if (validatorIds) {
			const placeholders = validatorIds.map(() => '?').join(',');
			query += ` AND m.validatorId IN (${placeholders})`;
			params.push(...validatorIds);
		}

		query += ` ORDER BY h.executedAt ASC, v.address ASC`; // Consistent ordering

		const stmt = this.db.prepare(query);
		const rawResults = await stmt.bind(...params).all<{
			measurementId: string;
			executedAt: string; // ISO string from DB
			up: number;
			blockNumber: number | null;
			responseTimeMs: number | null;
			statusCode: number | null;
			validatorAddress: string;
		}>();

		if (!rawResults.results || rawResults.results.length === 0) {
			return [];
		}

		// Map results directly to the export format
		return rawResults.results.map(row => ({
			measurementId: row.measurementId,
			timestamp: new Date(row.executedAt), // Convert ISO string back to Date
			validatorAddress: row.validatorAddress,
			up: !!row.up, // Convert 0/1 back to boolean
			blockNumber: row.blockNumber,
			responseTimeMs: row.responseTimeMs,
			statusCode: row.statusCode,
		}));
	}

	async getValidatorDetails(networkId: number, validatorIds: number[]): Promise<ApiValidator[]> {
		if (validatorIds.length === 0) {
			return [];
		}

		const placeholders = validatorIds.map(() => '?').join(',');

		// Query combines Validator, current ValidatorName, and current ValidatorGroup membership/name
		// Uses subqueries to get the latest name and group for each validator
		const query = `
			SELECT
				v.address,
				v.rpcUrl,
				(SELECT vn.validatorName
					FROM ValidatorName vn
					WHERE vn.validatorId = v.id AND vn.networkId = v.networkId AND vn.toBlock IS NULL
					ORDER BY vn.fromBlock DESC LIMIT 1
				) as validatorName,
				(SELECT vg.name
					FROM ValidatorGroupValidator vgv
					JOIN ValidatorGroup vg ON vgv.validatorGroupId = vg.id AND vgv.networkId = vg.networkId
					WHERE vgv.validatorId = v.id AND vgv.networkId = v.networkId AND vgv.toEpoch IS NULL
					ORDER BY vgv.fromEpoch DESC LIMIT 1
				) as validatorGroup
			FROM Validator v
			WHERE v.networkId = ? AND v.id IN (${placeholders})
		`;

		const stmt = this.db.prepare(query);
		const rawResults = await stmt.bind(networkId, ...validatorIds).all<{
			address: string;
			rpcUrl: string | null;
			validatorName: string | null;
			validatorGroup: string | null;
		}>();

		return rawResults.results?.map(row => ({
			address: row.address,
			rpcUrl: row.rpcUrl,
			validatorName: row.validatorName,
			validatorGroup: row.validatorGroup,
		})) ?? [];
	}

	// --- Stubs for unimplemented methods ---
	// All methods should now be implemented above

}