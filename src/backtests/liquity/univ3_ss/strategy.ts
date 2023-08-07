import { Measurement, Schema } from '../../../lib/utils/timeseriesdb.js';
import {
  UniV3Position,
  UniV3PositionManager,
} from '../../../lib/protocols/UniV3PositionManager.js';
import { Uni3Snaphot } from '../../../lib/datasource/univ3Dex.js';
import { stringify } from 'csv-stringify/sync';
import fs from 'fs/promises';

interface ILogAny extends Schema {
  tags: any;
  fields: any;
}

const Log = new Measurement<ILogAny, any, any>('ssc_lusd_strategy');

const HARVEST_PERIOD = 60 * 60 * 24; // 1 day
const TWO_WEEKS = 60 * 60 * 24 * 14;
const ONE_YEAR = 60 * 60 * 24 * 365;

const RPC =
  'https://optimism-mainnet.infura.io/v3/5e5034092e114ffbb3d812b6f7a330ad';
//const VELODROME_ROUTER = "0x9c12939390052919aF3155f41Bf4160Fd3666A6f"

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

class SingleSidedUniswap {
  public pos!: UniV3Position;
  public start!: number;
  public highest: number;
  public lastHarvest: number = 0;
  public claimed = 0;
  public idle: number = 0; // idle assets
  public maxDrawdown = 0;
  public series: any[] = [];
  count = 0;

  constructor(
    public name: string,
    public poolSymbol: string,
    public initial: number,
    public rangeSpread: number,
    public priceToken: number,
  ) {
    this.highest = initial;
    // this.symbol = 'WETH/USDC'
  }

  public pool(data: Uni3Snaphot) {
    return data.data.univ3.find((p) => p.symbol === this.poolSymbol)!;
  }

  public poolIndex(data: Uni3Snaphot) {
    return data.data.velodrome.findIndex((p) => p.symbol === this.poolSymbol)!;
  }

  private fromNumber(amount: number, decimals: number) {
    return amount * 10 ** decimals;
  }

  // private router() {
  // 	const provider = new ethers.providers.JsonRpcProvider(RPC)
  // 	return new ethers.Contract(VELODROME_ROUTER, VelodromeRouterAbi as any, provider)
  // }

  public async process(uni: UniV3PositionManager, data: Uni3Snaphot) {
    if (!this.pool(data)) {
      console.log('missing data for ' + this.name);
      return;
    }
    // open the first position
    if (!this.pos) {
      const pool = this.pool(data);
      this.pos = uni.open(
        this.initial / pool.close,
        pool.close * (1 - this.rangeSpread),
        pool.close * (1 + this.rangeSpread),
        this.priceToken,
        this.poolSymbol,
      );
      this.start = data.timestamp;
    }

    if (data.timestamp - this.lastHarvest >= HARVEST_PERIOD) {
      await this.harvest(data);
    }

    // always log data
    await this.log(data);
  }

  private estTotalAssets(data: Uni3Snaphot) {
    return this.pos.valueUsd + this.idle;
  }

  private async harvest(data: Uni3Snaphot) {
    this.claimed = this.pos.claimed;
    this.lastHarvest = data.timestamp;
  }

  private apy(data: Uni3Snaphot) {
    const elapsed = data.timestamp - this.start;
    if (elapsed < TWO_WEEKS) return 0;
    const totalAssets = this.estTotalAssets(data);
    const apy = (totalAssets / this.initial) ** (ONE_YEAR / elapsed) - 1;
    return apy;
  }

  private apr(data: Uni3Snaphot) {
    const elapsed = data.timestamp - this.start;
    return (
      (this.estTotalAssets(data) / this.initial - 1) / (elapsed / ONE_YEAR)
    );
  }

  public async log(data: Uni3Snaphot) {
    const tokens: any = {};
    const prices: any = {};
    const pool = this.pool(data);
    pool.tokens.forEach((token, i) => {
      tokens[`token${i}`] = token.symbol;
      prices[`price${i}`] = token.price;
    });
    const totalAssets = this.estTotalAssets(data);
    if (totalAssets === 0) return;
    this.highest = this.highest < totalAssets ? totalAssets : this.highest;
    const drawdown = -(this.highest - totalAssets) / this.highest;
    const { tokens: _t, prices: _p, reserves: _r, ...poolSnap } = pool as any;
    this.maxDrawdown = Math.max(this.maxDrawdown, -drawdown);
    const profit = totalAssets - this.initial;

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
        //...poolSnap,
        highest: this.highest,
        apy, // TODO: get APY
        aum: totalAssets,
        profit,
      },
      timestamp: new Date(data.timestamp * 1000),
    };
    if (apy !== 0) log.fields.apy = apy;

    try {
      await Log.writePoint(log);
    } catch (e) {
      await wait(10);
      await Log.writePoint(log);
    }

    this.series.push({
      name: this.name,
      timestamp: data.timestamp,
      aum: totalAssets,
      rewards: this.claimed,
      fees: this.pos.snapshot.fees,
      lpAmount: this.pos.lpAmount,
      ...tokens,
      ...prices,
      ...this.pos.snapshot,
    });
  }

  public async end(uni: UniV3PositionManager, data: Uni3Snaphot) {
    const close = await uni.close(this.pos);
    console.log(`close: ${close}`);
    console.log(`idle: ${this.idle}`);
    this.idle = this.idle + close;
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

export class SingleSidedUniswapStrategy {
  private uni = new UniV3PositionManager();
  private lastData!: Uni3Snaphot;
  private strategies: SingleSidedUniswap[] = [];
  constructor() {
    const strategies = Array.from(Array(6).keys()).map((i) => {
      const n = i + 1;
      return {
        initialInvestment: 100_000,
        name: `#${n}: UNI3-LUSD/USDC ${n}%`,
        pool: 'Univ3 LUSD/USDC 0.05%',
        rangeSpread: 0.01 * n,
        priceToken: 0,
      };
    });
    this.strategies = strategies.map(
      (s) =>
        new SingleSidedUniswap(
          s.name,
          s.pool,
          s.initialInvestment,
          s.rangeSpread,
          s.priceToken,
        ),
    );
  }

  public async before() {
    await Log.dropMeasurement();
  }

  public async after() {
    const summary = await Promise.all(
      this.strategies.map((s) => s.end(this.uni, this.lastData)),
    );
    console.log(summary);
    const csv = stringify(summary, { header: true });
    fs.writeFile('./univ3_ss.csv', csv);

    const series = this.strategies.map((s) => s.series).flat();
    const seriesCsv = stringify(series, { header: true });
    fs.writeFile('./univ3_ss_series.csv', seriesCsv);
  }

  public async onData(snapshot: Uni3Snaphot) {
    this.lastData = snapshot;
    // console.log('onData')
    this.uni.processPoolData(snapshot);

    // Process the strategy
    for (const strat of this.strategies) {
      await wait(1);
      await strat.process(this.uni, snapshot);
    }
  }
}
