import { FarmData, UniV2Data } from "./datasource/univ2DataSource.js"

export class FarmPosition {
	public harvest = 0;
	public pendingRewards = 0

    constructor(public staked: number) {}

    public process(elapsed: number, data: UniV2Data, farm: FarmData) {
		const pc = this.staked / data.totalSupply
		this.harvest = pc * elapsed * farm.rewardsPerSecond * farm.rewardTokenPrice
		this.pendingRewards += this.harvest
    }
}

export class CamelotFarm {
	private lastData!: UniV2Data
	private lastFarm!: FarmData
    positions: FarmPosition[] = []
	rewardTokenPrice: number = 0
	rewardsPerSecond: number = 0
	
    constructor() {}

    public update(data: UniV2Data, farm?: FarmData): boolean {
        if (!this.lastData) {
            this.lastData = data
			this.lastFarm = {
				timestamp: data.timestamp,
				rewardsPerSecond: 0,
				rewardTokenPrice: 0,
			}
            return false
        }

		if (farm) {
			this.lastFarm = { ...farm }
		}

		const elapsed = data.timestamp - this.lastData.timestamp
        for (const pos of this.positions) {
            pos.process(elapsed, data, this.lastFarm)
        }
        this.lastData = data
        return true
    }

	// amount in lp tokens
    public stake(amount: number): FarmPosition {
        const pos = new FarmPosition(amount)
        this.positions.push(pos)
        return pos
    }

    public close(pos: FarmPosition){
        const idx = this.positions.indexOf(pos)
        this.positions.splice(idx, 1)
    }
}