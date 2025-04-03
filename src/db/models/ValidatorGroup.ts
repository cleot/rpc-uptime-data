import {
	Model,
	Column,
	Table,
	PrimaryKey,
	BelongsTo,
	ForeignKey,
	Scopes,
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
import { decodeBase64, encodeBase64 } from "../../utils";
import { isValidAddress } from "../../service/blockchain";
import { Network } from "./Network";
import { ValidatorGroupValidator } from "./ValidatorGroupValidator";

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
			{ model: ValidatorGroupValidator },
		],
	},
	light: {
		attributes: {
			exclude: [
				"id",
				"network",
				"networkId",
				"validatorGroupValidators",
				"createdAt",
				"updatedAt",
			],
		},
	},
}))
@Table
export class ValidatorGroup extends Model<ValidatorGroup> {
	@AutoIncrement
	@PrimaryKey
	@Column
	id: number;

	@Index
	@Unique("UQ_ValidatorGroup_networkId_address")
	@ForeignKey(() => Network)
	@AllowNull(false)
	@Column
	networkId: number;
	@BelongsTo(() => Network)
	network?: Network;

	@Is("ValidAddress", (address: string) => {
		if (!isValidAddress(address)) {
			throw new Error(`${address} is not a valid address`);
		}
	})
	@Unique("UQ_ValidatorGroup_networkId_address")
	@AllowNull(false)
	@Column
	address: string;

	@AllowNull(true)
	@Column(DataType.TEXT("long"))
	get name(): string {
		return decodeBase64(this.getDataValue("name"));
	}
	set name(value: string) {
		this.setDataValue("name", encodeBase64(value));
	}

	@HasMany(() => ValidatorGroupValidator)
	validatorGroupValidators?: ValidatorGroupValidator[];

	@CreatedAt
	@Column
	createdAt: Date;

	@UpdatedAt
	@Column
	updatedAt: Date;
}
