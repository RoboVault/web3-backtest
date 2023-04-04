import { DataSource } from "typeorm";
import { GLP } from "./entities.js";
import * as dotenv from 'dotenv'
dotenv.config()

export const TypeOrmDataSource = new DataSource({
    type: "postgres",
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT as string),
    username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASS,
    database: process.env.POSTGRES_DATABASE,
    synchronize: false,
    entities: [GLP],
    subscribers: [],
    migrations: [],
})