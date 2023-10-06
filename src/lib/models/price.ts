import { Schema, Fields, Tags, Measurement } from '../utils/influx2x.js';
import { InfluxBatcher } from '../utils/influxBatcher.js';

interface IPriceTags extends Tags {
  id: string;
}

interface IPriceFields extends Fields {
  price: number;
}

export interface IPrice extends Schema {
  tags: IPriceTags;
  fields: IPriceFields;
}

export type PriceLog = InfluxBatcher<IPrice, IPriceFields, IPriceTags>;
export const Price = new InfluxBatcher<IPrice, IPriceFields, IPriceTags>(
  'price_v1',
);
