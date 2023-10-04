import { Price } from '../models/price.js';

export type PriceSeries = {
  ts: number;
  price: number;
}[];

export class PriceSeriesStore {
  static async store(name: string, series: PriceSeries) {
    await Price.dropSeries({
      where: `id="${name}"`,
    });
    for (let price of series) {
      const point = {
        tags: {
          id: name,
        },
        fields: {
          price: price.price,
        },
        timestamp: new Date(price.ts * 1000),
      };
      await Price.writePointBatched(point, 5000);
    }
  }

  static async fetch(name: string, start: number, end: number) {
    const data = await Price.query(
      {
        where: { id: name },
        start: new Date(start * 1000),
        end: new Date(end * 1000),
      },
      10, // retries
    );
    return {
      id: name,
      data: data.map((e: any) => {
        return {
          ts: e.timestamp / 1000,
          price: e.price,
        };
      }),
    };
  }
}
