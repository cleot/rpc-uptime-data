import {
	Model,
	Column,
	Table,
	PrimaryKey,
	BelongsTo,
	ForeignKey,
	CreatedAt,
	UpdatedAt,
	Scopes,
	Index,
	AutoIncrement,
	Unique,
	AllowNull,
	Comment,
	DataType,
} from "sequelize-typescript";
import { Network } from "./Network";
import { Validator } from "./Validator";
import { decodeBase64, encodeBase64 } from "../../utils";
import { FindOptions } from "sequelize/types";
import { Op } from "sequelize";

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
				model: Validator,
			},
		],
	},
	light: {
		attributes: {
			exclude: [
				// "id",
				"network",
				"networkId",
				"validatorId",
				"createdAt",
				"updatedAt",
			],
		},
	},
	validatorNameByBlock(value): FindOptions<any> {
		return {
			where: {
				fromBlock: { [Op.lte]: value },
				toBlock: {
					[Op.or]: [{ [Op.eq]: null }, { [Op.gt]: value }],
				},
			},
		};
	},
}))
@Table
export class ValidatorName extends Model<ValidatorName> {
	@AutoIncrement
	@PrimaryKey
	@Column
	id: number;

	@AllowNull(false)
	@Column(DataType.TEXT("long"))
	get validatorName(): string {
		return decodeBase64(this.getDataValue("validatorName"));
	}
	set validatorName(value: string) {
		this.setDataValue("validatorName", encodeBase64(value));
	}

	@Unique("UQ_ValidatorName_networkId_validatorId_fromBlock")
	@Index("IDX_ValidatorName_networkId_validatorId_fromBlock")
	@ForeignKey(() => Network)
	@AllowNull(false)
	@Column
	networkId: number;
	@BelongsTo(() => Network)
	network?: Network;

	@Unique("UQ_ValidatorName_networkId_validatorId_fromBlock")
	@Index("IDX_ValidatorName_networkId_validatorId_fromBlock")
	@ForeignKey(() => Validator)
	@AllowNull(false)
	@Column
	validatorId: number;
	@BelongsTo(() => Validator)
	validator?: Validator;

	@Unique("UQ_ValidatorName_networkId_validatorId_fromBlock")
	@Index("IDX_ValidatorName_networkId_validatorId_fromBlock")
	@AllowNull(false)
	@Comment("Block.blockNumber rather than Block.id, for legibility")
	@Column
	fromBlock: number;

	@AllowNull(true)
	@Comment("Block.blockNumber rather than Block.id, for legibility")
	@Column
	toBlock?: number;

	@CreatedAt
	@Column
	createdAt: Date;

	@UpdatedAt
	@Column
	updatedAt: Date;
}
