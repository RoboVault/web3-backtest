import { GLPData } from "./datasource/GmxDataSource.js"


const OPEN_FEE = 0.001
const SWAP_FEE = 0.001 // Assumes a constant swap fee when increasing/decreasing the position??

export class GLPPosition {
	public open: boolean = true
	public lastCumulativeRewardPerToken
	public snapshot: {
		openPrice: number
		openValueUsd: number
		valueUsd: number
		amount: number
		rewards: number
		openFee: number
		swapFee: number
	}
	constructor(data: GLPData, private glpAmount: number) {
		const openFee = glpAmount * OPEN_FEE
		const swapFee = 0 // User pays swap fee on open
		const glpAmountWithFee = glpAmount - openFee - swapFee
		console.log(`created GLP position with ${glpAmount} GLP`)
		const valueUsd = glpAmountWithFee * data.glpPrice
		this.snapshot = {
			openPrice: data.glpPrice,
			amount: glpAmountWithFee,
			openValueUsd: valueUsd,
			valueUsd: valueUsd,
			rewards: 0,
			openFee,
			swapFee,
		}
		this.lastCumulativeRewardPerToken = data.cumulativeRewardPerToken
	}

	private harvestRewards(data: GLPData): number {
		const newRewardsPerToken = data.cumulativeRewardPerToken - this.lastCumulativeRewardPerToken
		if (newRewardsPerToken === 0)
			return 0
		const earnedETH = this.snapshot.amount * newRewardsPerToken
		return earnedETH * data.ethPrice
	}

	public increase(data: GLPData, amountUsd: number) {
		// TODO - Calc the funding fee using ethersjs

		const swapFee = amountUsd * SWAP_FEE
		const increaseGlpAmount = (amountUsd - swapFee) / data.glpPrice
		this.snapshot.amount = this.snapshot.amount + increaseGlpAmount
		this.snapshot.valueUsd = this.snapshot.amount * data.glpPrice
		this.snapshot.rewards = 0
		this.snapshot.openFee = 0
		this.snapshot.swapFee = swapFee
	}

	public decrease(data: GLPData, amountUsd: number) {
		// TODO - Calc the funding fee using ethersjs

		const swapFee = amountUsd * SWAP_FEE
		const decreaseGlpAmount = (amountUsd - swapFee) / data.glpPrice
		this.snapshot.amount = this.snapshot.amount - decreaseGlpAmount
		this.snapshot.valueUsd = this.snapshot.amount * data.ethPrice
		this.snapshot.rewards = 0
		this.snapshot.openFee = 0
		this.snapshot.swapFee = swapFee
	}

	public processSample(data: GLPData) {
		const snapshot = this.snapshot
		snapshot.rewards = this.harvestRewards(data)
		// assums autocompounded rewards
		snapshot.amount = snapshot.amount + (snapshot.rewards / data.glpPrice)
		snapshot.valueUsd = snapshot.amount * data.glpPrice
		snapshot.openFee = 0;
		snapshot.swapFee = 0;
		this.lastCumulativeRewardPerToken = data.cumulativeRewardPerToken
	}
	public close() {
		this.open = false
	}
}


export class GLPPositionManager {
    lastData!: GLPData
    positions: GLPPosition[] = []
	
	/**
	 * @brief update sample data
	 * 
	 * @param data sample data
	 * @returns true if it's the first sample
	 */
	public update(data: GLPData): boolean {
		const isFirst = !this.lastData
		this.lastData = data

		for (const pos of this.positions) {
			if (pos.open) {
				pos.processSample(data)
			}
		}
		return isFirst
	}

	/**
	 * @brief Creates a GLP position
	 * @param Amount dai amount
	 */
	public OpenPosition(amount: number) {
		if (!this.lastData)
			throw new Error('No data samples available')

		// TODO: Extend to support opening with other tokens
		// TODO: calculate slippage on entrance
		console.log(this.lastData)
		
		const pos = new GLPPosition(this.lastData, (amount / this.lastData.glpPrice) )
		this.positions.push(pos)
		return pos
	}
}