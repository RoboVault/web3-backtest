import { Schema, Measurement } from '../utils/timeseriesdb.js';

interface IPriceTags {
  id: string;
}

interface IPriceFields {
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
