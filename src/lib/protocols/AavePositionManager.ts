import { AavePoolSnapshot } from '../datasource/Aave.js';

type Snapshot = {
  timestamp: number;
  data: AavePoolSnapshot[];
};

type Rates = {
  [key: string]: {
    supply: number;
    borrow: number;
  };
};
export class AAVEPosition {
  public borrows: { [key: string]: number } = {};
  public lends: { [key: string]: number } = {};
  public interest = { cost: 0, income: 0 };

  constructor(public rates: Rates) {}

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

  public borrow(token: string, amount: number) {
    const now = this.borrows[token] || 0;
    this.borrows[token] = now + amount;
  }

  public process(elapsed: number, rates: Rates) {
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
    }

    for (const lend of Object.keys(this.lends)) {
      const rate = this.rates[lend].supply;
      const interest =
        (this.lends[lend] * rate * elapsed) / (60 * 60 * 24 * 365);
      this.lends[lend] += interest;
      income += interest;
    }
    this.interest = { cost, income };
  }
}

export class AAVEPositionManager {
  private lastData!: Snapshot;
  private rates: Rates;
  positions: AAVEPosition[] = [];

  constructor() {
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
      };
    }

    for (const pos of this.positions) {
      pos.process(elapsed, this.rates);
    }

    this.lastData = snapshot;
    return true;
  }

  public create(): AAVEPosition {
    const pos = new AAVEPosition(this.rates);
    this.positions.push(pos);
    return pos;
  }

  public close(pos: AAVEPosition) {
    const idx = this.positions.indexOf(pos);
    this.positions.splice(idx, 1);
  }
}
