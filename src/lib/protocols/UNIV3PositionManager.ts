//import { CurveStableSwapAbi } from "../abis/CurveStableSwapAbi.js"
import { VelodromeRouterAbi } from '../abis/VelodromeRouter.js';
import { Uni3PoolSnapshot, Uni3Snaphot } from '../datasource/uni3Dex.js';
import { ethers, BigNumber } from 'ethers';
import { toBigNumber, toNumber } from '../utils/utility.js';
import { Curve2CryptoAbi } from '../abis/Curve2CryptoAbi.js';
import { VelodromePairFactoryAbi } from '../abis/VelodromePairFactoryAbi.js';
import { gql, GraphQLClient } from 'graphql-request';
import { Uni3Quote } from './Uni3Quote.js';
import { TickMath, FullMath, tickToPrice, Tick } from '@uniswap/v3-sdk';
import * as jsbi from 'jsbi';
const JSBI: any = jsbi; // Hack because JSBIs types are broken

const RPC = 'https://mainnet.infura.io/v3/5e5034092e114ffbb3d812b6f7a330ad';
const VELODROME_ROUTER = '0x9c12939390052919aF3155f41Bf4160Fd3666A6f';
const VELODROME_FACTORY = '0x25CbdDb98b35ab1FF77413456B31EC81A6B6B746';

export class Uni3Position {
  public totalSupply;
  public valueUsd;
  public symbol: string;
  public price: number;
  public stakeTimestamp: number = 0;
  public sqrtPriceX96: number = 0;
  public otherTokenIndex: number;
  //public lpStaked: number = 0

  private constructor(
    public data: Uni3PoolSnapshot,
    public lpAmount: number,
    public tokenIndex: number,
    public rangeSpread: number,
  ) {
    this.symbol = data.symbol;
    this.stakeTimestamp = data.timestamp;
    this.totalSupply = data.totalSupply;
    this.price = 0; //data.price //TODO Get valueUSD
    this.valueUsd = 0; //this.lpAmount * data.price //TODO Get valueUSD
    //this.reserves = data.tokens.map(e => e.reserve)
    this.sqrtPriceX96 = data.sqrtPriceX96;
    this.otherTokenIndex = tokenIndex == 0 ? 1 : 0;
  }

  static contract(data: Uni3PoolSnapshot): ethers.Contract {
    const provider = new ethers.providers.JsonRpcProvider(RPC);
    return new ethers.Contract(data.pool, Curve2CryptoAbi as any, provider);
  }

  // static router() {
  // 	const provider = new ethers.providers.JsonRpcProvider(RPC)
  // 	return new ethers.Contract(VELODROME_ROUTER, VelodromeRouterAbi as any, provider)
  // }

  // static pairFactory() {
  // 	const provider = new ethers.providers.JsonRpcProvider(RPC)
  // 	return new ethers.Contract(VELODROME_FACTORY, VelodromePairFactoryAbi as any, provider)
  // }

