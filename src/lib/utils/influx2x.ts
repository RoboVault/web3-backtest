import {
  InfluxDB,
  Point,
  WriteApi,
  QueryApi,
} from '@influxdata/influxdb-client';
import { DeleteAPI } from '@influxdata/influxdb-client-apis';
import { Settings } from './utility.js';
import { Queue } from 'async-await-queue';

export type Fields = Record<string, number | boolean | string>;
export type Tags = Record<string, string | boolean>;
export abstract class Schema {
  public abstract tags: Tags;
  public abstract fields: Fields;
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
    const url = Settings.get('INFLUX2_URL');
    const token = Settings.get('INFLUX2_TOKEN');
    TimeSeriesDB.db = new InfluxDB({
      url,
      token,
    });
  }

  static async connect() {
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
  start: Date;
  end: Date;
}

export class AsyncQueue {
  private queue = new Queue<number>(2, 100);
  private count = 0;
  async queueTask(task: () => Promise<void>, priority: number = 0) {
    const id = this.count++
    await this.queue
        .wait(id, priority)
        .then(task)
        .finally(() => this.queue.end(id))
  }
}

export class Measurement<T extends Schema, Fields, Tags> {
  public timeseriesDB: typeof TimeSeriesDB.db;
  public name: string;
  private writeApi: WriteApi;
  private queryApi: QueryApi;
  private bucket: string;
  private org: string;
  private throttle = new AsyncQueue()
  constructor(measurement: string) {
    this.timeseriesDB = TimeSeriesDB.db;
    this.name = measurement;
    this.org = Settings.get('INFLUX2_ORG');
    this.bucket = Settings.get('INFLUX2_BUCKET');
    this.writeApi = this.timeseriesDB.getWriteApi(
      this.org,
      Settings.get('INFLUX2_BUCKET'),
    );
    this.queryApi = this.timeseriesDB.getQueryApi(this.org);
  }

  private convertToPoint(point: T) {
    const newPoint = new Point(this.name);
    for (const tag in point.tags) {
      if (typeof point.tags[tag] === 'boolean')
        newPoint.tag(tag, point.tags[tag] ? 'true' : 'false');
      else newPoint.tag(tag, point.tags[tag] as string);
    }
    for (const field in point.fields) {
      if (typeof point.fields[field] === 'boolean')
        newPoint.booleanField(field, point.fields[field]);
      else if (typeof point.fields[field] === 'number')
        newPoint.floatField(field, point.fields[field]);
      else newPoint.stringField(field, point.fields[field]);
    }
    newPoint.timestamp(point.timestamp);
    return newPoint;
  }

  public async writePoints(points: T[]) {
    const newPoints = points.map((e) => this.convertToPoint(e));
    await this.throttle.queueTask(async () => {
      this.writeApi.writePoints(newPoints);
      await this.writeApi.flush();
    })
  }

  public async writePoint(point: T) {
    await this.writePoints([point]);
  }

  public async query(
    options: IQueryOptions<Tags>, retries = 0
  ): Promise<Array<{ timestamp: number } & Fields> | any> {

    const queryTask = async () => {
      let query = `
      from(bucket: "${this.bucket}")
        |> range(start: ${options.start.toISOString()}, stop: ${options.end.toISOString()})
        |> filter(fn: (r) => r._measurement == "${this.name}")\n      `;

      for (const tag in options.where) {
        query += `|> filter(fn: (r) => r.${tag} == "${options.where[tag]}")`;
      }

      const data: any[] = [];
      // Influx2 is unlike influx1, so we must merge fields with the same timestamp
      for await (const { values, tableMeta } of this.queryApi.iterateRows(
        query,
      )) {
        const o = tableMeta.toObject(values);

        const field = data.find((e) => e.time === o._time);
        if (field) {
          field[o._field] = o._value;
        } else {
          data.push({
            time: o._time,
            timestamp: new Date(o._time),
            [o._field]: o._value,
          });
        }
      }
      return data;
    }

    while (retries + 1 > 0) {
      try {
        return await queryTask()
      } catch (e) {
        console.log('Error querying - retrying', e)
        retries--
      }
    }
  }

  public async dropMeasurement() {
    const deleteApi = new DeleteAPI(this.timeseriesDB);
    await deleteApi.postDelete({
      org: this.org,
      bucket: this.bucket,
      body: {
        start: new Date(0).toISOString(),
        stop: new Date('2100-1-1').toISOString(),
        predicate: `_measurement="${this.name}"`,
      },
    });
  }

  public async dropSeries(options: { where: string }) {
    const deleteApi = new DeleteAPI(this.timeseriesDB);
    await deleteApi.postDelete({
      org: this.org,
      bucket: this.bucket,
      body: {
        start: new Date(0).toISOString(),
        stop: new Date('2100-1-1').toISOString(),
        predicate: `_measurement="${this.name}" AND ${options.where}`,
      },
    });
  }
}

export default TimeSeriesDB.instance;
