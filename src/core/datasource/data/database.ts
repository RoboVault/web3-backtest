import { DataSource } from "typeorm";
import { GLP } from "./entities.js";

export const TypeOrmDataSource = new DataSource({
    type: "postgres",
    host: "localhost",
    port: 5432,
    username: "postgres",
    password: "password",
    database: "postgres",
    synchronize: false,
    // logging: true,
    entities: [GLP],
    subscribers: [],
    migrations: [],
})