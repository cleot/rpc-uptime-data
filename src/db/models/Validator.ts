import {
	Model,
	Column,
	Table,
	PrimaryKey,
	BelongsTo,
	Scopes,
	ForeignKey,
	CreatedAt,
	UpdatedAt,
	HasMany,
	Index,
	Unique,
	AutoIncrement,
	AllowNull,
	Is,
	DataType,
} from "sequelize-typescript";
import { isValidAddress } from "../../service/blockchain";
import { Network } from "./Network";
import { ValidatorName } from "./ValidatorName";
import { ValidatorGroupValidator } from "./ValidatorGroupValidator";
import { Op } from "sequelize";
import { FindOptions } from "sequelize/types";

@Scopes(() => ({
	default: {
		attributes: {
			exclude: ["createdAt", "updatedAt", "networkId"],
		},
		include: [],
	},
	full: {
		include: [
			{
				model: Network,
			},
			{
				model: ValidatorGroupValidator,
			},
			{
				model: ValidatorName,
			},
		],
	},
	light: {
		attributes: {
			exclude: ["id", "network", "networkId", "createdAt", "updatedAt"],
		},
	},
	api: {
		include: [
			{
				model: ValidatorName,
				required: false,
			},
			{
				model: ValidatorGroupValidator,
				required: false,
			},
		],
	},
	addressIn(value): FindOptions<any> {
		return { where: { address: { [Op.in]: value } } };
	},
}))
@Table
export class Validator extends Model<Validator> {
	@AutoIncrement
	@PrimaryKey
	@Column
	id: number;

	@Index
	@Unique("UQ_Validator_networkId_address")
	@ForeignKey(() => Network)
	@AllowNull(false)
	@Column
	networkId: number;
	@BelongsTo(() => Network)
	network?: Network;

	@HasMany(() => ValidatorName)
	validatorNames?: ValidatorName[];

	@HasMany(() => ValidatorGroupValidator)
	validatorGroupValidators?: ValidatorGroupValidator[];

	@Is("ValidAddress", (address: string) => {
		if (!isValidAddress(address)) {
			throw new Error(`${address} is not a valid address`);
		}
	})
	@Unique("UQ_Validator_networkId_address")
	@Index
	@AllowNull(false)
	@Column
	address: string;

	@CreatedAt
	@Column
	createdAt: Date;

	@UpdatedAt
	@Column
	updatedAt: Date;

	@Column({
		type: DataType.TEXT("long"),
		allowNull: true,
	})
	rpcUrl: string;
}
