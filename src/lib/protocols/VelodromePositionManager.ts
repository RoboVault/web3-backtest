//import { CurveStableSwapAbi } from "../abis/CurveStableSwapAbi.js"
import { VelodromeRouterAbi } from '../abis/VelodromeRouter.js';
import {
  VelodromePoolSnapshot,
  VelodromeSnaphot,
} from '../datasource/velodromeDex.js';
import { ethers, BigNumber } from 'ethers';
import { toBigNumber, toNumber } from '../utils/utility.js';
import { Curve2CryptoAbi } from '../abis/Curve2CryptoAbi.js';
import { VelodromePairFactoryAbi } from '../abis/VelodromePairFactoryAbi.js';
import { gql, GraphQLClient } from 'graphql-request';

const RPC =
  'https://optimism-mainnet.infura.io/v3/5e5034092e114ffbb3d812b6f7a330ad';
const VELODROME_ROUTER = '0x9c12939390052919aF3155f41Bf4160Fd3666A6f';
const VELODROME_FACTORY = '0x25CbdDb98b35ab1FF77413456B31EC81A6B6B746';

export class VelodromePosition {
  public totalSupply;
  public valueUsd;
  public symbol: string;
  public reserves: number[];
  public price: number;
  public stakeTimestamp: number = 0;
  //public lpStaked: number = 0

  private constructor(
    public data: VelodromePoolSnapshot,
    public lpAmount: number,
  ) {
    this.symbol = data.symbol;
    this.stakeTimestamp = data.timestamp;
    this.totalSupply = data.totalSupply;
    this.price = data.price;
    this.valueUsd = this.lpAmount * data.price;
    this.reserves = data.tokens.map((e) => e.reserve);
  }

  static contract(data: VelodromePoolSnapshot) {
    const provider = new ethers.providers.JsonRpcProvider(RPC);
    return new ethers.Contract(data.pool, Curve2CryptoAbi as any, provider);
  }

  static router() {
    const provider = new ethers.providers.JsonRpcProvider(RPC);
    return new ethers.Contract(
      VELODROME_ROUTER,
      VelodromeRouterAbi as any,
      provider,
    );
  }

  static pairFactory() {
    const provider = new ethers.providers.JsonRpcProvider(RPC);
    return new ethers.Contract(
      VELODROME_FACTORY,
      VelodromePairFactoryAbi as any,
      provider,
    );
  }

  static getFee(stable: Boolean) {
    const provider = new ethers.providers.JsonRpcProvider(RPC);
    const factory = new ethers.Contract(
      VELODROME_FACTORY,
      VelodromePairFactoryAbi as any,
      provider,
    );
    return factory.getFee(stable);
  }

  static calc_token_amount(
    data: VelodromePoolSnapshot,
    amounts: ethers.BigNumber[],
    stable: Boolean,
  ) {
    const velo = VelodromePosition.router();
    return velo.quoteAddLiquidity(
      data.tokens[0].address,
      data.tokens[1].address,
      stable,
      amounts[0],
      amounts[1],
      { blockTag: data.block },
    );
  }

  static calc_withdraw_one_coin(
    data: VelodromePoolSnapshot,
    amount: ethers.BigNumber,
    stable: Boolean,
  ) {
    const velo = VelodromePosition.router();
    return velo.quoteRemoveLiquidity(
      data.tokens[0].address,
      data.tokens[1].address,
      stable,
      amount,
      { blockTag: data.block },
    );
  }

  static quoteLiquidity(amountA: number, reserveA: number, reserveB: number) {
    return (amountA * reserveB) / reserveA;
  }

  static getAmountOut(
    router: any,
    amount: BigNumber,
    tokenIn: string,
    tokenOut: string,
  ) {
    return router.getAmountOut(amount, tokenIn, tokenOut);
  }

  static getDepositRatio(data: VelodromePoolSnapshot) {
    const reserveA = data.tokens[0].reserve;
    const reserveB = data.tokens[1].reserve;
    let amountAOptimal = this.quoteLiquidity(1, reserveA, reserveB);
    let amountBOptimal = this.quoteLiquidity(1, reserveB, reserveA);
    let depositA = 1;
    let depositB = 1;
    let ratio = 0;
    if (amountBOptimal <= 1) {
      depositB = amountBOptimal;
      ratio = amountBOptimal;
    } else {
      depositA = amountAOptimal;
      ratio = amountAOptimal;
    }
    const ratioA = depositB / (ratio + 1);
    const ratioB = depositA / (ratio + 1);
    return [ratioA, ratioB];
  }

