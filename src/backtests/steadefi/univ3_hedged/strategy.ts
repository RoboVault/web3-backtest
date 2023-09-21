import { Schema } from '../../../lib/utils/timeseriesdb.js';
import { InfluxBatcher } from '../../../lib/utils/influxBatcher.js';
import {
  UniV3Position,
  UniV3PositionManager,
  tokensForStrategy
} from '../../../lib/protocols/UNIV3PositionManager.js'//'../../../lib/protocols/UniV3PositionManager.js';
import { Uni3Snaphot } from '../../../lib/datasource/univ3Dex.js';
import { stringify } from 'csv-stringify/sync';
import fs from 'fs/promises';
import { AAVEPosition, AAVEPositionManager } from '../../../lib/protocols/AavePositionManager.js';

interface ILogAny extends Schema {
  tags: any;
  fields: any;
}

const Log = new InfluxBatcher<ILogAny, any, any>('hedged_camelot3_strategy');
const Rebalance = new InfluxBatcher<ILogAny, any, any>('hedged_camelot3_rebalance');

const HARVEST_PERIOD = 60 * 60 * 24; // 1 day
const TWO_WEEKS = 60 * 60 * 24 * 14;
const ONE_YEAR = 60 * 60 * 24 * 365;

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

const REBALANCE_COST = 1;
const HARVEST_COST = 0;

class HedgedUniswap {
  public pos!: UniV3Position
  public start!: number
  public highest: number
  public lastHarvest: number = 0
  public claimed = 0;
  public idle: number = 0 // idle assets
  public maxDrawdown = 0
  public series: any[] = []
  count = 0;
  public aaveMgr: AAVEPositionManager = new AAVEPositionManager()
  public aave: AAVEPosition = this.aaveMgr.create() // todo: type this
  
  public rebalanceCount = 0
  public startPrice = 0
  public gasCosts = 0
  public tokenIndex: number = 0

  constructor(
    public name: string,
    public poolSymbol: string,
    public initial: number,
    public rangeSpread: number,
    public priceToken: number,
    public collatRatio: number,
    public debtRatioRange: number
  ) {
    this.highest = initial;
    this.tokenIndex = priceToken == 0 ? 1 : 0
  }

  public pool(data: Uni3Snaphot) {
    return data.data.univ3.find((p) => p.symbol === this.poolSymbol)!;
  }

  public poolIndex(data: Uni3Snaphot) {
    return data.data.velodrome.findIndex((p) => p.symbol === this.poolSymbol)!;
  }

  private calcLenderAmounts(totalAssets: number, data: Uni3Snaphot) {
    const pool = this.pool(data);
    const lendUSD = totalAssets * (1 / (1 + this.collatRatio));
    const borrowInUSD = totalAssets - lendUSD;
    const lend = lendUSD / (pool.tokens[this.tokenIndex].price);

    //const price = this.tokenIndex ? pool.tokens[0].price/pool.tokens[1].price : pool.tokens[1].price/pool.tokens[0].price
    // const borrow =
    //   borrowInUSD / pool.tokens[this.priceToken].price;
    // TODO: Logic should change if we are using Token0 or Token1, not just pool.close
    const borrow =
      borrowInUSD / pool.close;
    return { borrow, lend };
  }

  public borrow(data: Uni3Snaphot) {
    // const pool = this.pool(data);
    // TODO: Symbol on pool is WETH which leads me to hard code this part,
    const borrow = this.aave.borrowed(
      'WETH' //pool.tokens[this.priceToken].symbol,
    );
    
    return borrow;
  }

  private calcDebtRatio(mgr: UniV3PositionManager, pos: UniV3Position, data: Uni3Snaphot): number {
    if (!this.pos) return 1;
    if(!this.aave.borrowed('WETH')) return 1
    const pool = this.pool(data)
    const result = tokensForStrategy(pos.entryPrice, pool.close, pos.minRange, pos.maxRange, pos.amount)
    const shortInLP = result[this.priceToken]
    const borrowedEth = this.aave.borrowed('WETH')
    return borrowedEth / shortInLP;
  }

