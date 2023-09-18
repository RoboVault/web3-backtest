import { Schema, Fields, Tags, Measurement } from '../utils/influx2x.js';

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

export type PriceLog = Measurement<IPrice, IPriceFields, IPriceTags>;
export const Price = new Measurement<IPrice, IPriceFields, IPriceTags>(
  'price_v1',
);
