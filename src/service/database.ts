import { Sequelize, SequelizeOptions } from "sequelize-typescript";
import { Includeable, Op, Transaction } from "sequelize";
import { BulkCreateOptions } from "sequelize/types";
import {
	Network,
	Validator,
	ValidatorGroup,
	ValidatorName,
	ValidatorGroupValidator,
	RPCMeasurement,
	ValidatorRPC,
	RPCMeasurementHeader,
	MODELS,
} from "../db";
import * as utils from "../utils";
import { IRPCMeasurementFilter } from "src/utils/types";

export {
	Network,
	Validator,
	ValidatorGroup,
	ValidatorName,
	ValidatorGroupValidator,
	RPCMeasurement,
	ValidatorRPC,
	RPCMeasurementHeader,
};
import { createNamespace, Namespace } from "cls-hooked";

if (process.env.NODE_ENV !== "production") {
	require("dotenv").config();
}

let sequelize: Sequelize;
let initializeCount = 0;

const QUERY_LOGGING =
	process.env.QUERY_LOGGING?.toLowerCase() == "true" ? utils.log : false;

export function initialize(): Sequelize {
	const options: SequelizeOptions = {
		host: process.env.DB_HOST,
		dialect: "mysql",
		models: MODELS,
		define: { freezeTableName: true },
		logging: QUERY_LOGGING,
		pool: {
			max: 1000,
			min: 10,
			acquire: 30000,
			idle: 10000,
		},
	};

	const namespace: Namespace = createNamespace("defaultTransactionNamespace");
	Sequelize.useCLS(namespace);

	sequelize = new Sequelize(
		process.env.DB_NAME,
		process.env.DB_USER,
		process.env.DB_PWD,
		options
	);

	initializeCount++;
	utils.log(`Connection initialized ${initializeCount} times`);

	return sequelize;
}

export function initializeMemory(): Sequelize {
	const options: SequelizeOptions = {
		models: MODELS,
		define: { freezeTableName: true },
		logging: QUERY_LOGGING,
	};
	const namespace: Namespace = createNamespace("defaultTransactionNamespace");
	Sequelize.useCLS(namespace);

	sequelize = new Sequelize("sqlite::memory:", options);
	return sequelize;
}

export async function getOrInsertNetwork(
	networkName: string
): Promise<Network> {
	const [networkReturned, created] = await Network.findOrCreate({
		where: { networkName: networkName },
		defaults: {
			networkName: networkName,
		},
	});
	if (created) utils.log(`Network ${networkName} created for first time`);
	const network = networkReturned;
	return network;
}

export async function showAllMySQLTables(): Promise<void> {
	// This query is only relevant for mysql
	const result = await sequelize.query(
		"SELECT DISTINCT TABLE_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='celo_rivera'"
	);
	utils.log(utils.pp(result));
}

export async function syncToDatabase(force = false): Promise<void> {
	await sequelize.sync({ force: force });
	utils.log("Connection has been synchronized successfully");
}

export async function authenticateConnection(): Promise<void> {
	await sequelize.authenticate();
	utils.log("Connection has been established successfully.");
}

export async function dropAllTables(): Promise<void> {
	if (process.env.NODE_ENV?.toLowerCase() === "production") throw "No";
	await sequelize.drop();
	utils.log("All tables dropped");
}

export async function dropMySqlTable(tableName: string): Promise<void> {
	await sequelize.query("DROP TABLE IF EXISTS `" + tableName + "`");
	utils.log(`Successfully dropped table ${tableName}`);
}

export async function getValidatorNameAtBlock(
	networkName: string,
	validatorId: number,
	blockNumber: number,
	scope: string | string[] = "default"
): Promise<ValidatorName> {
	const network = await getOrInsertNetwork(networkName);
	return ValidatorName.scope(scope).findOne({
		where: {
			networkId: network.id,
			validatorId: validatorId,
			fromBlock: { [Op.lte]: blockNumber },
			toBlock: { [Op.or]: [{ [Op.eq]: null }, { [Op.gt]: blockNumber }] },
		},
	});
}

export async function getValidatorGroupValidatorAtEpoch(
	networkName: string,
	validatorId: number,
	epochNumber: number,
	scope: string | string[] = "default"
): Promise<ValidatorGroupValidator> {
	const network = await getOrInsertNetwork(networkName);
	return ValidatorGroupValidator.scope(scope).findOne({
		where: {
			networkId: network.id,
			validatorId: validatorId,
			fromEpoch: { [Op.lte]: epochNumber },
			toEpoch: {
				[Op.or]: [{ [Op.eq]: null }, { [Op.gt]: epochNumber }],
			},
		},
	});
}

export async function getValidatorByAddress(
	networkName: string,
	validatorAddress: string,
	scope: string | string[] = "default"
): Promise<Validator> {
	const network = await getOrInsertNetwork(networkName);
	return Validator.scope(scope).findOne({
		where: { networkId: network.id, address: validatorAddress },
	});
}

export async function getValidatorByAddressList(
	networkName: string,
	validatorAddressList: string[],
	scope: string | string[] = "default"
): Promise<Validator[]> {
	const network = await getOrInsertNetwork(networkName);
	if (!validatorAddressList && validatorAddressList.length < 1) {
		return [];
	}
	let where = {
		networkId: network.id,
		address: { [Op.in]: validatorAddressList },
	};
	return await Validator.scope(scope).findAll({
		where: where,
	});
}

