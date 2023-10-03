import { Log } from './models/log.js';
import { Rebalance } from './models/rebalance.js';
import { Summary } from './models/summary.js';
import { stringify } from 'csv-stringify/sync';
import fs from 'fs/promises';
import { StructJoesAutopoolStrategy } from './strategy.js';
import { JoesAutopoolsSnaphot } from '../../../lib/datasource/joesAutopools.js';

const SECONDS_IN_DAY = 60 * 60 * 24;
const MILLISECONDS_IN_DAY = SECONDS_IN_DAY * 1000;
const POOLS = ['BTC.b-WAVAX', 'WETH.e-WAVAX', 'WAVAX-USDC'];
const PERIOD = 8 * 7;

export class StructJoesAutopoolStrategyRunner {
  strategies: StructJoesAutopoolStrategy[] = [];
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

    const summaries = this.strategies.map((s) => s.summary);
    const csv = stringify(summaries, { header: true });
    await fs.writeFile('./struct_summary.csv', csv);

    const series = this.strategies.map((s) => s.series).flat();
    const seriesCsv = stringify(series, { header: true });
    await fs.writeFile('./struct_series.csv', seriesCsv);

    console.log('Backtest complete');
  }

  public async startNewStartForPool(pool: string) {
    this.strategies.push(
      new StructJoesAutopoolStrategy({
        initialValue: 1000,
        period: PERIOD,
        pool, 
        fixedApr: 0.1,
        fixedToken: 'base',
      }),
    );
    this.strategies.push(
      new StructJoesAutopoolStrategy({
        initialValue: 1000,
        period: PERIOD,
        pool, 
        fixedApr: 0.1,
        fixedToken: 'quote',
      }),
    );
  }

  public async onData(snapshot: JoesAutopoolsSnaphot) {
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
    // if (this.strategies.length === 0) {
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
        (s) => s.options.pool === symbol,
      );
      await Promise.all(strats.map((strat) => strat.process(pool)));
    }
  }
}
