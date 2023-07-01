import { Measurement, Schema } from '../../../lib/utils/timeseriesdb.js';
import {
  VelodromePosition,
  VelodromePositionManager,
} from '../../../lib/protocols/VelodromePositionManager.js';
import { VelodromeSnaphot } from '../../../lib/datasource/velodromeDex.js';
import { stringify } from 'csv-stringify/sync';
import fs from 'fs/promises';
import { ethers } from 'ethers';
import { VelodromeRouterAbi } from '../../../lib/abis/VelodromeRouter.js';
import {
  CompPositionManager,
  CompPosition,
} from '../../../lib/protocols/CompPositionManager.js';

interface ILogAny extends Schema {
  tags: any;
  fields: any;
}

const Log = new Measurement<ILogAny, any, any>('ssc_lusd_strategy');
const Rebalance = new Measurement<ILogAny, any, any>('cpmm_rebalance');

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

const REBALANCE_COST = 0;
const HARVEST_COST = 0;
class HedgedVelodrome {
  public pos!: VelodromePosition;
  public comp!: CompPosition;
  public start!: number;
  public highest: number;
  public lastHarvest: number = 0;
  public farmRewards = 0;
  public compRewards = 0;
  public idle: number = 0; // idle assets
  public maxDrawdown = 0;
  public series: any[] = [];
  count = 0;
  public gasCosts: number = 0;
  private rebalanceCount: number = 0;

  constructor(
    public name: string,
    public poolSymbol: string,
    public initial: number,
    public collatRatio: number,
    public debtRatioRange: number,
    public tokenIndex: number,
  ) {
    this.highest = initial;
    // this.symbol = 'WETH/USDC'
  }

  public pool(data: VelodromeSnaphot) {
    return data.data.velodrome.find((p) => p.symbol === this.poolSymbol)!;
  }

