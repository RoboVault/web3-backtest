import { UniV3PositionManager } from '../../../lib/protocols/UNIV3PositionManager.js';
import { Uni3Snaphot } from '../../../lib/datasource/univ3Dex.js';
import { stringify } from 'csv-stringify/sync';
import fs from 'fs/promises';
import { UniV3Hodl } from './univ3Hodl.js';
import { Log, Rebalance, Summary } from './models.js';
import { range } from '../../../lib/utils/utility.js';
import { permutations } from '../../../lib/utils/permutations.js';

const SECONDS_IN_DAY = 60 * 60 * 24;
const MILLISECONDS_IN_DAY = SECONDS_IN_DAY * 1000;
const PERIOD = 1; // 1 Day

const POOLS = ['Camelotv3 WETH/USDC 0%'];

export class HedgedUniswapStrategyRunner {
  private uni = new UniV3PositionManager();
  private lastData!: Uni3Snaphot;
  private lastStart?: number;
  private strategies: UniV3Hodl[] = [];

  constructor(private end: Date) {}

  public async startNewStartForPool(pool: string) {
    const rangeSpread = range(0.05, 0.25, 5);
    const priceOffset = range(-0.1, .1, 5);

    const variations = permutations([rangeSpread, priceOffset]);

    variations.forEach((e) => {
      this.strategies.push(
        new UniV3Hodl({
          name: `#${e[0]}: Camelotv3 WETH/USDC ${e[0] * 100}% | offset : ${
            e[1] * 100
          }%`,
          poolSymbol: pool,
          initial: 10_000,
          rangeSpread: e[0],
          priceOffset : e[1],
          priceToken: 0,
          fixedSlippage: 0.01,
          period: PERIOD,
          writeToInflux : false,
        }),
      );
    });
  }

  public async before() {
    await Log.dropMeasurement();
  }

  public async after() {
    console.log(
      'end date:',
      new Date(this.lastData.timestamp * 1000).toISOString(),
    );
    await Log.exec(true);
    await Rebalance.exec(true);
    const summary = this.strategies.map((s) => s.summary);
    //console.log(summary);
    const csv = stringify(summary, { header: true });
    fs.writeFile('./camelotv3LP.csv', csv);

    const series = this.strategies.map((s) => s.series).flat();
    const seriesCsv = stringify(series, { header: true });
    fs.writeFile('./camelotv3LPSeries.csv', seriesCsv);

    await Summary.writePoints(
      summary.map((s, i) => {
        return {
          tags: this.strategies[i].tags,
          fields: s,
          timestamp: new Date(this.lastData.timestamp * 1000),
        };
      }),
    );
    await Summary.exec();
  }

  public async onData(snapshot: Uni3Snaphot) {
    if (!snapshot.data.univ3) return console.log('missing  data', snapshot);
    this.lastData = snapshot;

    this.uni.processPoolData(snapshot);

    const hoursElapsed = 24 * Math.floor(
      (snapshot.timestamp - this.lastStart!) / SECONDS_IN_DAY,
    );
    const daysRemaining =
      (this.end.getTime() - snapshot.timestamp * 1000) / MILLISECONDS_IN_DAY;

    // Create new strategies every 3 days
    if (
      (this.strategies.length === 0 || hoursElapsed > 6) &&
      daysRemaining > PERIOD
    ) {
      for (const pool of POOLS) {
        console.log('start strat', pool, new Date(snapshot.timestamp * 1000));
        this.startNewStartForPool(pool);
      }
      this.lastStart = snapshot.timestamp;
    }

    // Process the strategy
    for (const strat of this.strategies) {
      await strat.process(this.uni, snapshot);
    }
  }
}
