import { Measurement, Schema } from '../../../lib/utils/timeseriesdb.js';
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

const Log = new Measurement<ILogAny, any, any>('hedged_camelot3_strategy');
const Rebalance = new Measurement<ILogAny, any, any>('hedged_camelot3_strategy');

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

const REBALANCE_COST = 5;
const HARVEST_COST = 0;

class SingleSidedUniswap {
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

  private calcLenderAmounts(totalAssets: number, data: Uni3Snaphot) {
    const pool = this.pool(data);
    const lendUSD = totalAssets * (1 / (1 + this.collatRatio));
    const borrowInUSD = totalAssets - lendUSD;
    const lend = lendUSD / (pool.tokens[this.tokenIndex].price);
    //const price = this.tokenIndex ? pool.tokens[0].price/pool.tokens[1].price : pool.tokens[1].price/pool.tokens[0].price
    // const borrow =
    //   borrowInUSD / pool.tokens[this.priceToken].price;
    const borrow =
      borrowInUSD / pool.close;
    // console.log(`callend, pool.tokens[this.priceToken].price: ${pool.tokens[this.priceToken].price}`)
    // console.log(`callend, pool.close: ${pool.close}`)
    return { borrow, lend };
  }

  public borrow(data: Uni3Snaphot) {
    const pool = this.pool(data);
    const borrow = this.aave.borrowed(
      'ETH' //pool.tokens[this.priceToken].symbol,
    );
    
    return borrow;
  }

  private calcDebtRatio(mgr: UniV3PositionManager, pos: UniV3Position, data: Uni3Snaphot): number {
    if (!this.pos) return 1;
    if(!this.aave.borrowed('ETH')) return 1
    const pool = this.pool(data)
    //console.log(`pos.entryPrice: ${pos.entryPrice}`)
    //console.log(pool.tokens[this.priceToken].price, pos.minRange, pos.maxRange, pos.amount)
    const result = tokensForStrategy(pos.entryPrice, pool.close, pos.minRange, pos.maxRange, pos.amount)
    // console.log(result)
    // const result = tokensForStrategy(
    //   pos.minRange,
    //   pos.maxRange,
    //   pos.amount,
    //   pool.tokens[this.priceToken].price
    // )
    const shortInLP = result[this.priceToken]
    console.log(`shortInLP: ${shortInLP}`)
    console.log(`borrowed: ${this.aave.borrowed('ETH')}`)
    const borrowedEth = this.aave.borrowed('ETH')
    console.log(`borrowedEth: ${borrowedEth}`)
    console.log(`dr: ${borrowedEth / shortInLP}`)
    return borrowedEth / shortInLP;
  }

  public async rebalanceDebt(
    mgr: UniV3PositionManager,
    aave: AAVEPositionManager,
    data: Uni3Snaphot,
  ) {
    this.rebalanceCount++;
    console.log('rebalanceDebt', new Date(data.timestamp * 1000).toISOString());

    // Close this position
    const totalAssets = this.estTotalAssets(data);
    console.log(`rb, totalAssets: ${totalAssets}`)
    const mgrClose = await mgr.close(this.pos);
    const pool = this.pool(data);
    await aave.close(this.aave);
    this.idle = totalAssets
    
    // Calc total assets
    //const totalAssets = this.estTotalAssets(data);
    // compound rewards, subtract gas fees
    // this.farmRewards = 0;
    // this.compRewards = 0;
    //this.gasCosts = 0

    // Future: Account for trading fees and slippage on rebalances

    // Update Lend
    const { borrow, lend } = this.calcLenderAmounts(totalAssets, data);
    const usdLeft = (borrow*pool.close)*2

    this.aave = aave.create();
    this.aave.lend(pool.tokens[this.tokenIndex].symbol, lend)
    this.aave.borrow('ETH', borrow)
    console.log(`rebalance Debt open: ${usdLeft}`)
    this.pos = mgr.open(
      usdLeft,
      pool.close * (1 - this.rangeSpread),
      pool.close * (1 + this.rangeSpread),
      this.priceToken,
      this.poolSymbol,
    )
    // if(totalAssets > this.estTotalAssets(data)){
    //   this.idle = totalAssets - this.estTotalAssets(data)
    // } else {
    //   this.idle = 0
    // }
    this.idle = 0

    this.pos.valueUsd = usdLeft
    // if(totalAssets > this.estTotalAssets(data)){
    //   this.idle = totalAssets-this.estTotalAssets(data)
    // } else {
    this.idle = 0
    // }
    
    const totalAssetsNew = this.estTotalAssets(data);
    console.log(`rb, totalAssetsNew: ${totalAssetsNew}`)
    this.gasCosts += REBALANCE_COST;
    Rebalance.writePoint({
      tags: { strategy: this.name },
      fields: {
        gas: REBALANCE_COST,
      },
      timestamp: new Date(data.timestamp * 1000),
    });
  }

