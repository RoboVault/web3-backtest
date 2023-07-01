import { CompPoolSnapshot } from '../datasource/sonne.js';

type Snapshot = {
  timestamp: number;
  data: CompPoolSnapshot[];
};

type Rates = {
  [key: string]: {
    supply: number;
    borrow: number;
    rewards? : {
      totalSupply: number,
      totalDebt: number,
      compPrice: number,
      compSupplyPerBlock: number,
      compBorrowPerBlock: number,
    }
  };
};

const DILUTION_FACTOR = 0.7

export class CompPosition {
  public borrows: { [key: string]: number } = {};
  public lends: { [key: string]: number } = {};
  public interest = { cost: 0, income: 0 };
  public pendingComp = 0

  constructor(private blocksPerSecond: number, public rates: Rates) {}

  public lent(token: string) {
    return this.lends[token];
  }

  public borrowed(token: string) {
    return this.borrows[token];
  }

  public lend(token: string, amount: number) {
    const now = this.lends[token] || 0;
    this.lends[token] = now + amount;
  }

  public redeem(token: string, amount: number) {
    const now = this.lends[token] || 0;
    this.lends[token] = now - amount;
  }

  public claim() {
    const compEarned = this.pendingComp
    this.pendingComp = 0
    return compEarned
  }

  public borrow(token: string, amount: number) {
    const now = this.borrows[token] || 0;
    this.borrows[token] = now + amount;
  }

  public process(elapsed: number, rates: Rates, ) {
    this.rates = rates;
    let income = 0;
    let cost = 0;
    // WARN this is broken for generic borrows. Only works for USDC
    for (const borrow of Object.keys(this.borrows)) {
      const rate = this.rates[borrow].borrow;
      const interest =
        (this.borrows[borrow] * rate * elapsed) / (60 * 60 * 24 * 365);
      this.borrows[borrow] -= interest;
      cost += interest;

      const rewards = this.rates[borrow].rewards
      if (rewards) {
        const borrowed = this.borrows[borrow]
        const compEarned = (this.blocksPerSecond * elapsed * rewards.compBorrowPerBlock * borrowed) / (rewards.totalDebt + (borrowed * DILUTION_FACTOR))
        this.pendingComp += compEarned
      }
    }

    for (const lend of Object.keys(this.lends)) {
      const rate = this.rates[lend].supply;
      const interest =
        (this.lends[lend] * rate * elapsed) / (60 * 60 * 24 * 365);
      this.lends[lend] += interest;
      income += interest;

      const rewards = this.rates[lend].rewards
      if (rewards) {
        const lent = this.lends[lend]
        const compEarned = (this.blocksPerSecond * elapsed * rewards.compSupplyPerBlock * lent) / (rewards.totalSupply + (lent * DILUTION_FACTOR))
        this.pendingComp += compEarned
      }
    }


    this.interest = { cost, income };
  }
}

export class CompPositionManager {
  private lastData!: Snapshot;
  private rates: Rates;
  positions: CompPosition[] = [];

  constructor(private blocksPerSecond: number = 1) {
    this.rates = {
      LUSD: { supply: 0, borrow: 0 },
      WETH: { supply: 0, borrow: 0 },
      USDC: { supply: 0, borrow: 0 },
    };
  }

  public update(snapshot: Snapshot): boolean {
    if (!this.lastData) {
      this.lastData = snapshot;
      return false;
    }
    const elapsed = snapshot.timestamp - this.lastData.timestamp;
    for (const pool of snapshot.data) {
      this.rates[pool.underlying] = {
        supply: pool.liquidityRate,
        borrow: pool.variableBorrowRate,
        rewards: {
          totalSupply: pool.totalSupply,
          totalDebt: pool.totalDebt,
          compPrice: pool.compPrice,
          compSupplyPerBlock: pool.compSupplyPerBlock,
          compBorrowPerBlock: pool.compBorrowPerBlock,
        }
      };
    }

    for (const pos of this.positions) {
      pos.process(elapsed, this.rates);
    }

    this.lastData = snapshot;
    return true;
  }

  public create(): CompPosition {
    const pos = new CompPosition(this.blocksPerSecond, this.rates);
    this.positions.push(pos);
    return pos;
  }

  public claim(pos: CompPosition, claimInToken: string) {
    const price = this.rates[claimInToken].rewards!.compPrice
    return pos.claim() * price
  }

  public close(pos: CompPosition) {
    const idx = this.positions.indexOf(pos);
    this.positions.splice(idx, 1);
  }
}
