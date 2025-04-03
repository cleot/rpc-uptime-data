import type {
	ApiRPCMeasurement,
	ApiValidator,
	ApiRPCMeasurementExport,
	ApiValidatorMeasurement,
} from '@rpc-uptime/shared-types';

// Define basic types for database entities (can be expanded later)
// These often mirror the table structure but might omit certain fields like IDs for insertion
export interface NetworkRecord {
	id: number;
	networkName: string;
}

export interface ValidatorRecord {
	id: number;
	networkId: number;
	address: string;
	rpcUrl: string | null;
}

export interface ValidatorNameRecord {
	id: number;
	networkId: number;
	validatorId: number;
	validatorName: string;
	fromBlock: number;
	toBlock: number | null;
}

export interface ValidatorGroupRecord {
	id: number;
	networkId: number;
	address: string;
	name: string | null;
}

export interface ValidatorGroupValidatorRecord {
	id: number;
	networkId: number;
	validatorId: number;
	validatorGroupId: number;
	fromEpoch: number;
	toEpoch: number | null;
}

export interface RPCMeasurementHeaderRecord {
	id: number;
	networkId: number;
	measurementId: string; // UUID
	executedAt: string; // ISO 8601 string
}

export interface RPCMeasurementRecord {
	id: number;
	networkId: number;
	validatorId: number;
	rpcMeasurementHeaderId: number;
	up: number; // 0 or 1
	blockNumber: number | null;
	statusCode: number | null;
	responseTimeMs: number | null;
}

export interface ValidatorRPCRecord {
	id: number;
	networkId: number;
	validatorId: number;
	rpcMeasurementHeaderId: number;
	rpcUrl: string;
}

// Input types (omit ID for creation)
export type NetworkInput = Omit<NetworkRecord, 'id'>;
export type ValidatorInput = Omit<ValidatorRecord, 'id'>;
export type ValidatorNameInput = Omit<ValidatorNameRecord, 'id'>;
export type ValidatorGroupInput = Omit<ValidatorGroupRecord, 'id'>;
export type ValidatorGroupValidatorInput = Omit<ValidatorGroupValidatorRecord, 'id'>;
export type RPCMeasurementHeaderInput = Omit<RPCMeasurementHeaderRecord, 'id'>;
export type RPCMeasurementInput = Omit<RPCMeasurementRecord, 'id'>;
export type ValidatorRPCInput = Omit<ValidatorRPCRecord, 'id'>;


// Filter types for querying measurements
export interface MeasurementFilter {
	networkName: string;
	fromEpochSeconds?: number;
	toEpochSeconds?: number;
	validatorAddresses?: string[];
}

// Interface for the Data Access Layer
export interface IDataAccessLayer {
	// Network operations
	getNetworkByName(networkName: string): Promise<NetworkRecord | null>;
	getOrInsertNetwork(networkName: string): Promise<NetworkRecord>;

	// Validator operations
	getValidatorByAddress(networkId: number, address: string): Promise<ValidatorRecord | null>;
	getValidatorsByAddresses(networkId: number, addresses: string[]): Promise<ValidatorRecord[]>;
	getAllValidators(networkId: number): Promise<ValidatorRecord[]>;
	insertValidator(validator: ValidatorInput): Promise<{ id: number } | null>;
	bulkInsertValidators(validators: ValidatorInput[]): Promise<void>; // D1 batch might not return IDs easily
	updateValidatorRpcUrl(validatorId: number, rpcUrl: string | null): Promise<void>;

	// Validator Name operations
	getValidatorNameAtBlock(networkId: number, validatorId: number, blockNumber: number): Promise<ValidatorNameRecord | null>;
	insertValidatorName(name: ValidatorNameInput): Promise<{ id: number } | null>;
	// TODO: Add logic to update 'toBlock' for previous names if needed

	// Validator Group operations
	getValidatorGroupByName(networkId: number, name: string): Promise<ValidatorGroupRecord | null>;
	getValidatorGroupByAddress(networkId: number, address: string): Promise<ValidatorGroupRecord | null>;
	getAllValidatorGroups(networkId: number): Promise<ValidatorGroupRecord[]>;
	insertValidatorGroup(group: ValidatorGroupInput): Promise<{ id: number } | null>;
	bulkInsertValidatorGroups(groups: ValidatorGroupInput[]): Promise<void>;
	updateValidatorGroupName(groupId: number, name: string | null): Promise<void>;

	// Validator Group Membership operations
	getValidatorGroupMembershipAtEpoch(networkId: number, validatorId: number, epoch: number): Promise<ValidatorGroupValidatorRecord | null>;
	insertValidatorGroupMembership(membership: ValidatorGroupValidatorInput): Promise<{ id: number } | null>;
	// TODO: Add logic to update 'toEpoch' for previous memberships if needed

	// Measurement operations
	insertMeasurementHeader(header: RPCMeasurementHeaderInput): Promise<{ id: number } | null>;
	insertValidatorRPCRecord(record: ValidatorRPCInput): Promise<{ id: number } | null>;
	bulkInsertMeasurements(measurements: RPCMeasurementInput[]): Promise<void>; // Use batch
	getMeasurements(filter: MeasurementFilter): Promise<ApiRPCMeasurement[]>; // Complex query, needs implementation
	getMeasurementsForExport(filter: MeasurementFilter): Promise<ApiRPCMeasurementExport[]>; // Complex query, needs implementation

	// Potentially add methods for getting validator mappings (similar to original getRPCValidatorMappingsByIDs)
	getValidatorDetails(networkId: number, validatorIds: number[]): Promise<ApiValidator[]>; // Needs implementation combining tables
}