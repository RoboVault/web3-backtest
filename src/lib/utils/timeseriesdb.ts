import * as Influx from 'influx';
import { Settings } from '../utils/utility.js';

export abstract class Schema {
  public abstract tags: object;
  public abstract fields: object;
  public abstract timestamp: number | Date;
}

export interface ILogAny extends Schema {
  tags: any;
  fields: any;
}

type Protocol = 'https' | 'http';
export class TimeSeriesDB {
  private static inst: TimeSeriesDB;
  public static db: Influx.InfluxDB;
  public static connected: Promise<boolean>;

  constructor() {
    console.log(Settings.get('INFLUX_HOST'));
    const cfg: Influx.IClusterConfig = {
      hosts: [
        {
          host: Settings.get('INFLUX_HOST'),
          protocol: Settings.get('INFLUX_PROTOCOL') as Protocol,
          options: { rejectUnauthorized: false },
        },
      ],
      database: Settings.get('INFLUX_DATABASE'),
      username: Settings.get('INFLUX_USER'),
      password: Settings.get('INFLUX_PASSWORD'),
    };
    TimeSeriesDB.db = new Influx.InfluxDB(cfg);
  }

  static async connect() {
    try {
      const names = await this.db.getDatabaseNames();
      console.log(names);
      if (!names.includes(Settings.get('INFLUX_DATABASE'))) {
        await this.db.createDatabase(Settings.get('INFLUX_DATABASE'));
      }
    } catch (err) {
      console.error('Start log database failed: ' + err?.toString());
    }
    return true;
  }

  static disconnect() {
    // delete this.instance.db
  }

  static get instance(): TimeSeriesDB {
    if (this.inst === undefined) {
      this.inst = new TimeSeriesDB();
      this.connected = this.connect();
    }
    return this.connected;
  }
}

interface IQueryOptions<T> {
  where?: T | any;
  start: number | Date | string;
  end: number | Date | string;
}

export class Measurement<T extends Schema, Fields, Tags> {
  public timeseriesDB: typeof TimeSeriesDB.db;
  public name: string;
  public nrequests: number = 0;
  constructor(measurement: string) {
    this.timeseriesDB = TimeSeriesDB.db;
    this.name = measurement;
  }

  public async writePoints(points: T[]) {
    await TimeSeriesDB.instance;
    const pts = points.map((e) => {
      return { measurement: this.name, ...e };
    });
    points.forEach((e: any) => {
      e.tags.env = Settings.environment();
    });
    await this.timeseriesDB.writePoints(pts as Influx.IPoint[]);
    this.nrequests--;
  }

  public async writePoint(point: T) {
    // await TimeSeriesDB.instance;
    await this.writePoints([point]);
  }

  public async query(
    options: IQueryOptions<Tags>,
    fields: string = '*',
  ): Promise<Array<{ timestamp: number } & Fields> | any> {
    await TimeSeriesDB.instance;
    let query = `SELECT ${fields} FROM ${this.name} WHERE `;
    if (options.where) {
      const where: any = options.where;
      for (const tag of Object.keys(where)) {
        query += `${tag}='${where[tag]}' AND `;
      }
    }
    query += `TIME >= ${options.start} AND TIME <= ${options.end}`;
    const res: Array<{ timestamp: number } & Fields> = (
      await this.timeseriesDB.query<Schema>(query)
    ).map((e: any) => {
      return { timestamp: Number(e.time.getNanoTime()), ...e };
    });
    return res;
  }

  public async dropMeasurement() {
    await TimeSeriesDB.instance;
    await this.timeseriesDB.dropMeasurement(this.name);
  }
}

export default TimeSeriesDB.instance;
