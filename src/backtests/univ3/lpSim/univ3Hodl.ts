import { Uni3Snaphot } from '../../../lib/datasource/univ3Dex.js';
import {
  UniV3Position,
  UniV3PositionManager,
} from '../../../lib/protocols/UNIV3PositionManager.js';
import { Log, Summary } from './models.js';
import { Stats } from './stats.js';

const SECONDS_IN_DAY = 60 * 60 * 24;
const HARVEST_PERIOD = 60 * 60 * 24; // 1 day
const TWO_WEEKS = 60 * 60 * 24 * 14;
const ONE_YEAR = 60 * 60 * 24 * 365;

type StrategyConfig = {
  name: string;
  poolSymbol: string;
  initial: number;
  rangeSpread: number;
  priceOffset : number;
  priceToken: number;
  fixedSlippage: number;
  period: number;
};

export class UniV3Hodl {
  public pos!: UniV3Position;
  public expired = false;
  public start!: number;
  public highest: number;
  public lastHarvest: number = 0;
  public claimed = 0;
  public idle: number = 0; // idle assets
  public maxDrawdown = 0;
  public series: any[] = [];
  public tags: any = {};
  public summary: any;

  public token0start: number = 0;
  public token1start: number = 0;
  public token0end: number = 0;
  public token1end: number = 0;

  public startPrice: number = 0;
  public endPrice: number = 0;

  public rebalanceCount = 0;
  public gasCosts = 0;
  public tokenIndex: number = 0;
  public config: StrategyConfig;

  constructor(config: StrategyConfig) {
    this.config = config;
    this.highest = config.initial;
    this.tokenIndex = config.priceToken == 0 ? 1 : 0;
  }

  public async process(uni: UniV3PositionManager, data: Uni3Snaphot) {
    if (this.expired) return;

    if (!this.pool(data)) {
      console.log('missing data for ' + this.config.name);
      return;
    }

    // open the first position
    if (!this.pos) {
      console.log('openning the first position');
      this.start = data.timestamp;
      const pool = this.pool(data);
      this.pos = uni.open(
        this.config.initial / 2,
        pool.close * (1 + this.config.priceOffset) * (1 - this.config.rangeSpread),
        pool.close * (1 + this.config.priceOffset) / (1 - this.config.rangeSpread),
        this.config.priceToken,
        this.config.poolSymbol,
      );
      this.pos.valueUsd = this.config.initial; //hack
      this.token0start = this.pos.token0Bal;
      this.token1start = this.pos.token1Bal;
      this.startPrice = pool.close;
      console.log("Token 0 Bal " + this.pos.token0Bal)
      console.log("Token 1 Bal " + this.pos.token1Bal)

    }

    if (data.timestamp - this.lastHarvest >= HARVEST_PERIOD) {
      await this.harvest(data);
    }
    // always log data
    await this.log(uni, data);

    const daysElapsed = (data.timestamp - this.start) / SECONDS_IN_DAY;
    if (daysElapsed > this.config.period) {
      this.expired = true;
      console.log('strategy expired');
      await this.end(uni, data);
    }
  }

  public pool(data: Uni3Snaphot) {
    return data.data.univ3.find((p) => p.symbol === this.config.poolSymbol)!;
  }

  public poolIndex(data: Uni3Snaphot) {
    return data.data.velodrome.findIndex(
      (p) => p.symbol === this.config.poolSymbol,
    )!;
  }

  private estTotalAssets(data: Uni3Snaphot) {
    const result = this.idle + this.pos.valueUsd;
    return result;
  }

  private async harvest(data: Uni3Snaphot) {
    this.claimed = this.pos.claimed;
    this.lastHarvest = data.timestamp;
  }

  private apy(data: Uni3Snaphot) {
    const elapsed = data.timestamp - this.start;
    if (elapsed < TWO_WEEKS) return 0;
    const totalAssets = this.estTotalAssets(data);
    const apy = (totalAssets / this.config.initial) ** (ONE_YEAR / elapsed) - 1;
    return apy;
  }

  private apr(data: Uni3Snaphot) {
    const elapsed = data.timestamp - this.start;
    return (
      (this.estTotalAssets(data) / this.config.initial - 1) /
      (elapsed / ONE_YEAR)
    );
  }

