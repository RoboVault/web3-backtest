import { Measurement, Schema } from '../../../lib/utils/timeseriesdb.js';
import {
  CurvePosition,
  CurvePositionManager,
} from '../../../lib/protocols/CurvePositionManager.js';
import { CurveSnaphot } from '../../../lib/datasource/curveDex.js';
import { stringify } from 'csv-stringify/sync';
import fs from 'fs/promises';

interface ILogAny extends Schema {
  tags: any;
  fields: any;
}

const Log = new Measurement<ILogAny, any, any>('ssc_lusd_strategy');

const HARVEST_PERIOD = 60 * 60 * 24; // 1 day
const TWO_WEEKS = 60 * 60 * 24 * 14;
const ONE_YEAR = 60 * 60 * 24 * 14;

class Stats {
  // Calculate the average of all the numbers
  static mean(values: number[]) {
    const mean = values.reduce((sum, current) => sum + current) / values.length;
    return mean;
  }

  // Calculate variance
  static variance(values: number[]) {
    const average = Stats.mean(values);
    const squareDiffs = values.map((value) => {
      const diff = value - average;
      return diff * diff;
    });
    const variance = Stats.mean(squareDiffs);
    return variance;
  }

  // Calculate stand deviation
  static stddev(variance: number) {
    return Math.sqrt(variance);
  }
}

class SingleSidedCurve {
  public pos!: CurvePosition;
  public start!: number;
  public highest: number;
  public lastHarvest: number = 0;
  public claimed = 0;
  public idle = 0; // idle assets
  public maxDrawdown = 0;
  public series: any[] = [];
  count = 0;

  constructor(
    public name: string,
    public tokenIndex: number,
    public poolSymbol: string,
    public initial: number,
  ) {
    this.highest = initial;
    // this.symbol = 'WETH/USDC'
  }

  public pool(data: CurveSnaphot) {
    return data.data.curve.find((p) => p.symbol === this.poolSymbol)!;
  }

  public async process(curve: CurvePositionManager, data: CurveSnaphot) {
    if (!this.pool(data)) {
      console.log('missing data for ' + this.name);
      return;
    }
    // open the first position
    if (!this.pos) {
      const pool = this.pool(data);
      const price = pool.tokens[this.tokenIndex].price;
      const amounts = pool.tokens.map((e, i) =>
        i === this.tokenIndex ? this.initial / price : 0,
      );
      console.log(price);
      console.log(pool.tokens[0].symbol);
      console.log(amounts);
      this.pos = await curve.addLiquidity(this.poolSymbol, amounts);
      this.start = data.timestamp;
      this.lastHarvest = this.start;
    }

    if (data.timestamp - this.lastHarvest >= HARVEST_PERIOD) {
      this.harvest(data);
    }

    // always log data
    await this.log(data);
  }

  private estTotalAssets(data: CurveSnaphot) {
    return this.claimed + this.pos.valueUsd + this.idle;
  }

  private harvest(data: CurveSnaphot) {
    const pool = this.pool(data);
    const claimed = this.pos.claim(pool);
    this.claimed += claimed;
    this.lastHarvest = data.timestamp;
  }

  private apy(data: CurveSnaphot) {
    const elapsed = data.timestamp - this.start;
    if (elapsed < TWO_WEEKS) return 0;
    const totalAssets = this.estTotalAssets(data);
    const profit = totalAssets - this.initial;
    const apy = ((totalAssets / this.initial) ^ (ONE_YEAR / elapsed)) - 1;
    return apy;
  }

  private apr(data: CurveSnaphot) {
    const elapsed = data.timestamp - this.start;
    return this.claimed / this.initial / (elapsed / ONE_YEAR);
  }

