import {
	Table,
	Column,
	Model,
	DataType,
	ForeignKey,
	BelongsTo,
	CreatedAt,
	AllowNull,
	Scopes,
} from "sequelize-typescript";
import { Network } from "./Network";
@Scopes(() => ({
	default: {
		attributes: {
			exclude: ["createdAt", "updatedAt"],
		},
		include: [],
	},
	api: {
		include: [
			{
				model: Network,
			},
		],
	},
}))
@Table({
	tableName: "RPCMeasurementHeader",
})
export class RPCMeasurementHeader extends Model {
	@Column({
		type: DataType.BIGINT,
		primaryKey: true,
		autoIncrement: true,
	})
	id: number;

	@AllowNull(false)
	@ForeignKey(() => Network)
	@Column({
		type: DataType.INTEGER,
		allowNull: false,
	})
	networkId: number;

	@AllowNull(false)
	@Column({
		type: DataType.UUID,
		allowNull: false,
	})
	measurementId: string;

	@AllowNull(false)
	@Column({
		type: DataType.DATE,
		allowNull: false,
	})
	executedAt: Date;

	@CreatedAt
	@Column
	createdAt: Date;

	@BelongsTo(() => Network)
	network: Network;
}