  static getPriceFromTick(tick: any, pool: any, baseSelected = 0): number {
    const decimal0 =
      baseSelected && baseSelected === 1
        ? parseInt(pool.tokens[1].decimals)
        : parseInt(pool.tokens[0].decimals);
    const decimal1 =
      baseSelected && baseSelected === 1
        ? parseInt(pool.tokens[0].decimals)
        : parseInt(pool.tokens[1].decimals);
    const sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);
    const ratioX192 = JSBI.BigInt(
      JSBI.BigInt(sqrtRatioX96) ** JSBI.BigInt(sqrtRatioX96),
    ); //JSBI.multiply(sqrtRatioX96, sqrtRatioX96)
    const baseAmount = JSBI.BigInt(10 ** decimal1);
    const shift = JSBI.leftShift(JSBI.BigInt(1), JSBI.BigInt(192));
    const price =
      parseFloat(
        FullMath.mulDivRoundingUp(ratioX192, baseAmount, shift).toString(),
      ) /
      10 ** decimal0;
    return price;
  }

  // Calculate the liquidity share for a strategy based on the number of tokens owned
  static liquidityForStrategy(
    price: number,
    low: number,
    high: number,
    tokens0: number,
    tokens1: number,
    decimal0: number,
    decimal1: number,
  ): number {
    const decimal = decimal1 - decimal0;
    const lowHigh = [
      Math.sqrt(low * Math.pow(10, decimal)) * Math.pow(2, 96),
      Math.sqrt(high * Math.pow(10, decimal)) * Math.pow(2, 96),
    ];

    const sPrice = Math.sqrt(price * Math.pow(10, decimal)) * Math.pow(2, 96);
    const sLow = Math.min(...lowHigh);
    const sHigh = Math.max(...lowHigh);

    if (sPrice <= sLow) {
      return (
        tokens0 /
        ((Math.pow(2, 96) * (sHigh - sLow)) /
          sHigh /
          sLow /
          Math.pow(10, decimal0))
      );
    } else if (sPrice <= sHigh && sPrice > sLow) {
      const liq0 =
        tokens0 /
        ((Math.pow(2, 96) * (sHigh - sPrice)) /
          sHigh /
          sPrice /
          Math.pow(10, decimal0));
      const liq1 =
        tokens1 / ((sPrice - sLow) / Math.pow(2, 96) / Math.pow(10, decimal1));
      return Math.min(liq1, liq0);
    } else {
      return (
        tokens1 / ((sHigh - sLow) / Math.pow(2, 96) / Math.pow(10, decimal1))
      );
    }
  }

  static async open(
    data: Uni3PoolSnapshot,
    amount: number,
    tokenIndex: number,
    rangeSpread: number,
  ): Promise<[Uni3Position, number]> {
    if (tokenIndex > 1) throw new Error('Invalid Token Index!');
    // Swap to get token0 and token1 to equal the same USD value
    const quote = await Uni3Quote.getQuote(
      data.tokens[tokenIndex].address,
      data.tokens[tokenIndex].decimals,
      data.tokens[tokenIndex == 0 ? 1 : 0].address,
      data.tokens[tokenIndex == 0 ? 1 : 0].decimals,
      10 ** data.tokens[tokenIndex].decimals,
      data.block,
      data.pool,
    );
    const otherTokenQuote = 1 / quote;
    const initialInWant =
      (amount / data.tokens[tokenIndex].price) *
      10 ** data.tokens[tokenIndex].decimals;
    const halfInitialInWant = Math.floor(initialInWant / 2);
    const noSlipAmountOut =
      halfInitialInWant /
      otherTokenQuote /
      10 ** data.tokens[tokenIndex].decimals;
    //console.log(`noSlipAmountOut: ${noSlipAmountOut}`)
    const realQuote = await Uni3Quote.getQuote(
      data.tokens[tokenIndex].address,
      data.tokens[tokenIndex].decimals,
      data.tokens[tokenIndex == 0 ? 1 : 0].address,
      data.tokens[tokenIndex == 0 ? 1 : 0].decimals,
      halfInitialInWant,
      data.block,
      data.pool,
    );
    //console.log(`realQuote: ${realQuote}`)
    //TODO noSlipAmountOut - realQuote is the slippage
    const slippage = noSlipAmountOut - realQuote;
    const slippageUSD = slippage * data.tokens[tokenIndex == 0 ? 1 : 0].price;
    const slippageWant = slippageUSD / data.tokens[tokenIndex].price;
    //console.log(`slippageUSD: ${slippageUSD}`)
    //console.log(`slippageWant/idle: ${slippageWant}`)

    // Get estimated lp for amount0 and amount1
    //const token0Quote = Math.floor((tokenIndex==0?quote:otherTokenQuote)* (10 ** data.tokens[1].decimals))
    const tick = data.tick * -1;
    const priceMagic = this.getPriceFromTick(tick, data, tokenIndex);
    console.log(`tick: ${tick}`);
    console.log(`priceMagic: ${priceMagic}`);
    //console.log(`token0Quote: ${token0Quote}`)
    // console.log(`halfInitialInWant: ${halfInitialInWant}`)
    const liquidity = this.liquidityForStrategy(
      tick,
      Math.floor(tick * (1 - rangeSpread)),
      tick * (1 + rangeSpread),
      halfInitialInWant - slippageWant,
      realQuote,
      data.tokens[0].decimals,
      data.tokens[1].decimals,
    );
    const normalLiquidity = liquidity / 10 ** 18;
    console.log(`🤞 liquidity of position: ${normalLiquidity} 🤞`);

    // Create new position with lp amount

    return [new Uni3Position(data, 0, tokenIndex, rangeSpread), 0];
  }

  public async close(data: Uni3PoolSnapshot) {
    // const lpTokensBN = toBigNumber(this.lpAmount, 18)
    // const tokenAmounts = await Uni3Position.calc_withdraw_one_coin(data, lpTokensBN, stable)
    // const price0 = data.tokens[0].price
    // const price1 = data.tokens[1].price
    // this.valueUsd = 0
    // this.lpAmount = 0
    // const amountUSD0 = toNumber(tokenAmounts[0], data.tokens[0].decimals) * price0
    // const amountUSD1 = toNumber(tokenAmounts[1], data.tokens[1].decimals) * price1
    // return amountUSD0+amountUSD1
  }

  public processData(data: Uni3PoolSnapshot) {
    this.totalSupply = data.totalSupply;
    this.price = 0; //data.price // TODO Get price value somehow
    this.valueUsd = 0; //this.lpAmount * data.price // TODO Get liquidity value somehow
    this.sqrtPriceX96 = data.sqrtPriceX96;
    //this.reserves = data.tokens.map(e => e.reserve)
  }

  public get snapshot() {
    // const reserves: any = {}
    // this.data.tokens.forEach((e, i) => {
    // 	reserves[`reserves${i}`] = this.reserves[i]
    // })
    return {
      totalSupply: this.totalSupply,
      price: this.price,
      valueUsd: this.valueUsd,
      lpAmount: this.lpAmount,
      sqrtPriceX96: this.sqrtPriceX96,
      // ...reserves,
    };
  }

  public async pendingRewards(data: Uni3PoolSnapshot) {
    return 0;
  }

  public async claim(data: Uni3PoolSnapshot) {
    const rewardsUSD = await this.pendingRewards(data);
    this.stakeTimestamp = data.timestamp;
    return rewardsUSD;
  }
}

