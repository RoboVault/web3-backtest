# Price Generator

The price generator will generate a simluted market price using Geometric Brownie Motion, storing it in your influx database for later use in strategy simulations. 


## Generate

This example will create price series data for a 30 day period 
```ts
  const variance = 0.29
  const drift = 0.05
  const startTime = Math.floor((Date.now() - 30 * MILLIS_PER_DAY) / 1000)
  // Generate the series. This will be stored in influx
  await PriceGenerator.gbm({
    id: 'test-series',
    interval: 60 * 60, // seconds
    startPrice: 100,
    startTime,
    segments: [
      {
        duration: 30, // days
        variance: 0.29,
        drift: 0.05,
      },
    ]
  })
```

## Fetch

Fetch the data for the backtest using `PriceSeriesStore`, for examaple:

```ts
const series = await PriceSeriesStore.fetch('test-series', startTime, startTime + 90 * SECONDS_PER_DAY)
```

## Example

See `price-gen/example.ts` as an example for usage. 
