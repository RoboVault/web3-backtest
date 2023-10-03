import { JoesAutopoolsPoolSnapshot } from '../../../lib/datasource/joesAutopools.js';

type JoesV2AutoPoolStrategySnapshot = {
  shares: number;
  poolValueInQuote: number;
  poolValueInBase: number;
  valueInBase: number;
  valueInQuote: number;
  rewards: number;
  price: number;
  totalSupply: number;
  joesPerSec: number;
  joesPrice: number;
  priceX: number;
  priceY: number;
  tvl: number;
  valueUsd: number;
  sharePrice: number;
};

const PRICE: any = {
  'WETH.e': 1666.78,
  WAVAX: 9.29,
  'BTC.b': 26000,
  USDC: 1,
};

export class JoesV2AutoPoolStrategy {
  public snapshot!: JoesV2AutoPoolStrategySnapshot;
  public shares: number;
  public last: number;

  public constructor(
    public options: {
      tags: any;
      amountInQuote: number;
    },
    pool: JoesAutopoolsPoolSnapshot,
  ) {
    this.shares = this.calcSharesForAmount(pool, this.options.amountInQuote);
    this.last = pool.timestamp;
    this.process(pool);
  }

  public calcSharesForAmount(pool: JoesAutopoolsPoolSnapshot, amount: number) {
    const { balances, price, totalSupply } = pool;
    const poolValueInQuote = balances[0] / price + balances[1];
    return (totalSupply * amount) / poolValueInQuote;
  }

  public async process(pool: JoesAutopoolsPoolSnapshot) {
    const {
      sharePrice,
      balances,
      price,
      totalSupply,
      joesPerSec,
      joesPrice,
      tvl,
      pool: { tokenX, tokenY },
    } = pool;
    const elapsed = pool.timestamp - this.last;

    // assuming we autocompound every 1h -> this isn't realistic but wont impact results much
    const priceX = PRICE[tokenX.symbol];
    const priceY = PRICE[tokenX.symbol];
    const rewards =
      (pool.joesPerSec * this.shares * elapsed * joesPrice) / totalSupply;
    const rewardsInQuote = rewards / priceY;
    this.shares += this.calcSharesForAmount(pool, rewardsInQuote);

    const poolValueInQuote = balances[0] / price + balances[1];
    const poolValueInBase = balances[0] + balances[1] * price;
    const valueInBase = (poolValueInBase * this.shares) / totalSupply;
    const valueInQuote = (poolValueInQuote * this.shares) / totalSupply;
    const valueUsd = sharePrice * this.shares;

    this.snapshot = {
      shares: this.shares,
      poolValueInQuote,
      poolValueInBase,
      valueInBase,
      valueInQuote,
      rewards,
      price,
      totalSupply,
      joesPerSec,
      joesPrice,
      priceX,
      priceY,
      tvl,
      valueUsd,
      sharePrice,
    };
    this.last = pool.timestamp;
  }
}