export class Uni3PositionManager {
  lastData!: Uni3Snaphot;
  positions: Uni3Position[] = [];

  constructor() {}

  public update(snapshot: Uni3Snaphot): boolean {
    if (!this.lastData) {
      this.lastData = snapshot;
      return false;
    }

    for (const pos of this.positions) {
      const pair = snapshot.data.velodrome.find((p) => p.symbol === pos.symbol);
      if (pair) pos.processData(pair);
    }

    this.lastData = snapshot;
    return true;
  }

  public async addLiquidity(
    symbol: string,
    amount: number,
    tokenIndex: number,
    rangeSpread: number,
  ): Promise<[Uni3Position, number]> {
    if (!this.lastData) throw new Error('wow');

    const pair = this.lastData.data.uni3.find((p) => p.symbol === symbol)!;
    let [pos, idle] = await Uni3Position.open(
      pair,
      amount,
      tokenIndex,
      rangeSpread,
    );
    this.positions.push(pos);
    return [pos, idle];
  }

  // Assumes exiting into 1 token
  public close(pos: Uni3Position) {
    const idx = this.positions.indexOf(pos);
    this.positions.splice(idx, 1);
    const pair = this.lastData.data.velodrome.find(
      (p) => p.symbol === pos.symbol,
    )!;
    return pos.close(pair);
  }
}