export async function getValidatorGroupByAddress(
	networkName: string,
	validatorGroupAddress: string,
	scope: string | string[] = "default"
): Promise<ValidatorGroup> {
	const network = await getOrInsertNetwork(networkName);
	return ValidatorGroup.scope(scope).findOne({
		where: { networkId: network.id, address: validatorGroupAddress },
	});
}

export async function getValidatorGroupByName(
	networkName: string,
	validatorGroupName: string,
	scope: string | string[] = "default"
): Promise<ValidatorGroup> {
	const network = await getOrInsertNetwork(networkName);
	return ValidatorGroup.scope(scope).findOne({
		where: { networkId: network.id, name: validatorGroupName },
	});
}

export async function getAllValidators(
	networkName: string,
	scope: string | string[] = "default"
): Promise<Validator[]> {
	const network = await getOrInsertNetwork(networkName);
	return Validator.scope(scope).findAll({
		where: { networkId: network.id },
	});
}

export async function getAllValidatorNames(
	networkName: string,
	scope: string | string[] = "default"
): Promise<ValidatorName[]> {
	const network = await getOrInsertNetwork(networkName);
	return ValidatorName.scope(scope).findAll({
		where: { networkId: network.id },
	});
}

const ignoreDuplicates: BulkCreateOptions = { ignoreDuplicates: true };

export async function bulkInsertValidators(
	validators: Validator[]
): Promise<Validator[]> {
	return Validator.bulkCreate(
		validators.map((v) => {
			return v.toJSON();
		}),
		ignoreDuplicates
	);
}
export async function bulkInsertValidatorGroups(
	validatorGroups: ValidatorGroup[]
): Promise<ValidatorGroup[]> {
	return ValidatorGroup.bulkCreate(
		validatorGroups.map((vg) => {
			return vg.toJSON();
		}),
		ignoreDuplicates
	);
}
export async function bulkInsertValidatorGroupValidators(
	validatorGroupValidators: ValidatorGroupValidator[]
): Promise<ValidatorGroupValidator[]> {
	return ValidatorGroupValidator.bulkCreate(
		validatorGroupValidators.map((vgv) => {
			return vgv.toJSON();
		}),
		ignoreDuplicates
	);
}
export async function bulkInsertValidatorNames(
	validatorNames: ValidatorName[]
): Promise<ValidatorName[]> {
	return ValidatorName.bulkCreate(
		validatorNames.map((vn) => {
			return vn.toJSON();
		}),
		ignoreDuplicates
	);
}

export async function closeDatabase(): Promise<void> {
	await sequelize.close();
	utils.log("Closed connection");
}

export async function bulkInsertRPCMeasurement(
	measurements: Partial<RPCMeasurement>[],
	transaction?: Transaction
): Promise<RPCMeasurement[]> {
	return RPCMeasurement.bulkCreate(
		measurements.map((n) => {
			return n.toJSON();
		}),
		{ ignoreDuplicates: true, transaction }
	);
}

export async function getRPCValidatorMappingsByIDs(
	networkName: string,
	validatorIds: number[],
	scope: string | string[] = "default"
): Promise<Validator[]> {
	const network = await getOrInsertNetwork(networkName);

	const arrayScope: string[] = Array.isArray(scope) ? scope : [scope];

	const includeTerms: Includeable[] = [
		{
			model: ValidatorName.scope("light"),
			required: false,
		},
		{
			model: ValidatorGroupValidator.scope([...arrayScope]),
			required: false,
		},
	];
	let where = {
		networkId: network.id,
		id: { [Op.in]: validatorIds },
	};
	const result = await Validator.scope(scope).findAll({
		include: includeTerms,
		where: where,
	});
	return result;
}

export async function getRPCMeasurementByFilter(
	networkName: string,
	filter?: IRPCMeasurementFilter,
	scope: string | string[] = "default"
): Promise<RPCMeasurement[]> {
	if (
		!filter ||
		!filter.fromEpochSeconds ||
		!filter.toEpochSeconds ||
		filter.fromEpochSeconds < utils.defaultEpochSeconds ||
		filter.toEpochSeconds < utils.defaultEpochSeconds ||
		filter.toEpochSeconds < filter.fromEpochSeconds
	) {
		return [];
	}

	const fromDate = new Date(filter.fromEpochSeconds);
	const toDate = new Date(filter.toEpochSeconds);
	const network = await getOrInsertNetwork(networkName);

	let where = {
		networkId: network.id,
	};
	const includeTerms: Includeable[] = [];
	includeTerms.push({
		model: RPCMeasurementHeader.scope("default"),
		where: { executedAt: { [Op.between]: [fromDate, toDate] } },
		paranoid: false,
	});

	if (filter.addressList?.length > 0) {
		if (filter?.addressList?.length > 0) {
			const validators = await getValidatorByAddressList(
				networkName,
				filter.addressList
			);
			const ids = validators.map((s) => s.id.toString());
			includeTerms.push({
				model: Validator.scope("default"),
				where: ids?.length > 0 ? { id: { [Op.in]: ids } } : undefined,
				paranoid: false,
			});
		}
	}

	return await RPCMeasurement.scope(scope).findAll({
		include: includeTerms,
		where: where,
		order: [["rpcMeasurementHeaderId", "ASC"]],
	});
}

export { sequelize };