  private delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
  }

  private async checkRebalance(
    mgr: UniV3PositionManager,
    aave: AAVEPositionManager,
    data: Uni3Snaphot,
  ) {
    const debtRatio = this.calcDebtRatio(mgr, this.pos, data);
    console.log(`debt ratio: ${this.calcDebtRatio(mgr, this.pos, data)}`)
    if (
      debtRatio > 1 + this.debtRatioRange ||
      debtRatio < 1 - this.debtRatioRange
    ) {
      console.log('\n************* rebalancing debt! *************');
      console.log((debtRatio * 100).toFixed(2));
      await this.rebalanceDebt(mgr, aave, data);
      console.log('new debt ratio:', this.calcDebtRatio(mgr, this.pos, data));
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
      // console.log(`this.initial: ${this.initial}`)
      // console.log(`pool.close: ${pool.close}`)
      const result = this.calcLenderAmounts(this.initial, data)
      // console.log(`calcLenderAmounts`)
      // console.log(result)
      const lend = result.lend
      const borrow = result.borrow
      const lendUsd = lend
      console.log(`lend: ${lend}`)
      console.log(`borrow: ${borrow}`)
      console.log(`initial: ${this.initial}`)
      const usdLeft = (borrow*pool.close)*2
      // console.log(`usdLeft: ${usdLeft}`)
      this.aave = aave.create()
      this.aave.lend('USDC', lend)
      this.aave.borrow('ETH', borrow)
      console.log(`first pos open: ${usdLeft}`)
      this.pos = uni.open(
        usdLeft,
        pool.close * (1 - this.rangeSpread),
        pool.close * (1 + this.rangeSpread),
        this.priceToken,
        this.poolSymbol,
      );
      this.start = data.timestamp;
      this.pos.valueUsd = usdLeft
      //this.idle = this.initial - this.estTotalAssets(data)
      this.idle = 0
      //this.startPrice = pool.close
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
    // if(this.pos.valueUsd == 0){
    //   return this.initial
    // }
    //console.log(`this.aave.borrowed('ETH'): ${this.aave.borrowed('ETH')}`)
    const pool = this.pool(data);
    //return 0
    // console.log(`estTotalAssets`)
    // console.log(`est, lent: ${this.aave.lent(pool.tokens[this.tokenIndex].symbol)}`)
    // //console.log(pool.tokens[this.priceToken].symbol)
    // //console.log(this.aave.borrowed(pool.tokens[this.priceToken].symbol))
    // console.log(`est borrowed: ${this.aave.borrowed('ETH')}`)
    // console.log(`est, pos: ${this.pos.valueUsd}`)
    // //console.log(`est, claimed: ${this.pos.claimed}`)
    // console.log(`est, idle: ${this.idle}`)
    // if(!this.aave.borrowed('ETH')){
    //   // console.log("estTotalAssets no ETH borrow")
    //   // console.log(`this.aave: ${this.aave}`)
    //   // console.log(`this.pos.valueUsd: ${this.pos.valueUsd}`)
    //   // console.log(`this.idle: ${this.idle}`)
    //   return this.pos.valueUsd + this.idle
    // }
    const result = this.idle + (this.pos.valueUsd + this.aave.lent(pool.tokens[this.tokenIndex].symbol)) - (this.aave.borrowed('ETH') *  pool.close) - this.gasCosts //(this.aave.borrowed(pool.tokens[this.priceToken].symbol) * pool.close)
    // console.log(`est return: ${result}`)
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
    if (totalAssets === 0) return;
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
        profit
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
    //console.log(this.pos.snapshot)
    this.series.push({
      name: this.name,
      timestamp: data.timestamp,
      aum: totalAssets,
      rewards: this.claimed,
      minRange: this.pos.minRange,
      maxRange: this.pos.maxRange,
      debtRatio,
      //fees: this.pos.snapshot.fees,
      debtRatioRange: this.debtRatioRange,
      rangeSpread: this.rangeSpread,
      lpAmount: this.pos.lpAmount,
      ...tokens,
      ...prices,
      ...this.pos.snapshot,
    });
  }

  public async end(uni: UniV3PositionManager, data: Uni3Snaphot) {
    
    // console.log(`close: ${close}`);
    // console.log(`idle: ${this.idle}`);
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
    };
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class HedgedUniswapStrategy {
  private uni = new UniV3PositionManager();
  private lastData!: Uni3Snaphot;
  private lender = new AAVEPositionManager();
  private strategies: SingleSidedUniswap[] = [];
  constructor() {
    const strategies = Array.from(Array(6).keys()).map(i => {
      const n = i + 1
      return {
        initialInvestment: 100_000,
        name: `#${n}: Camelotv3 WETH/USDC ${n*3}%`,
        pool: 'Camelotv3 WETH/USDC 0%',
        rangeSpread: 0.03 * n,
        priceToken: 0,
        collatRatio: 0.6,
        debtRatioRange: 0.10
      }
    })
    this.strategies = strategies.map(
      (s) =>
        new SingleSidedUniswap(
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
    this.lastData = snapshot;
    // console.log('onData')
    this.uni.processPoolData(snapshot);

    // Sonne Position Update
    if (snapshot.data.sonne) {
      await this.lender.update({
        timestamp: snapshot.timestamp,
        data: snapshot.data.aave as any,
      });
    }

    // Process the strategy
    for (const strat of this.strategies) {
      await wait(1);
      await strat.process(this.uni, snapshot, this.lender);
    }
  }
}
