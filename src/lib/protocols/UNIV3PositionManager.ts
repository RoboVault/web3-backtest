//import { CurveStableSwapAbi } from "../abis/CurveStableSwapAbi.js"
import { VelodromeRouterAbi } from '../abis/VelodromeRouter.js';
import { Uni3PoolSnapshot, Uni3Snaphot } from '../datasource/uni3Dex.js';
import { ethers, BigNumber } from 'ethers';
import { toBigNumber, toNumber } from '../utils/utility.js';
import { Curve2CryptoAbi } from '../abis/Curve2CryptoAbi.js';
import { VelodromePairFactoryAbi } from '../abis/VelodromePairFactoryAbi.js';
import { gql, GraphQLClient } from 'graphql-request';
import { Uni3Quote } from './Uni3Quote.js';

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

  static async open(
    data: Uni3PoolSnapshot,
    amount: number,
    tokenIndex: number,
  ): Promise<[Uni3Position, number]> {
    if (tokenIndex > 1) throw new Error('Invalid Token Index!');
    // Swap to get token0 and token1 to equal the same USD value
    console.log(data.tokens[tokenIndex]);
    const quote = await Uni3Quote.getQuote(
      data.tokens[tokenIndex].address,
      data.tokens[tokenIndex].decimals,
      data.tokens[tokenIndex == 0 ? 1 : 0].address,
      data.tokens[tokenIndex == 0 ? 1 : 0].decimals,
      10 ** data.tokens[tokenIndex].decimals,
      data.block,
      data.pool,
    );
    console.log(`quote: ${quote}`);
    const initialInWant =
      (amount / quote) * 10 ** data.tokens[tokenIndex].decimals;
    const halfInitialInWant = Math.floor(initialInWant / 2);
    const noSlipAmountOut =
      halfInitialInWant / (1 / quote) / 10 ** data.tokens[tokenIndex].decimals;
    console.log(`noSlipAmountOut: ${noSlipAmountOut}`);
    const realQuote = await Uni3Quote.getQuote(
      data.tokens[tokenIndex].address,
      data.tokens[tokenIndex].decimals,
      data.tokens[tokenIndex == 0 ? 1 : 0].address,
      data.tokens[tokenIndex == 0 ? 1 : 0].decimals,
      halfInitialInWant,
      data.block,
      data.pool,
    );
    console.log(`realQuote: ${realQuote}`);
    //TODO noSlipAmountOut - realQuote is the slippage

    // Get estimated lp for amount0 and amount1
    // Create new position with lp amount
    const liquidity = 0;

    return [new Uni3Position(data, liquidity, tokenIndex), 0];
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
  ): Promise<[Uni3Position, number]> {
    if (!this.lastData) throw new Error('wow');

    const pair = this.lastData.data.uni3.find((p) => p.symbol === symbol)!;
    let [pos, idle] = await Uni3Position.open(pair, amount, tokenIndex);
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
