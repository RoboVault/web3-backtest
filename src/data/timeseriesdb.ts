import * as Influx from 'influx'
import * as os from 'os'
import { Settings } from '../utils/utility'

export abstract class Schema {
    public abstract tags: object
    public abstract fields: object
    public abstract timestamp: number | Date
}

type Protocol = 'https' | 'http'
export class TimeSeriesDB {
    private static inst: TimeSeriesDB
    public db: Influx.InfluxDB
    public connected: boolean

    constructor() {
        console.log(Settings.get('INFLUX_HOST'))
        this.connected = false
        const cfg: Influx.IClusterConfig = {
            hosts: [{
                host: Settings.get('INFLUX_HOST'),
                protocol: Settings.get('INFLUX_PROTOCOL') as Protocol,
                options: { rejectUnauthorized: false }
            }],
            database: Settings.get('INFLUX_DATABASE'),
            username: Settings.get('INFLUX_USER'),
            password: Settings.get('INFLUX_PASSWORD'),
        }
        this.db = new Influx.InfluxDB(cfg)
        this.db.getDatabaseNames().then((names) => {
            console.log(names)
            if (!names.includes(Settings.get('INFLUX_DATABASE'))) {
                return this.db.createDatabase(Settings.get('INFLUX_DATABASE'))
            }
            this.connected = true
        }).catch((err) => {
            console.error('Start log database failed: ' + err.toString())
        })
    }

    static disconnect() {
        // delete this.instance.db
    }

    static get instance(): TimeSeriesDB {
        if (this.inst === undefined) {
            this.inst = new TimeSeriesDB()
        }
        return this.inst
    }
}

interface IQueryOptions<T> {
    where?: T | any
    start: number | Date | string
    end: number | Date | string
}

export class Measurement<T extends Schema, Fields, Tags> {
    private timeseriesDB: TimeSeriesDB
    private name: string
    constructor(measurement: string) {
        this.timeseriesDB = TimeSeriesDB.instance
        this.name = measurement
    }

    public async writePoints(points: T[]) {
        const pts = points.map((e) => {
            return { measurement: this.name, ...e }
        })
        points.forEach((e: any) => {
            e.tags.env = Settings.environment()
        })
        await this.timeseriesDB.db.writePoints(pts as Influx.IPoint[])
    }

    public async writePoint(point: T) {
        await this.writePoints([point])
    }

    public async query(options: IQueryOptions<Tags>, fields: string = '*'): Promise<Array<{ timestamp: number } & Fields> | any> {
        let query = `SELECT ${fields} FROM ${this.name} WHERE `
        if (options.where) {
            const where: any = options.where
            for (const tag of Object.keys(where)) {
                query += `${tag}='${where[tag]}' AND `
            }
        }
        query += `TIME >= ${options.start} AND TIME <= ${options.end}`
        const res: Array<{ timestamp: number } & Fields> = (await this.timeseriesDB.db.query<Schema>(query)).map((e: any) => {
            return { timestamp: Number(e.time.getNanoTime()), ...e }
        })
        return res
    }

    public async dropMeasurement() {
        await this.timeseriesDB.db.dropMeasurement(this.name)
    }
}

export default TimeSeriesDB.instance