  public async rebalanceDebt(
    mgr: UniV3PositionManager,
    aave: AAVEPositionManager,
    data: Uni3Snaphot,
  ) {
    this.rebalanceCount++;
    // console.log('rebalanceDebt', new Date(data.timestamp * 1000).toISOString());

    // Close this position
    const totalAssets = this.estTotalAssets(data);
    const mgrClose = await mgr.close(this.pos);
    const pool = this.pool(data);
    await aave.close(this.aave);
    this.idle = totalAssets

    // Future: Account for trading fees and slippage on rebalances

    // Update Lend
    const { borrow, lend } = this.calcLenderAmounts(totalAssets, data);
    const usdLeft = (borrow*pool.close)*2

    this.aave = aave.create();
    this.aave.lend(pool.tokens[this.tokenIndex].symbol, lend)
    // TODO: Symbol on pool is WETH which leads me to hard code this part
    this.aave.borrow('WETH', borrow)
    this.pos = mgr.open(
      usdLeft,
      pool.close * (1 - this.rangeSpread),
      pool.close * (1 + this.rangeSpread),
      this.priceToken,
      this.poolSymbol,
    )
    
    this.pos.valueUsd = usdLeft
    this.idle = 0
    const totalAssetsNew = this.estTotalAssets(data);
    // console.log(totalAssets, totalAssetsNew)
    if((totalAssets-totalAssetsNew)>0){
      this.idle = totalAssets-totalAssetsNew
    }
    
    // console.log(`this.idle: ${this.idle}`)
    this.gasCosts += REBALANCE_COST;
    Rebalance.writePoint({
      tags: { strategy: this.name },
      fields: {
        gas: REBALANCE_COST,
      },
      timestamp: new Date(data.timestamp * 1000),
    });
  }

  private async checkRebalance(
    mgr: UniV3PositionManager,
    aave: AAVEPositionManager,
    data: Uni3Snaphot,
  ) {
    const debtRatio = this.calcDebtRatio(mgr, this.pos, data);
    if (
      debtRatio > 1 + this.debtRatioRange ||
      debtRatio < 1 - this.debtRatioRange
    ) {
      // console.log('\n************* rebalancing debt! *************');
      // console.log(`debt ratio: ${(debtRatio * 100).toFixed(2)}`);
      // console.log(`before rebalance: ${this.estTotalAssets(data)}`)
      await this.rebalanceDebt(mgr, aave, data);
      // console.log(`after rebalance: ${this.estTotalAssets(data)}`)
    }
  }

  public async process(uni: UniV3PositionManager, data: Uni3Snaphot, aave: AAVEPositionManager) {
    if (!this.pool(data)) {
      console.log('missing data for ' + this.name);
      return;
    }
    // open the first position
    if (!this.pos) {
      const pool = this.pool(data);
      const result = this.calcLenderAmounts(this.initial, data)
      const lend = result.lend
      const borrow = result.borrow
      const lendUsd = lend
      console.log(`lend: ${lend}`)
      console.log(`borrow: ${borrow}`)
      console.log(`initial: ${this.initial}`)
      const usdLeft = (borrow*pool.close)*2
      this.aave = aave.create()
      //TODO: Pool symbol is WETH, which lead me to hard code this
      this.aave.lend(pool.tokens[this.tokenIndex].symbol, lend)
      this.aave.borrow('WETH', borrow)
      console.log(`first position value: ${usdLeft}`)
      this.pos = uni.open(
        usdLeft,
        pool.close * (1 - this.rangeSpread),
        pool.close * (1 + this.rangeSpread),
        this.priceToken,
        this.poolSymbol,
      );
      this.start = data.timestamp;
      this.pos.valueUsd = usdLeft
      this.idle = 0
    } else {
      await this.checkRebalance(uni, aave, data)
    }

    if (data.timestamp - this.lastHarvest >= HARVEST_PERIOD) {
      await this.harvest(data);
    }
    // always log data
    await this.log(uni, data);
  }

