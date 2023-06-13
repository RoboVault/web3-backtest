import { Univ2PoolSnapshot } from '../datasource/camelotDex.js';

type Snapshot = {
  timestamp: number;
  data: Univ2PoolSnapshot[];
};

export class UniV2Position {
  // pool!: ethers.Contract
  // provider!: ethers.providers.BaseProvider
  // public unboundedFees: [number, number] = [0, 0]
  // public snapshot: any
  // public feeToken0: number = 0
  // public feeToken1: number = 0
  public totalSupply;
  public valueUsd;
  public reserves0;
  public reserves1;
  public lpTokens;
  public symbol: string;

  constructor(
    public amount0: number,
    public amount1: number,
    public data: Univ2PoolSnapshot,
  ) {
    this.symbol = data.symbol;
    this.lpTokens = (amount0 / data.reserves0) * data.totalSupply;
    this.totalSupply = data.totalSupply;
    this.valueUsd = amount1 * 2;
    this.reserves0 = amount0;
    this.reserves1 = amount1;
  }

  public processData(data: Univ2PoolSnapshot) {
    const pc = this.lpTokens / data.totalSupply;
    this.totalSupply = data.totalSupply;
    this.valueUsd = pc * data.reserves1 * 2;
    this.reserves0 = pc * data.reserves0;
    this.reserves1 = pc * data.reserves1;
  }

  public get snapshot() {
    return {
      totalSupply: this.totalSupply,
      valueUsd: this.valueUsd,
      reserves0: this.reserves0,
      reserves1: this.reserves1,
      lpTokens: this.lpTokens,
    };
  }
}

export class UniV2PositionManager {
  lastData!: Snapshot;
  positions: UniV2Position[] = [];

  constructor() {}

  public update(snapshot: Snapshot): boolean {
    if (!this.lastData) {
      this.lastData = snapshot;
      return false;
    }

    for (const pos of this.positions) {
      const pair = snapshot.data.find((p) => p.symbol === pos.symbol)!;
      pos.processData(pair);
    }

    this.lastData = snapshot;
    return true;
  }

  public addLiquidity(
    symbol: string,
    amount0: number,
    amount1: number,
  ): UniV2Position {
    if (!this.lastData) throw new Error('wow');
    console.log('openning positions with ');
    console.log(amount0, amount1);
    const pair = this.lastData.data.find((p) => p.symbol === symbol)!;
    const pos = new UniV2Position(amount0, amount1, pair);
    this.positions.push(pos);
    return pos;
  }

  public close(pos: UniV2Position) {
    const idx = this.positions.indexOf(pos);
    this.positions.splice(idx, 1);
  }
}
