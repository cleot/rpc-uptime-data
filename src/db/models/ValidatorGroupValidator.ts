import {
	Model,
	Column,
	Table,
	PrimaryKey,
	BelongsTo,
	ForeignKey,
	CreatedAt,
	UpdatedAt,
	Index,
	Scopes,
	AutoIncrement,
	Unique,
	AllowNull,
} from "sequelize-typescript";
import { Op } from "sequelize";
import { FindOptions } from "sequelize/types";
import { Network } from "./Network";
import { Validator } from "./Validator";
import { ValidatorGroup } from "./ValidatorGroup";

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
			{
				model: ValidatorGroup,
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
				"validatorGroupId",
				"createdAt",
				"updatedAt",
			],
		},
	},
	api: {
		include: [
			{
				model: ValidatorGroup.scope("light"),
				required: true,
			},
		],
	},
	validatorGroupByEpoch(value): FindOptions<any> {
		return {
			where: {
				fromEpoch: { [Op.lte]: value },
				toEpoch: {
					[Op.or]: [{ [Op.eq]: null }, { [Op.gt]: value }],
				},
			},
		};
	},
}))
@Table
export class ValidatorGroupValidator extends Model<ValidatorGroupValidator> {
	@AutoIncrement
	@PrimaryKey
	@Column
	id: number;

	@Unique("UQ_VVGroup_validatorGroupId_networkId_validatorId_fromEpoch")
	@Index
	@ForeignKey(() => ValidatorGroup)
	@AllowNull(false)
	@Column
	validatorGroupId: number;
	@BelongsTo(() => ValidatorGroup)
	validatorGroup?: ValidatorGroup;

	@Unique("UQ_VVGroup_validatorGroupId_networkId_validatorId_fromEpoch")
	@Index
	@ForeignKey(() => Validator)
	@AllowNull(false)
	@Column
	validatorId: number;
	@BelongsTo(() => Validator)
	validator?: Validator;

	@Unique("UQ_VVGroup_validatorGroupId_networkId_validatorId_fromEpoch")
	@Index
	@ForeignKey(() => Network)
	@AllowNull(false)
	@Column
	networkId: number;
	@BelongsTo(() => Network)
	network?: Network;

	@Unique("UQ_VVGroup_validatorGroupId_networkId_validatorId_fromEpoch")
	@AllowNull(false)
	@Column
	fromEpoch: number;

	@Column
	toEpoch?: number;

	@CreatedAt
	@Column
	createdAt: Date;

	@UpdatedAt
	@Column
	updatedAt: Date;
}
