export interface IGroupMembership {
	epoch: number;
	group: string;
}

export interface IRPCMeasurementFilter {
	fromEpochSeconds: number;
	toEpochSeconds: number;
	addressList?: string[];
}
