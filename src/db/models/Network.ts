import {
	Model,
	Column,
	Table,
	PrimaryKey,
	CreatedAt,
	UpdatedAt,
	Unique,
	AutoIncrement,
	AllowNull,
} from "sequelize-typescript";

@Table
export class Network extends Model<Network> {
	@AutoIncrement
	@PrimaryKey
	@Column
	id: number;

	@Unique
	@AllowNull(false)
	@Column
	networkName: string;

	@CreatedAt
	@Column
	createdAt: Date;

	@UpdatedAt
	@Column
	updatedAt: Date;
}