  public async log(mgr: UniV3PositionManager, data: Uni3Snaphot) {
    const tokens: any = {};
    const prices: any = {};
    const pool = this.pool(data);
    pool.tokens.forEach((token, i) => {
      tokens[`token${i}`] = token.symbol;
      prices[`price${i}`] = token.price;
    });
    const totalAssets = this.estTotalAssets(data);
    if (totalAssets === 0) {
      console.log('total assets === 0???');
      return;
    }
    this.highest = this.highest < totalAssets ? totalAssets : this.highest;
    const drawdown = -(this.highest - totalAssets) / this.highest;
    const { tokens: _t, prices: _p, reserves: _r, ...poolSnap } = pool as any;
    this.maxDrawdown = Math.max(this.maxDrawdown, -drawdown);
    const profit = totalAssets - this.config.initial;
    this.tags = {
      name: this.config.name,
      pool: this.config.poolSymbol,
      ...tokens,
      rangeSpread: (this.config.rangeSpread * 100).toFixed(2),
    };
    const apy = this.apy(data);
    const log = {
      tags: this.tags,
      fields: {
        strategy: this.config.name,
        ...this.pos.snapshot,
        ...prices,
        rewards: this.claimed,
        drawdown,
        //...poolSnap,
        highest: this.highest,
        apy, // TODO: get APY
        aum: totalAssets,
        minRange: this.pos.minRange,
        maxRange: this.pos.maxRange,
        gasCosts: this.gasCosts,
        profit,
      },
      timestamp: new Date(data.timestamp * 1000),
    };
    if (apy !== 0) log.fields.apy = apy;

    try {
      await Log.writePoint(log);
    } catch (e) {
      console.log('log error');
      await Log.writePoint(log);
    }
    this.series.push({
      name: this.config.name,
      timestamp: data.timestamp,
      aum: totalAssets,
      rewards: this.claimed,
      minRange: this.pos.minRange,
      maxRange: this.pos.maxRange,
      token0InLp: this.pos.token0Bal,
      token1InLp: this.pos.token1Bal,
      feeToken0: this.pos.feeToken0T,
      feeToken1: this.pos.feeToken1T,
      rangeSpread: this.config.rangeSpread,
      gasCosts: this.gasCosts,
      lpAmount: this.pos.lpAmount,
      ...tokens,
      ...prices,
      ...this.pos.snapshot,
    });
  }

  public async end(uni: UniV3PositionManager, data: Uni3Snaphot) {
    const totalAssets = this.estTotalAssets(data);
    console.log('Strategy closing position', this.estTotalAssets(data));
    this.token0end = this.pos.token0Bal;
    this.token1end = this.pos.token1Bal;
    const pool = this.pool(data);
    this.endPrice = pool.close;
    const close = await uni.close(this.pos);
    this.idle = this.idle + close;

    const variance = Stats.variance(this.series.map((e) => e.aum));
    const stddev = Stats.stddev(variance);

    // Create summary
    const toDate = (time: number) =>
      new Date(time * 1000)
        .toISOString()
        .replace(':00.000Z', '')
        .replace('T', ' ');

    if (isNaN(this.apy(data))) {
      console.log(this.apy(data));
      process.exit();
    }

    this.summary = {
      name: this.config.name,
      symbol: this.config.poolSymbol,
      initial: this.config.initial,
      aum: totalAssets,
      roi: (totalAssets - this.config.initial) / this.config.initial,
      apy: this.apy(data),
      apr: this.apr(data),
      drawdown: this.maxDrawdown,
      rewards: this.claimed,
      start: toDate(this.start),
      end: toDate(data.timestamp),
      startPrice : this.startPrice,
      endPrice : this.endPrice,
      startBalance0 : this.token0start,
      startBalance1 : this.token1start,
      endBalance0 : this.token0end,
      endBalance1 : this.token1end,

      daysElapsed: (data.timestamp - this.start) / (60 * 60 * 24), // days
      variance,
      rangeSpread: this.config.rangeSpread,
      stddev,
      rebalanceCount: this.rebalanceCount,
    };
    await Summary.writePoint({
      tags: this.tags,
      fields: this.summary,
      timestamp: new Date(data.timestamp * 1000),
    });
  }
}