  public poolIndex(data: VelodromeSnaphot) {
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

  private calcLenderAmounts(totalAssets: number, data: VelodromeSnaphot) {
    const pool = this.pool(data);
    const lendUSD = totalAssets * (1 / (1 + this.collatRatio));
    const borrowInUSD = totalAssets - lendUSD;
    const lend = lendUSD / pool.tokens[this.tokenIndex].price;
    //const price = this.tokenIndex ? pool.tokens[0].price/pool.tokens[1].price : pool.tokens[1].price/pool.tokens[0].price
    const borrow =
      borrowInUSD / pool.tokens[this.tokenIndex == 0 ? 1 : 0].price;
    return { borrow, lend };
  }

  private getSpotPriceInWant(data: VelodromeSnaphot) {
    const pool = this.pool(data);
    const otherIndex = this.tokenIndex == 0 ? 1 : 0;
    const reserve0 = pool.tokens[0].reserve;
    const reserve1 = pool.tokens[1].reserve;
    const price =
      this.tokenIndex == 0 ? reserve0 / reserve1 : reserve1 / reserve0;
    return price;
  }

  public borrow(data: VelodromeSnaphot) {
    const pool = this.pool(data);
    const borrow = this.comp.borrowed(
      pool.tokens[this.tokenIndex == 0 ? 1 : 0].symbol,
    );
    return borrow;
  }

  public borrowInWant(data: VelodromeSnaphot) {
    const borrowInWant = this.borrow(data) * this.getSpotPriceInWant(data);
    return borrowInWant;
  }

  public lent(data: VelodromeSnaphot) {
    const pool = this.pool(data);
    return this.comp.lent(pool.tokens[this.tokenIndex].symbol);
  }

  private calcDebtRatio(data: VelodromeSnaphot): number {
    if (!this.pos) return 1;
    const lpAmount = this.pos.lpAmount;
    const pool = this.pool(data);
    const totalSupply = pool.totalSupply;
    const lpPercent = lpAmount / totalSupply;
    const reserveAmount = pool.tokens[this.tokenIndex == 0 ? 1 : 0].reserve;
    const shortInLP = reserveAmount * lpPercent;
    return this.borrow(data) / shortInLP;
  }

  private async openFirstPosition(
    velodrome: VelodromePositionManager,
    comp: CompPositionManager,
    data: VelodromeSnaphot,
  ) {
    const pool = this.pool(data);
    const prices = [pool.tokens[0].price, pool.tokens[1].price];
    console.log(prices);
    console.log(pool.tokens[0].symbol);
    console.log(pool.tokens[1].symbol);
    const result = this.calcLenderAmounts(this.initial, data);
    let amountWant =
      this.initial / pool.tokens[this.tokenIndex].price - result.lend;
    let amountBorrow = result.borrow;
    const amount0 = this.tokenIndex == 0 ? amountWant : amountBorrow;
    const amount1 = this.tokenIndex == 0 ? amountBorrow : amountWant;
    this.comp = comp.create();
    this.comp.lend(pool.tokens[this.tokenIndex].symbol, result.lend);
    this.comp.borrow(
      pool.tokens[this.tokenIndex == 0 ? 1 : 0].symbol,
      result.borrow,
    );
    let [pos, idle] = await velodrome.addLiquidityHedged(
      this.poolSymbol,
      amount0,
      amount1,
    );
    this.pos = pos;
    this.idle = idle;
    this.start = data.timestamp;
    this.lastHarvest = this.start;
  }
  public async rebalanceDebt(
    mgr: VelodromePositionManager,
    comp: CompPositionManager,
    data: VelodromeSnaphot,
  ) {
    this.rebalanceCount++;
    console.log('rebalanceDebt', new Date(data.timestamp * 1000).toISOString());

    // Close this position
    const mgrClose = await mgr.close(this.pos, false);
    await comp.close(this.comp);
    this.idle = this.idle + mgrClose;
    // Calc total assets
    const totalAssets = this.estTotalAssets(data);
    // compound rewards, subtract gas fees
    // this.farmRewards = 0;
    // this.compRewards = 0;
    this.gasCosts = 0;
    const pool = this.pool(data);

    // Future: Account for trading fees and slippage on rebalances

    // Update Lend
    const { borrow, lend } = this.calcLenderAmounts(totalAssets, data);

    //const result = this.calcLenderAmounts(this.initial, data)
    let amountWant = totalAssets / pool.tokens[this.tokenIndex].price - lend;
    let amountBorrow = borrow;
    const amount0 = this.tokenIndex == 0 ? amountWant : amountBorrow;
    const amount1 = this.tokenIndex == 0 ? amountBorrow : amountWant;

    this.comp = comp.create();
    this.comp.lend(pool.tokens[this.tokenIndex].symbol, lend);
    this.comp.borrow(pool.tokens[this.tokenIndex == 0 ? 1 : 0].symbol, borrow);
    let [pos, idle] = await mgr.addLiquidityHedged(
      this.poolSymbol,
      amount0,
      amount1,
    );
    this.pos = pos;
    this.idle = idle;
    const totalAssetsNew = this.estTotalAssets(data);
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
    mgr: VelodromePositionManager,
    comp: CompPositionManager,
    data: VelodromeSnaphot,
  ) {
    const debtRatio = this.calcDebtRatio(data);
    if (
      debtRatio > 1 + this.debtRatioRange ||
      debtRatio < 1 - this.debtRatioRange
    ) {
      console.log('\n************* rebalancing debt! *************');
      console.log((debtRatio * 100).toFixed(2));
      await this.rebalanceDebt(mgr, comp, data);
      console.log('new debt ratio:', this.calcDebtRatio(data));
    }
  }

  public async process(
    velodrome: VelodromePositionManager,
    comp: CompPositionManager,
    data: VelodromeSnaphot,
  ) {
    if (!this.pool(data)) {
      console.log('missing data for ' + this.name);
      return;
    }
    // open the first position
    if (!this.pos) {
      await this.openFirstPosition(velodrome, comp, data);
      //this.idle = this.initial - this.pos.valueUsd
    } else {
      await this.checkRebalance(velodrome, comp, data);
    }

    if (data.timestamp - this.lastHarvest >= HARVEST_PERIOD) {
      await this.harvest(comp, data);
    }

    // always log data
    await this.log(data);
  }

  private estTotalAssets(data: VelodromeSnaphot) {
    const pool = this.pool(data);
    const lpUSD = this.pos.lpAmount * pool.price;

    const lent = pool.tokens[this.tokenIndex].price * this.lent(data);
    const debt =
      pool.tokens[this.tokenIndex == 0 ? 1 : 0].price * this.borrow(data);

    const total = lpUSD + this.idle + lent - debt - this.gasCosts;
    return total;
  }

  private async harvest(comp: CompPositionManager, data: VelodromeSnaphot) {
    const pool = this.pool(data);
    const farmRewards = await this.pos.claim(pool);
    this.farmRewards += farmRewards
    const compRewards = await comp.claim(this.comp, 'LUSD') * pool.tokens[1].price
    this.compRewards += compRewards;
    this.lastHarvest = data.timestamp;
    this.idle += farmRewards + compRewards;
  }

  private apy(data: VelodromeSnaphot) {
    const elapsed = data.timestamp - this.start;
    if (elapsed < TWO_WEEKS) return 0;
    const totalAssets = this.estTotalAssets(data);
    const apy = (totalAssets / this.initial) ** (ONE_YEAR / elapsed) - 1;
    return apy;
  }

  private apr(data: VelodromeSnaphot) {
    const elapsed = data.timestamp - this.start;
    return (
      (this.estTotalAssets(data) / this.initial - 1) / (elapsed / ONE_YEAR)
    );
  }

  public async log(data: VelodromeSnaphot) {
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
    const lent = pool.tokens[this.tokenIndex].price * this.lent(data);
    const debt = pool.tokens[this.tokenIndex == 0 ? 1 : 0].price * this.borrow(data);

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
        farmRewards: this.farmRewards,
        compRewards: this.compRewards,
        drawdown,
        ...poolSnap,
        highest: this.highest,
        aum: totalAssets,
        profit,
        rebalanceCount: this.rebalanceCount,
        lent,
        debt,
        idle: this.idle,
        lpAmount: this.pos.lpAmount * pool.price,
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

    console.log()
    this.series.push({
      name: this.name,
      timestamp: data.timestamp,
      aum: totalAssets,
      farmRewards: this.farmRewards,
      compRewards: this.compRewards,
      lpAmount: this.pos.lpAmount,
      ...tokens,
      ...prices,
      ...this.pos.snapshot,
    });
  }

  public async end(curve: VelodromePositionManager, data: VelodromeSnaphot) {
    this.idle = this.idle + (await curve.close(this.pos, false));

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
      farmRewards: this.farmRewards,
      compRewards: this.compRewards,
      start: toDate(this.start),
      end: toDate(data.timestamp),
      daysElapsed: (data.timestamp - this.start) / (60 * 60 * 24), // days
      variance,
      stddev,
    };
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class HedgedVelodromeStrategy {
  private velo = new VelodromePositionManager();
  private lastData!: VelodromeSnaphot;
  private sonne = new CompPositionManager();
  // private farm = new CamelotFarm()
  private strategies: HedgedVelodrome[] = [];
  constructor() {
    const strategies = [
      {
        initialInvestment: 100_000,
        name: 'A: vAMM-WETH/LUSD',
        pool: 'vAMM-WETH/LUSD',
        collatRatio: 0.6,
        debtRatioRange: 0.02,
        tokenIndex: 1,
      },
      //{ initialInvestment: 10_000, name: 'A: sAMM-LUSD/MAI', pool: 'sAMM-LUSD/MAI' },
      //{ initialInvestment: 10_000, name: 'A: sAMM-USD+/LUSD', pool: 'sAMM-USD+/LUSD' }
    ];
    this.strategies = strategies.map(
      (s) =>
        new HedgedVelodrome(
          s.name,
          s.pool,
          s.initialInvestment,
          s.collatRatio,
          s.debtRatioRange,
          s.tokenIndex,
        ),
    );
  }

  public async before() {
    await Log.dropMeasurement();
  }

  public async after() {
    const summary = await Promise.all(
      this.strategies.map((s) => s.end(this.velo, this.lastData)),
    );
    console.log(summary);
    const csv = stringify(summary, { header: true });
    fs.writeFile('./velo_hedged.csv', csv);

    const series = this.strategies.map((s) => s.series).flat();
    const seriesCsv = stringify(series, { header: true });
    fs.writeFile('./velo_hedged_series.csv', seriesCsv);
  }

  public async onData(snapshot: VelodromeSnaphot) {
    if (!snapshot.data.velodrome)
      return console.log('missing velodrome data', snapshot);

    this.lastData = snapshot;
    this.velo.update(snapshot);

    // Sonne Position Update
    if (snapshot.data.sonne) {
      await this.sonne.update({
        timestamp: snapshot.timestamp,
        data: snapshot.data.sonne as any,
      });
    }

    // Process the strategy
    for (const strat of this.strategies) {
      await wait(1);
      await strat.process(this.velo, this.sonne, snapshot);
    }
  }
}
