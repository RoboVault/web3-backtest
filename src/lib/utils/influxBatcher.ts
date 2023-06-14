import { Schema, Measurement } from './timeseriesdb.js';

interface ILogAny extends Schema {
  tags: any;
  fields: any;
}

export class InfluxBatcher<
  T extends Schema = ILogAny,
  Fields = any,
  Tags = any,
> extends Measurement<T, Fields, Tags> {
  private points: T[] = [];
  constructor(private measurement: string) {
    super(measurement);
  }

  // adds point to batch
  public async writePointBatched(point: T, batchLimit: number = 1) {
    this.points.push(point);
    if (this.points.length > batchLimit) await this.exec();
  }

  public pending() {
    return this.points.length;
  }

  public async exec() {
    if (this.points.length === 0) return;

    const start = Date.now();
    await this.writePoints(this.points);
    console.log(`batch ${this.measurement} elapsed ${Date.now() - start}ms`);
    this.points = [];
  }
}