  static async getPrices(data: VelodromePoolSnapshot) {
    const spotA = await this.getAmountOut(
      this.router(),
      toBigNumber(10 ** data.tokens[0].decimals),
      data.tokens[0].address,
      data.tokens[1].address,
    );
    const spotB = await this.getAmountOut(
      this.router(),
      toBigNumber(10 ** data.tokens[1].decimals),
      data.tokens[1].address,
      data.tokens[0].address,
    );
    const spotANormal = spotA[0] / 10 ** data.tokens[1].decimals;
    const spotBNormal = spotB[0] / 10 ** data.tokens[0].decimals;
    return [spotANormal / spotBNormal, spotBNormal / spotANormal];
  }

  static async open(
    data: VelodromePoolSnapshot,
    amount: number,
    tokenIndex: number,
  ): Promise<[VelodromePosition, number]> {
    if (tokenIndex > 1) throw new Error('Invalid Token Index!');
    const otherTokenIndex = tokenIndex == 1 ? 0 : 1;
    const ratios = this.getDepositRatio(data);
    const spotA = await this.getAmountOut(
      this.router(),
      toBigNumber(10 ** data.tokens[0].decimals),
      data.tokens[0].address,
      data.tokens[1].address,
    );
    const spotB = await this.getAmountOut(
      this.router(),
      toBigNumber(10 ** data.tokens[1].decimals),
      data.tokens[1].address,
      data.tokens[0].address,
    );
    const spotANormal = spotA[0] / 10 ** data.tokens[1].decimals;
    const spotBNormal = spotB[0] / 10 ** data.tokens[0].decimals;
    //const priceTokens = [spotANormal, spotBNormal]
    const prices = [spotANormal / spotBNormal, spotBNormal / spotANormal];
    const amounts = data.tokens.map((e, i) => Math.floor(amount * ratios[i]));
    const swapAmount = (amount - amounts[tokenIndex]) / prices[tokenIndex];
    const amountOut = await this.getAmountOut(
      this.router(),
      ethers.utils.parseUnits(
        swapAmount.toString(),
        data.tokens[tokenIndex].decimals,
      ),
      data.tokens[tokenIndex].address,
      data.tokens[otherTokenIndex].address,
    );
    //amounts[otherTokenIndex] = amountOut[0] / (10 ** data.tokens[otherTokenIndex].decimals)
    //const lpPercent = ((amounts[otherTokenIndex])/data.tokens[otherTokenIndex].reserve)
    //const lpEstimated = lpPercent*(data.totalSupply)

    const swapAmount18 = swapAmount * 10 ** 18;
    const amountOut18 =
      amountOut[0] * 10 ** (18 - Number(data.tokens[otherTokenIndex].decimals));
    const slippage = (swapAmount18 - amountOut18) / 10 ** 18;

    // const amountsReal: BigNumber[] = []
    // amountsReal[otherTokenIndex] = toBigNumber(amountOut[0])
    // amountsReal[tokenIndex] = toBigNumber((amounts[tokenIndex] / prices[tokenIndex]) *(10 ** data.tokens[tokenIndex].decimals))
    // const realLP = await this.calc_token_amount(data, amountsReal, true)
    //const lpValueUSD = lpEstimated*data.price
    const lpValuewithPrice =
      (amount - (slippage > 0 ? slippage : 0)) / data.price;
    //const idle = amount-lpValueUSD-(slippage>0 ? slippage : 0)

    return [new VelodromePosition(data, lpValuewithPrice), 0];
  }

  static async openHedged(
    data: VelodromePoolSnapshot,
    amount0: number,
    amount1: number,
  ): Promise<[VelodromePosition, number]> {
    // if(tokenIndex > 1)
    // 	throw new Error('Invalid Token Index!')
    //console.log("openHedged")
    //console.log(data)
    const amount0USD = amount0 * data.tokens[0].price;
    const amount1USD = amount1 * data.tokens[1].price;
    const lpValuewithPrice = (amount0USD + amount1USD) / data.price;
    //const realLP = await this.calc_token_amount(data, [toBigNumber(amount0, data.tokens[0].decimals), toBigNumber(amount1, data.tokens[1].decimals)], false)
    const minAmount = Math.min(amount0USD, amount1USD);
    const maxAmount = Math.max(amount0USD, amount1USD);
    const idle = maxAmount - minAmount;
    //console.log(`lpSyn: ${lpValuewithPrice}`)
    //console.log(`value lpSyn: ${lpValuewithPrice*data.price}`)
    // console.log(`amount0: ${amount0}`)
    // console.log(`amount1: ${amount1}`)
    //const realLPNormal = realLP[2]/10**18
    return [new VelodromePosition(data, lpValuewithPrice), idle];
  }

