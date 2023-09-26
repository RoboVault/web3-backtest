import { Schema, Measurement } from './influx2x.js';

interface ILogAny extends Schema {
  tags: any;
  fields: any;
}

export class InfluxBatcher<
  T extends Schema = ILogAny,
  Fields = any,
  Tags = any,
> extends Measurement<T, Fields, Tags> {
  lock = false;
  private points: T[] = [];
  constructor(private measurement: string) {
    super(measurement);
  }

  // adds point to batch
  public async writePointBatched(point: T, batchLimit: number = 1000) {
    this.points.push(point);
    if (this.points.length > batchLimit) await this.exec();
  }

  public async writePoint(point: T, batchLimit: number = 1000) {
    this.writePointBatched(point, batchLimit);
  }

  public async writePoints(points: T[], batchLimit: number = 1000) {
    this.points.push(...points);
    if (this.points.length > batchLimit) await this.exec();
  }

  public pending() {
    return this.points.length;
  }

  public async exec(force = false) {
    if (this.points.length === 0) return;
    if (this.lock && !force) return;
    this.lock = true;
    const start = Date.now();
    await super.writePoints(this.points);
    this.lock = false;
    console.log(
      `batch ${this.measurement} ${this.points.length} points - elapsed ${
        Date.now() - start
      }ms`,
    );
    this.points = [];
  }
}
