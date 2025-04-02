import {
	Table,
	Column,
	Model,
	DataType,
	ForeignKey,
	BelongsTo,
	CreatedAt,
	Scopes,
} from "sequelize-typescript";
import { Network } from "./Network";
import { Validator } from "./Validator";
import { RPCMeasurementHeader } from "./RPCMeasurementHeader";
@Scopes(() => ({
	default: {
		attributes: {
			exclude: ["createdAt", "updatedAt"],
		},
		include: [],
	},
	full: {
		include: [
			{
				model: Network,
			},
			{
				model: RPCMeasurementHeader,
			},
			{
				model: Validator,
			},
		],
	},
}))
@Table({
	tableName: "ValidatorRPC",
})
export class ValidatorRPC extends Model {
	@Column({
		type: DataType.INTEGER,
		primaryKey: true,
		autoIncrement: true,
	})
	id: number;

	@ForeignKey(() => Network)
	@Column({
		type: DataType.INTEGER,
		allowNull: false,
	})
	networkId: number;

	@ForeignKey(() => Validator)
	@Column({
		type: DataType.INTEGER,
		allowNull: false,
	})
	validatorId: number;

	@ForeignKey(() => RPCMeasurementHeader)
	@Column({
		type: DataType.BIGINT,
		allowNull: false,
	})
	rpcMeasurementHeaderId: number;

	@Column({
		type: DataType.TEXT("long"),
		allowNull: false,
	})
	rpcUrl: string;

	@CreatedAt
	@Column
	createdAt: Date;

	@BelongsTo(() => Network)
	network: Network;

	@BelongsTo(() => Validator)
	validator: Validator;

	@BelongsTo(() => RPCMeasurementHeader)
	rpcMeasurementHeader: RPCMeasurementHeader;
}