  private estTotalAssets(data: Uni3Snaphot) {

    const pool = this.pool(data);
    // TODO: Symbol on pool is WETH which leads me to hard code this part,
    // TODO: this logic should change if we are starting with token0 or token1
    const result = 
      this.idle + 
      this.pos.valueUsd + 
      this.aave.lent(pool.tokens[this.tokenIndex].symbol) - 
      (this.aave.borrowed('WETH') *  pool.close)
    // if (isNaN(result)) {
    //   console.log('is is nan')
    //   console.log(this.idle)
    //   console.log(this.pos.valueUsd)
    //   console.log(this.aave.lent(pool.tokens[this.tokenIndex].symbol))
    //   process.exit()
    // }
    return result
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
      console.log('total assets === 0???')
      return
    }
    this.highest = this.highest < totalAssets ? totalAssets : this.highest;
    const drawdown = -(this.highest - totalAssets) / this.highest;
    const { tokens: _t, prices: _p, reserves: _r, ...poolSnap } = pool as any;
    this.maxDrawdown = Math.max(this.maxDrawdown, -drawdown);
    const profit = totalAssets - this.initial;
    const debtRatio = this.calcDebtRatio(mgr, this.pos, data)

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
        debtRatioRange: this.debtRatioRange,
        rangeSpread: this.rangeSpread,
        minRange: this.pos.minRange,
        maxRange: this.pos.maxRange,
        debtRatio,
        gasCosts: this.gasCosts,
        profit
      },
      timestamp: new Date(data.timestamp * 1000),
    };
    if (apy !== 0) log.fields.apy = apy;

    try {
      await Log.writePoint(log);
    } catch (e) {
      console.log('log error')
      await wait(10);
      await Log.writePoint(log);
    }
    this.series.push({
      name: this.name,
      timestamp: data.timestamp,
      aum: totalAssets,
      rewards: this.claimed,
      minRange: this.pos.minRange,
      maxRange: this.pos.maxRange,
      debtRatio,
      collateral : this.aave.lent(pool.tokens[this.tokenIndex].symbol),
      debt : (this.aave.borrowed('WETH') *  pool.close),
      token0InLp : this.pos.token0Bal,
      token1InLp : this.pos.token1Bal,
      feeToken0 : this.pos.feeToken0T,
      feeToken1 : this.pos.feeToken1T,
      debtRatioRange: this.debtRatioRange,
      rangeSpread: this.rangeSpread,
      gasCosts: this.gasCosts,
      lpAmount: this.pos.lpAmount,
      ...tokens,
      ...prices,
      ...this.pos.snapshot,
    });
  }

  public async end(uni: UniV3PositionManager, data: Uni3Snaphot) {

    const totalAssets = this.estTotalAssets(data)
    console.log('Strategy closing position', this.estTotalAssets(data));
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
    return {
      name: this.name,
      symbol: this.poolSymbol,
      initial: this.initial,
      aum: totalAssets,
      roi: (totalAssets - this.initial) / this.initial,
      apy: this.apy(data),
      apr: this.apr(data),
      drawdown: this.maxDrawdown,
      rewards: this.claimed,
      start: toDate(this.start),
      end: toDate(data.timestamp),
      daysElapsed: (data.timestamp - this.start) / (60 * 60 * 24), // days
      variance,
      rangeSpread: this.rangeSpread,
      debtRatioRange: this.debtRatioRange,
      stddev,
      rebalanceCount: this.rebalanceCount,
      collatRatio: this.collatRatio,
    };
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class HedgedUniswapStrategy {
  private uni = new UniV3PositionManager();
  private lastData!: Uni3Snaphot;
  private lender = new AAVEPositionManager();
  private strategies: HedgedUniswap[] = [];
  constructor() {
    const strategies = Array.from(Array(10).keys()).map(i => {
      const n = i + 1
      return {
        initialInvestment: 100_000,
        name: `#${n}: Camelotv3 WETH/USDC ${n*3}%`,
        pool: 'Camelotv3 WETH/USDC 0%',
        rangeSpread: 0.05 * n,
        priceToken: 0,
        collatRatio: 0.6,
        debtRatioRange: 0.05
      }
    })
    this.strategies = strategies.map(
      (s) =>
        new HedgedUniswap(
          s.name,
          s.pool,
          s.initialInvestment,
          s.rangeSpread,
          s.priceToken,
          s.collatRatio,
          s.debtRatioRange
        ),
    );
  }

  public async before() {
    await Log.dropMeasurement();
  }

  public async after() {
    console.log('end date:', new Date(this.lastData.timestamp * 1000).toISOString())
    await Log.exec(true)
    await Rebalance.exec(true)
    const summary = await Promise.all(
      this.strategies.map((s) => s.end(this.uni, this.lastData)),
    );
    console.log(summary);
    const csv = stringify(summary, { header: true });
    fs.writeFile('./camelotv3_hedged.csv', csv);

    const series = this.strategies.map((s) => s.series).flat();
    const seriesCsv = stringify(series, { header: true });
    fs.writeFile('./camelotv3_hedged_series.csv', seriesCsv);
  }

  public async onData(snapshot: Uni3Snaphot) {
    if (snapshot.data.aave && snapshot.data.univ3) {
      this.lastData = snapshot;

      // Aave Position Update
      await this.lender.update({
        timestamp: snapshot.timestamp,
        data: snapshot.data.aave as any,
      });

      this.uni.processPoolData(snapshot);

      // Process the strategy
      for (const strat of this.strategies) {
        await strat.process(this.uni, snapshot, this.lender);
      }
    } else {
      console.log(Object.keys(snapshot.data), new Date(snapshot.timestamp * 1000).toISOString())
    }


  }
}
