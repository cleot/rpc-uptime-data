import { config } from "dotenv-flow";
config();
import { Umzug, SequelizeStorage } from "umzug";
import { Sequelize } from "sequelize";
import { initialize, initializeMemory } from "./service/database";

let sequelize: Sequelize = initializeMemory();

if (process.env.NODE_ENV === "production") {
	sequelize = initialize();
}

process.env.QUERY_LOGGING = "true";

export const migrator = new Umzug({
	migrations: {
		glob: ["db/migrations/*.ts", { cwd: __dirname }],
	},
	context: sequelize,
	storage: new SequelizeStorage({
		sequelize,
	}),
	logger: console,
});

export type Migration = typeof migrator._types.migration;