  public async log(data: CurveSnaphot) {
    const tokens: any = {};
    const prices: any = {};
    const pool = this.pool(data);
    pool.tokens.forEach((token, i) => {
      tokens[`token${i}`] = token.symbol;
      prices[`price${i}`] = token.price;
    });
    const totalAssets = this.estTotalAssets(data);
    this.highest = this.highest < totalAssets ? totalAssets : this.highest;
    const drawdown = -(this.highest - totalAssets) / this.highest;
    const { tokens: _t, prices: _p, reserves: _r, ...poolSnap } = pool as any;
    this.maxDrawdown = Math.max(this.maxDrawdown, -drawdown);

    const apy = this.apy(data);
    const log = {
      tags: {
        name: this.name,
        pool: this.poolSymbol,
        ...tokens,
      },
      fields: {
        strategy: this.name,
        ...this.pos.snapshot,
        ...prices,
        rewards: this.claimed,
        drawdown,
        ...poolSnap,
        highest: this.highest,
        aum: totalAssets,
      },
      timestamp: new Date(data.timestamp * 1000),
    };
    if (this.count++ % 24 === 0) {
      this.count = 0;
      if (apy !== 0) log.fields.apy = apy;
      // console.log(log)
      try {
        await Log.writePoint(log);
      } catch (e) {
        await wait(10);
        await Log.writePoint(log);
      }
    }

    this.series.push({
      name: this.name,
      timestamp: data.timestamp,
      aum: totalAssets,
      rewards: this.claimed,
      lpAmount: this.pos.lpAmount,
      ...tokens,
      ...prices,
      ...this.pos.snapshot,
    });
  }

  public async end(curve: CurvePositionManager, data: CurveSnaphot) {
    this.idle = await curve.close(this.pos, this.tokenIndex);
    console.log(this.idle);
    console.log('Strategy closing position', this.estTotalAssets(data));
    const variance = Stats.variance(this.series.map((e) => e.aum));
    const stddev = Stats.stddev(variance);

    // Create summary
    const toDate = (time: number) =>
      new Date(time * 1000)
        .toISOString()
        .replace(':00.000Z', '')
        .replace('T', ' ');
    return {
      name: this.name,
      symbol: this.poolSymbol,
      initial: this.initial,
      aum: this.estTotalAssets(data),
      roi: (this.estTotalAssets(data) - this.initial) / this.initial,
      apy: this.apy(data),
      apr: this.apr(data),
      drawdown: this.maxDrawdown,
      rewards: this.claimed,
      start: toDate(this.start),
      end: toDate(data.timestamp),
      daysElapsed: (data.timestamp - this.start) / (60 * 60 * 24), // days
      variance,
      stddev,
    };
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class SingleSidedCurveStrategy {
  private curve = new CurvePositionManager();
  private lastData!: CurveSnaphot;
  // private aaveManager = new AAVEPositionManager()
  // private farm = new CamelotFarm()
  private strategies: SingleSidedCurve[] = [];
  constructor() {
    const strategies = [
      {
        initialInvestment: 100_000,
        tokenIndex: 0,
        name: 'A: LUSD/3Pool',
        pool: 'LUSD3CRV-f',
      },
      {
        initialInvestment: 100_000,
        tokenIndex: 0,
        name: 'B: bLUSD/LUSD3',
        pool: 'bLUSDLUSD3-f',
      },
    ];
    this.strategies = strategies.map(
      (s) =>
        new SingleSidedCurve(s.name, s.tokenIndex, s.pool, s.initialInvestment),
    );
  }

  public async before() {
    await Log.dropMeasurement();
  }

  public async after() {
    const summary = await Promise.all(
      this.strategies.map((s) => s.end(this.curve, this.lastData)),
    );
    console.log(summary);
    const csv = stringify(summary, { header: true });
    fs.writeFile('./curve_ss.csv', csv);

    const series = this.strategies.map((s) => s.series).flat();
    const seriesCsv = stringify(series, { header: true });
    fs.writeFile('./curve_ss_series.csv', seriesCsv);
  }

  public async onData(snapshot: CurveSnaphot) {
    this.lastData = snapshot;
    // console.log('onData')
    this.curve.update(snapshot);

    // Process the strategy
    for (const strat of this.strategies) {
      // await wait(1)
      await strat.process(this.curve, snapshot);
    }
  }
}
