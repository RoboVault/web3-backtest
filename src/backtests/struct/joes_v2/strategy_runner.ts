import { JoesV2Snaphot } from '../../../lib/datasource/joesv2Dex.js';
import { Log } from './models/log.js';
import { Rebalance } from './models/rebalance.js';
import { Summary } from './models/summary.js';
import { StructJoesV2Strategy } from './strategy.js';

const SECONDS_IN_DAY = 60 * 60 * 24;
const MILLISECONDS_IN_DAY = SECONDS_IN_DAY * 1000;
const POOLS = ['BTC.b-WAVAX', 'WETH.e-WAVAX', 'WAVAX-USDC'];
const PERIOD = 8 * 7;

export class StructJoesV2StrategyRunner {
  strategies: StructJoesV2Strategy[] = [];
  lastStart?: number;

  constructor(private end: Date) {}

  public async before() {
    await Log.dropMeasurement();
    await Rebalance.dropMeasurement();
    await Summary.dropMeasurement();
  }

  public async after() {
    try {
      await Log.exec();
      await Rebalance.exec();
      await Summary.exec();
    } catch (e) {
      // console.log(e)
      throw new Error('INFLUX ERROR after');
    }
    console.log('Backtest complete');
  }

  public async startNewStartForPool(pool: string) {
    const stdpool = {
      symbol: pool,
      binRange: 15,
      rebalanceBin: 13,
    };
    const stdOpts = {
      initialValue: 1000,
      fixedApr: 0.1,
      period: PERIOD,
    };
    this.strategies.push(
      new StructJoesV2Strategy({
        ...stdOpts,
        fixedToken: 'base',
        pool: { ...stdpool, rebalance: true },
      }),
    );
    this.strategies.push(
      new StructJoesV2Strategy({
        ...stdOpts,
        fixedToken: 'base',
        pool: { ...stdpool, rebalance: false },
      }),
    );
    this.strategies.push(
      new StructJoesV2Strategy({
        ...stdOpts,
        fixedToken: 'quote',
        pool: { ...stdpool, rebalance: true },
      }),
    );
    this.strategies.push(
      new StructJoesV2Strategy({
        ...stdOpts,
        fixedToken: 'quote',
        pool: { ...stdpool, rebalance: false },
      }),
    );
  }

  public async onData(snapshot: JoesV2Snaphot) {
    if (!snapshot.data.joes) return console.log('missing joes data', snapshot);

    const daysElapsed = Math.floor(
      (snapshot.timestamp - this.lastStart!) / SECONDS_IN_DAY,
    );
    const daysRemaining =
      (this.end.getTime() - snapshot.timestamp * 1000) / MILLISECONDS_IN_DAY;
    // Check for new strategies
    if (
      (this.strategies.length === 0 || daysElapsed > 3) &&
      daysRemaining > PERIOD
    ) {
      for (const pool of POOLS) {
        console.log('start strat', pool, new Date(snapshot.timestamp * 1000));
        this.startNewStartForPool(pool);
      }
      this.lastStart = snapshot.timestamp;
    }

    for (const symbol of POOLS) {
      const pool = snapshot.data.joes.find((p) => p.pool.symbol === symbol)!;
      if (!pool) {
        console.log('Data missing for this pool? ', symbol);
        console.log(snapshot.data.joes.map((e) => e.pool.symbol));
        continue;
        // throw new Error('Pool data doesnt exist')
      }
      const strats = this.strategies.filter(
        (s) => s.options.pool.symbol === symbol,
      );
      await Promise.all(strats.map((strat) => strat.process(pool)));
    }
  }
}
