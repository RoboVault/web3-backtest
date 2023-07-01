import { Measurement, Schema } from '../../../lib/utils/timeseriesdb.js';
import {
  Uni3Position,
  Uni3PositionManager,
} from '../../../lib/protocols/UNIV3PositionManager.js';
import { Uni3Snaphot } from '../../../lib/datasource/univ3Dex.js';
import { stringify } from 'csv-stringify/sync';
import fs from 'fs/promises';
import { ethers } from 'ethers';
import { VelodromeRouterAbi } from '../../../lib/abis/VelodromeRouter.js';
import { toBigNumber, toNumber } from '../../../lib/utils/utility.js';

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
const VELODROME_ROUTER = '0x9c12939390052919aF3155f41Bf4160Fd3666A6f';

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
  public pos!: Uni3Position;
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
  ) {
    this.highest = initial;
    // this.symbol = 'WETH/USDC'
  }

  public pool(data: Uni3Snaphot) {
    console.log(`getPool`);
    console.log(data.data.uni3);
    return data.data.uni3.find((p) => p.symbol === this.poolSymbol)!;
  }

  public poolIndex(data: Uni3Snaphot) {
    return data.data.velodrome.findIndex((p) => p.symbol === this.poolSymbol)!;
  }

  private fromNumber(amount: number, decimals: number) {
    return amount * 10 ** decimals;
  }

  private router() {
    const provider = new ethers.providers.JsonRpcProvider(RPC);
    return new ethers.Contract(
      VELODROME_ROUTER,
      VelodromeRouterAbi as any,
      provider,
    );
  }

  public async process(uni: Uni3PositionManager, data: Uni3Snaphot) {
    if (!this.pool(data)) {
      console.log('missing data for ' + this.name);
      return;
    }
    // open the first position
    if (!this.pos) {
      const pool = this.pool(data);
      // const poolIndex = this.poolIndex(data)
      const prices = [pool.tokens[0].price, pool.tokens[1].price];
      const decimals = [pool.tokens[0].decimals, pool.tokens[1].decimals];
      console.log(prices);
      console.log(pool.tokens[0].symbol);
      console.log(pool.tokens[1].symbol);
      let [pos, idle] = await uni.addLiquidity(pool.symbol, this.initial, 0);
      // //let [pos, idle] = await velodrome.addLiquidity(this.poolSymbol, this.initial, 1)
      // this.pos = pos
      // this.idle = idle
      // this.start = data.timestamp
      // this.lastHarvest = this.start
      // //this.idle = this.initial - this.pos.valueUsd
    }

    if (data.timestamp - this.lastHarvest >= HARVEST_PERIOD) {
      await this.harvest(data);
    }

    // always log data
    await this.log(data);
  }

  private estTotalAssets(data: Uni3Snaphot) {
    return 0; //this.claimed + this.pos.valueUsd + this.idle
  }

  private async harvest(data: Uni3Snaphot) {
    const pool = this.pool(data);
    const claimed = await this.pos.claim(pool);
    this.claimed += claimed;
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
        ...poolSnap,
        highest: this.highest,
        aum: totalAssets,
        profit,
      },
      timestamp: new Date(data.timestamp * 1000),
    };
    if (this.count++ % 24 === 0) {
      this.count = 0;
      if (apy !== 0) log.fields.apy = apy;
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
      //lpAmount: this.pos.lpAmount,
      ...tokens,
      ...prices,
      ...this.pos.snapshot,
    });
  }

  public async end(uni: Uni3PositionManager, data: Uni3Snaphot) {
    // this.idle = this.idle + await uni.close(this.pos)
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
  private uni = new Uni3PositionManager();
  private lastData!: Uni3Snaphot;
  // private aaveManager = new AAVEPositionManager()
  // private farm = new CamelotFarm()
  private strategies: SingleSidedUniswap[] = [];
  constructor() {
    const strategies = [
      {
        initialInvestment: 10_000,
        name: 'A: UNI3-LUSD/USDC 0.05%',
        pool: 'UNI3-LUSD/USDC 0.05%',
      },
      // { initialInvestment: 10_000, name: 'A: sAMM-LUSD/MAI', pool: 'sAMM-LUSD/MAI' },
      // { initialInvestment: 10_000, name: 'A: sAMM-USD+/LUSD', pool: 'sAMM-USD+/LUSD' }
    ];
    this.strategies = strategies.map(
      (s) => new SingleSidedUniswap(s.name, s.pool, s.initialInvestment),
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
    fs.writeFile('./velo_ss.csv', csv);

    const series = this.strategies.map((s) => s.series).flat();
    const seriesCsv = stringify(series, { header: true });
    fs.writeFile('./velo_ss_series.csv', seriesCsv);
  }

  public async onData(snapshot: Uni3Snaphot) {
    this.lastData = snapshot;
    // console.log('onData')
    this.uni.update(snapshot);

    // Process the strategy
    for (const strat of this.strategies) {
      await wait(1);
      await strat.process(this.uni, snapshot);
    }
  }
}
