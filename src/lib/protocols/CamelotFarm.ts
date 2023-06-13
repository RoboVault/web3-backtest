import { Univ2PoolSnapshot } from '../datasource/camelotDex.js';
import { CamelotFarmRewardsSnapshot } from '../datasource/camelotFarm.js';

export class FarmPosition {
  public harvest = 0;
  public pendingRewards = 0;

  constructor(public staked: number, public readonly symbol: string) {}

  public process(
    elapsed: number,
    data: Univ2PoolSnapshot,
    farm: CamelotFarmRewardsSnapshot,
  ) {
    const pc = this.staked / data.totalSupply;
    this.harvest = pc * elapsed * farm.rewardsPerSecond * farm.rewardTokenPrice;
    // console.log(this.harvest, pc, elapsed, farm.rewardsPerSecond, farm.rewardTokenPrice)
    this.pendingRewards += this.harvest;
  }

  public claim() {
    const rewards = this.pendingRewards;
    this.pendingRewards = 0;
    return rewards;
  }
}
type LPSnapshot = {
  timestamp: number;
  data: Univ2PoolSnapshot[];
};

type RewardSnapshot = {
  timestamp: number;
  data?: CamelotFarmRewardsSnapshot[];
};

export class CamelotFarm {
  private lastData!: LPSnapshot;
  private lastFarm!: RewardSnapshot;
  positions: FarmPosition[] = [];

  constructor() {}

  public update(data: LPSnapshot, farm: RewardSnapshot): boolean {
    if (!this.lastFarm) {
      if (!farm.data) return false;
      this.lastData = data;
      this.lastFarm = farm;
      return false;
    }

    if (farm.data) {
      this.lastFarm = { ...farm };
    }

    const elapsed = data.timestamp - this.lastData.timestamp;
    for (const pos of this.positions) {
      const pair = data.data.find((p) => p.symbol === pos.symbol)!;
      const lastFarm = this.lastFarm.data?.find(
        (p) => p.symbol === pos.symbol,
      )!;
      pos.process(elapsed, pair, lastFarm);
    }
    this.lastData = data;
    return true;
  }

  // amount in lp tokens
  public stake(amount: number, symbol: string): FarmPosition {
    const pos = new FarmPosition(amount, symbol);
    this.positions.push(pos);
    return pos;
  }

  public close(pos: FarmPosition) {
    const idx = this.positions.indexOf(pos);
    this.positions.splice(idx, 1);
  }
}
