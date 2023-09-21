import { Price } from '../models/price.js';

export type PriceSeries = {
  ts: number;
  price: number;
}[];

export class PriceSeriesStore {
  static async store(name: string, series: PriceSeries) {
    await Price.dropSeries({
      where: `"id" = '${name}'`,
    });
    await Price.writePoints(
      series.map((price) => {
        console.log(new Date(price.ts * 1000));
        return {
          tags: {
            id: name,
          },
          fields: {
            price: price.price,
          },
          timestamp: price.ts * 1000,
        };
      }),
    );
  }

  static async fetch(name: string, start: number, end: number) {
    const data = await Price.query({
      where: { id: name },
      start: (start * 1000).toString(),
      end: (end * 1000).toString(),
    });
    return data.map((e: any) => {
      return {
        ts: e.timestamp / 1000,
        price: e.price,
      };
    });
  }
}
