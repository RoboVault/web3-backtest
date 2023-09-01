import { plot, Plot } from 'nodeplotlib';
import { PriceGenerator } from './priceGenerator.js';
import { PriceSeriesStore } from './priceSeriesStore.js';

const SECONDS_PER_DAY = 24 * 60 * 60;
const MILLIS_PER_DAY = SECONDS_PER_DAY * 1000;

const main = async () => {
  const data: Plot[] = [];

  const variance = 0.29;
  const drift = 0.05;
  const id = 'test-series-2';
  const startTime = Math.floor((Date.now() - 90 * MILLIS_PER_DAY) / 1000);
  // Generate the series. This will be stored in influx
  await PriceGenerator.gbm({
    id,
    interval: 60 * 60, // seconds
    startPrice: 100,
    startTime,
    segments: [
      {
        duration: 30, // days
        variance: 0.29,
        drift: 0.05,
      },
      {
        duration: 30, // days
        variance: 0.2,
        drift: 0.01,
      },
      {
        duration: 30, // days
        variance: 0.15,
        drift: 0.01,
      },
    ],
  });

  // Read the series back
  const series = await PriceSeriesStore.fetch(
    id,
    startTime,
    startTime + 90 * SECONDS_PER_DAY,
  );

  // Plot the series for good-measure
  data.push({
    x: series.map((d: any) => d.ts),
    y: series.map((d: any) => d.price),
    type: 'scatter',
    name: `v: ${variance.toFixed(2)} mu: ${drift.toFixed(2)}`,
  });
  plot(data);
};

main();
