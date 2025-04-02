export interface IHealthResponse {
	message: string;
	timestamp: number;
}

export async function getHealth(networkName: string): Promise<IHealthResponse> {
	const health: IHealthResponse = {
		message: `Successfully authenticated and connected to database ${networkName}`,
		timestamp: Date.now(),
	};
	return health;
}
