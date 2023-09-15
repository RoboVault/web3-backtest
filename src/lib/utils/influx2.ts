import { InfluxDB, Point, WriteApi } from '@influxdata/influxdb-client'
import { Settings } from '../utils/utility.js';

export abstract class Schema {
  public abstract tags: Record<string, string>;
  public abstract fields: Record<string, number>;
  public abstract timestamp: number | Date;
}

export interface ILogAny extends Schema {
  tags: any;
  fields: any;
}

export class TimeSeriesDB {
  private static inst: TimeSeriesDB;
  public static db: InfluxDB;
  public static connected: Promise<boolean>;

  constructor() {
    const url = Settings.get('INFLUX2_URL')
    const token = Settings.get('INFLUX2_TOKEN')
    TimeSeriesDB.db = new InfluxDB({
      url,
      token,
    });
  }

  static async connect() {
    // try {
    //   const names = await this.db.getDatabaseNames();

      
    //   console.log(names);
    //   if (!names.includes(Settings.get('INFLUX_DATABASE'))) {
    //     await this.db.createDatabase(Settings.get('INFLUX_DATABASE'));
    //   }
    // } catch (err) {
    //   console.error('Start log database failed: ' + err?.toString());
    // }
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
  private writeApi: WriteApi;
  constructor(measurement: string) {
    this.timeseriesDB = TimeSeriesDB.db;
    this.name = measurement;
    this.writeApi = this.timeseriesDB.getWriteApi(
      Settings.get('INFLUX2_ORG'), 
      Settings.get('INFLUX2_BUCKET')
    )
  }

  private convertToPoint(point: T) {
    const newPoint = new Point(this.name);
    for (const tag in point.tags) {
      newPoint.tag(tag, point.tags[tag]);
    }
    for (const field in point.fields) {
      newPoint.floatField(field, point.fields[field]);
    }
    newPoint.timestamp(point.timestamp);
    console.log(newPoint)
    return newPoint
  }

  public async writePoints(points: T[]) {
    const newPoints = points.map((e) => this.convertToPoint(e))
    this.writeApi.writePoint(newPoints[0])
    console.log('writing point')
    await this.writeApi.flush()
  }

  public async writePoint(point: T) {
    await this.writePoints([point]);
  }

  // public async query(
  //   options: IQueryOptions<Tags>,
  //   fields: string = '*',
  // ): Promise<Array<{ timestamp: number } & Fields> | any> {
  //   await TimeSeriesDB.instance;
  //   let query = `SELECT ${fields} FROM ${this.name} WHERE `;
  //   if (options.where) {
  //     const where: any = options.where;
  //     for (const tag of Object.keys(where)) {
  //       query += `${tag}='${where[tag]}' AND `;
  //     }
  //   }
  //   query += `TIME >= ${options.start} AND TIME <= ${options.end}`;
  //   console.log(query);
  //   const res: Array<{ timestamp: number } & Fields> = (
  //     await this.timeseriesDB.query<Schema>(query)
  //   ).map((e: any) => {
  //     return { timestamp: Number(e.time.getNanoTime()), ...e };
  //   });
  //   return res;
  // }

  // public async dropMeasurement() {
  //   await TimeSeriesDB.instance;
  //   await this.timeseriesDB.dropMeasurement(this.name);
  // }

  // public async dropSeries(options: { where: string }) {
  //   await TimeSeriesDB.instance;
  //   const query = {
  //     where: options.where,
  //     measurement: this.name,
  //   };
  //   await this.timeseriesDB.dropSeries(query);
  // }
}

export default TimeSeriesDB.instance;
