import { Sequelize } from "sequelize-typescript";
import * as dbService from "../../service/database";

interface IConnection {
	sequelize: Sequelize;
	network: dbService.Network;
}

export async function services(networkId?: string): Promise<IConnection> {
	const sequelize: Sequelize = dbService.initialize();
	await dbService.authenticateConnection();
	if (!networkId) {
		networkId = process.env.NETWORK_ID;
	}
	const network = await dbService.getOrInsertNetwork(networkId);
	return {
		sequelize: sequelize,
		network: network,
	};
}
