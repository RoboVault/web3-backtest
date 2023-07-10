import { generateGbm, generateGbmEgarch } from './geometricBrownianMotion.js';
import { PriceSeries, PriceSeriesStore } from './priceSeriesStore.js';

export type Segment = {
  duration: number; // in days
  variance: number;
  drift: number;
};

export type GbmOptions = {
  id: string; // Identifier for the series
  interval: number; // in seconds
  startPrice: number;
  startTime: number; // unix timestamp in seconds
  segments: Segment[];
};

export type GbmEgarchOptions = {
  id: string; // Identifier for the series
  interval: number; // in seconds
  startPrice: number;
  startTime: number; // unix timestamp in seconds
  alpha: number;
  gamma: number;
  beta: number;
  segments: Segment[];
};

const SECONDS_PER_DAY = 24 * 60 * 60;

export class PriceGenerator {
  // segments based on geometric brownian motion
  static async gbm(options: GbmOptions) {
    let endPrice = options.startPrice;
    let time = options.startTime;
    let series: PriceSeries = [];

    for (const segment of options.segments) {
      const prices = generateGbm({
        startPrice: endPrice,
        testDuration: segment.duration,
        interval: options.interval,
        variance: segment.variance,
        drift: segment.drift,
      });
      const data = prices.map((price: number, i: number) => {
        return {
          ts: time + i * options.interval,
          price: price,
        };
      });
      series = series.concat(data);
      time += segment.duration * SECONDS_PER_DAY;
      endPrice = series[series.length - 1].price;
    }
    await PriceSeriesStore.store(options.id, series);
    return series;
  }

  // segments based on geometric brownian motion with EGARCH
  static async gbmEgarch(options: GbmEgarchOptions) {
    let endPrice = options.startPrice;
    let time = options.startTime;
    let series: { ts: number; price: number }[] = [];

    for (const segment of options.segments) {
      const prices = generateGbmEgarch({
        startPrice: endPrice,
        testDuration: segment.duration,
        interval: options.interval,
        initialVariance: segment.variance,
        drift: segment.drift,
        alpha: options.alpha,
        beta: options.beta,
        gamma: options.gamma,
      });
      const data = prices.map((price: number, i: number) => {
        return {
          ts: time + i * options.interval,
          price: price,
        };
      });
      series = series.concat(data);
      time += segment.duration * SECONDS_PER_DAY;
      endPrice = series[series.length - 1].price;
    }
    await PriceSeriesStore.store(options.id, series);
    return series;
  }
}