  public async close(data: VelodromePoolSnapshot, stable: boolean) {
    const lpTokensBN = toBigNumber(this.lpAmount, 18);
    const tokenAmounts = await VelodromePosition.calc_withdraw_one_coin(
      data,
      lpTokensBN,
      stable,
    );

    const price0 = data.tokens[0].price;
    const price1 = data.tokens[1].price;
    this.valueUsd = 0;
    this.lpAmount = 0;
    const amountUSD0 =
      toNumber(tokenAmounts[0], data.tokens[0].decimals) * price0;
    const amountUSD1 =
      toNumber(tokenAmounts[1], data.tokens[1].decimals) * price1;
    return amountUSD0 + amountUSD1;
  }

  public processData(data: VelodromePoolSnapshot) {
    this.totalSupply = data.totalSupply;
    this.price = data.price;
    this.valueUsd = this.lpAmount * data.price;
    this.reserves = data.tokens.map((e) => e.reserve);
  }

  public get snapshot() {
    const reserves: any = {};
    this.data.tokens.forEach((e, i) => {
      reserves[`reserves${i}`] = this.reserves[i];
    });
    return {
      totalSupply: this.totalSupply,
      price: this.price,
      valueUsd: this.valueUsd,
      lpAmount: this.lpAmount,
      ...reserves,
    };
  }

  public async pendingRewards(data: VelodromePoolSnapshot) {
    const url =
      'https://data.staging.arkiver.net/robolabs/velodrome-snapshots/graphql?apiKey=ef7a25de-c6dd-4620-a616-2196eedde775';
    let client: GraphQLClient = new GraphQLClient(url, { headers: {} });
    const rawFarmSnapshots = (await (
      (await client.request(gql`query MyQuery {
		FarmSnapshots(
			filter: {block: ${data.block}, poolAddress: "${data.pool}"}
		) {
			rewardPerToken
			rewardTokenUSDPrices
		}}`)) as any
    ).FarmSnapshots) as {
      rewardPerToken: number[];
      rewardTokenUSDPrices: number[];
    }[];
    const lastFarmSnapshot = (await (
      (await client.request(gql`query MyQuery {
			FarmSnapshots(
				filter: {poolAddress: "${data.pool}", _operators: {timestamp: {lte: ${this.stakeTimestamp}}}}
				limit: 1
				sort: TIMESTAMP_DESC
			  ) {
				rewardPerToken
				rewardTokenUSDPrices
				timestamp
			}}`)) as any
    ).FarmSnapshots) as {
      rewardPerToken: number[];
      rewardTokenUSDPrices: number[];
      timestamp: number;
    }[];
    const thisRewardsPerToken = rawFarmSnapshots[0].rewardPerToken[0];
    const lastRewardsPerToken = lastFarmSnapshot[0].rewardPerToken[0];
    const lpPercent = this.lpAmount / this.totalSupply;
    const posVeloEarned =
      (this.lpAmount * (thisRewardsPerToken - lastRewardsPerToken)) / 10 ** 18;
    const dollarsEarned =
      posVeloEarned * rawFarmSnapshots[0].rewardTokenUSDPrices[0];
    const adjustedDollarsEarned = dollarsEarned * (1 - lpPercent);
    // console.log(`adjustedDollarsEarned: ${adjustedDollarsEarned}`)
    return adjustedDollarsEarned;
  }

  public async claim(data: VelodromePoolSnapshot) {
    const rewardsUSD = await this.pendingRewards(data);
    this.stakeTimestamp = data.timestamp;
    return rewardsUSD;
  }
}

export class VelodromePositionManager {
  lastData!: VelodromeSnaphot;
  positions: VelodromePosition[] = [];

  constructor() {}

  public update(snapshot: VelodromeSnaphot): boolean {
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
  ): Promise<[VelodromePosition, number]> {
    if (!this.lastData) throw new Error('wow');

    const pair = this.lastData.data.velodrome.find((p) => p.symbol === symbol)!;
    let [pos, idle] = await VelodromePosition.open(pair, amount, tokenIndex);
    this.positions.push(pos);
    return [pos, idle];
  }

  public async addLiquidityHedged(
    symbol: string,
    amount0: number,
    amount1: number,
  ): Promise<[VelodromePosition, number]> {
    if (!this.lastData) throw new Error('wow');

    const pair = this.lastData.data.velodrome.find((p) => p.symbol === symbol)!;
    let [pos, idle] = await VelodromePosition.openHedged(
      pair,
      amount0,
      amount1,
    );
    this.positions.push(pos);
    return [pos, idle];
  }

  // Assumes exiting into 1 token
  public close(pos: VelodromePosition, stable: boolean) {
    const idx = this.positions.indexOf(pos);
    this.positions.splice(idx, 1);
    const pair = this.lastData.data.velodrome.find(
      (p) => p.symbol === pos.symbol,
    )!;
    return pos.close(pair, stable);
  }
}
