import { JoesAutopoolsPoolSnapshot } from '../../../lib/datasource/joesAutopools.js';
import { JoesV2AutoPoolStrategy } from './joesv2_autopool.js';
import { Log } from './models/log.js';
import { Summary } from './models/summary.js';

const SECONDS_IN_DAY = 60 * 60 * 24;
const SECONDS_IN_YEAR = SECONDS_IN_DAY * 365;

/**
 * Runs the struct strategy and logs the progress
 */
export class StructJoesAutopoolStrategy {
  public autoPool?: JoesV2AutoPoolStrategy;
  public expired = false;
  public startTime!: number;
  public fixed!: number;
  public tags!: any;
  public series: any[] = [];
  public summary: any;
  public initial!: {
    price: number;
    base: number;
    quote: number;
  };
  constructor(
    public options: {
      initialValue: number;
      period: number; // days
      fixedToken: 'base' | 'quote';
      fixedApr: number;
      tags?: any;
      pool: string;
    },
  ) {}

  public async process(pool: JoesAutopoolsPoolSnapshot) {
    if (this.expired) return;

    if (!this.autoPool) {
      this.setup(pool);
    } else {
      await this.autoPool.process(pool);
    }

    await this.log(pool);

    const daysElapsed = (pool.timestamp - this.startTime) / SECONDS_IN_DAY;
    if (daysElapsed > this.options.period) {
      this.expired = true;
      console.log('strategy expired');
      this.wrapup(pool);
    }
  }

  public setup(pool: JoesAutopoolsPoolSnapshot) {
    const start = new Date(pool.timestamp * 1000).toISOString().split('T')[0];
    console.log('setup', start);
    this.tags = {
      ...this.options.tags,
      initialValue: this.options.initialValue,
      symbol: pool.pool.symbol,
      quote: pool.pool.tokenY.symbol,
      base: pool.pool.tokenX.symbol,
      fixedToken: this.options.fixedToken,
      start,
    };
    this.startTime = pool.timestamp;
    this.initial = {
      price: pool.price,
      base: this.options.initialValue / 2 / pool.price,
      quote: this.options.initialValue / 2,
    };

    this.autoPool = new JoesV2AutoPoolStrategy(
      {
        amountInQuote: this.options.initialValue,
        tags: this.tags,
      },
      pool,
    );
  }

  private returns(pool: JoesAutopoolsPoolSnapshot) {
    const fixedReturns =
      (this.options.fixedApr * (pool.timestamp - this.startTime)) /
      SECONDS_IN_YEAR;
    const pos = this.autoPool!.snapshot;
    if (this.options.fixedToken === 'base') {
      const valueQuote = pos.valueInQuote;
      const fixed = this.initial.base * fixedReturns;
      const debt = this.initial.base + fixed;
      const variable = valueQuote - debt * pool.price - this.initial.quote; // in quote
      return {
        fixed,
        fixedReturns: fixed / this.initial.base,
        variable,
        variableReturns: variable / this.initial.quote,
      };
    } else {
      const valueBase = pos.valueInQuote / pool.price;
      const fixed = this.initial.quote * fixedReturns;
      const debt = this.initial.quote + fixed;
      const variable = valueBase - debt / pool.price - this.initial.base; // in base
      return {
        fixed,
        fixedReturns: fixed / this.initial.quote,
        variable,
        variableReturns: variable / this.initial.base,
      };
    }
  }

  public fixedToken() {
    return this.options.fixedToken;
  }
  public variableToken() {
    return this.options.fixedToken === 'base' ? 'quote' : 'base';
  }

  private async log(pool: JoesAutopoolsPoolSnapshot) {
    const poolSnapshot = this.autoPool!.snapshot;

    if (isNaN(poolSnapshot.valueInBase)) throw new Error('Found a NAN!!!');
    const { fixed, fixedReturns, variable, variableReturns } =
      this.returns(pool);
    // console.log({ fixed, fixedReturns, variable, variableReturns })
    const firstLog = pool.timestamp === this.startTime;
    const log: any = {
      tags: this.tags,
      fields: {
        fixedEarning: fixed,
        fixedReturns,
        variableEarnings: variable,
        variableReturns,
        ...poolSnapshot,
      },
      timestamp: new Date(pool.timestamp * 1000),
    };
    if (!firstLog) {
      log.fields.variableApr =
        (variableReturns * SECONDS_IN_YEAR) / (pool.timestamp - this.startTime);
      log.fields.fixedApr =
        (fixedReturns * SECONDS_IN_YEAR) / (pool.timestamp - this.startTime);
    }
    this.series.push({
      ...this.tags,
      fixedEarning: fixed,
      fixedReturns,
      variableEarnings: variable,
      variableReturns,
      ...poolSnapshot,
    });

    try {
      await Log.writePointBatched(log);
    } catch (e) {
      console.log(e);
      console.log(log);
      throw new Error('INFLUX ERROR');
    }
  }

  private async wrapup(pool: JoesAutopoolsPoolSnapshot) {
    console.log('wrapup', this.tags.start);
    const { fixed, fixedReturns, variable, variableReturns } =
      this.returns(pool);
    const fields = {
      priceDiff: pool.price / this.initial.price,
      fixedEarning: fixed,
      fixedReturns,
      variableEarnings: variable,
      variableReturns,
      fixedApr:
        (fixedReturns * SECONDS_IN_YEAR) / (pool.timestamp - this.startTime),
      variableApr:
        (variableReturns * SECONDS_IN_YEAR) / (pool.timestamp - this.startTime),
    };
    Summary.writePoint({
      tags: this.tags,
      fields,
      timestamp: new Date(pool.timestamp * 1000),
    });
    this.summary = {
      ...this.tags,
      ...fields,
      end: new Date(pool.timestamp * 1000),
    };
  }
}
