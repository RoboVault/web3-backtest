import { ethers } from "ethers"
import { GlpVaultAbi } from "../abis/glp-vault-abi.js"
import { toNumber } from "../utils/utility.js"
import { GLPData } from "./datasource/GmxDataSource.js"


const OPEN_FEE = 0.001
const SWAP_FEE = 0.0025 // No longer used
const VAULT = '0x489ee077994B6658eAfA855C308275EAd8097C4A'
const DAI = '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1'

export class GLPPosition {
	public open: boolean = true
	public lastCumulativeRewardPerToken
	public mintBurnFee = 0
	public snapshot: {
		openPrice: number
		openValueUsd: number
		valueUsd: number
		amount: number
		rewards: number
		openFee: number
		swapFee: number
		mintBurnFee: number
	}
	public vault: ethers.Contract
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
			mintBurnFee: 0,
		}
		this.lastCumulativeRewardPerToken = data.cumulativeRewardPerToken
		const provider = new ethers.providers.JsonRpcProvider('https://rpc.ankr.com/arbitrum/af86a2e6f3c814ccf008f195be5c8fd7721fcb55ed6b38b607c84b01a50956a0')
		this.vault = new ethers.Contract(VAULT, GlpVaultAbi, provider)
	}

	private harvestRewards(data: GLPData): number {
		const newRewardsPerToken = data.cumulativeRewardPerToken - this.lastCumulativeRewardPerToken
		if (newRewardsPerToken === 0)
			return 0
		const earnedETH = this.snapshot.amount * newRewardsPerToken
		return earnedETH * data.ethPrice
	}

	public async dynamicFee(data: GLPData, amountUsd: number, increase: boolean) {
		const block = data.block
		const amount = Math.round(amountUsd * 1e18)
		const get = async () =>  {
			let retry = 0
			while(retry < 5) {
				try {
					return await this.vault.getFeeBasisPoints(DAI, `0x${amount.toString(16)}`, 25, 0, increase, {blockTag: block})
				} catch(e) {
					console.log('failed. Trying again', retry)
					retry++
				}
				await new Promise((resolve) => setTimeout(resolve, 200))
			}
			throw new Error('Failed to fetch getFeeBasisPoints')
		}
		return await get()
	}

	public async increase(data: GLPData, amountUsd: number) {
		const feeBps = 0.25//toNumber(await this.dynamicFee(data, amountUsd, true), 2)
		this.mintBurnFee = feeBps
		const mintFee = amountUsd * feeBps
		const increaseGlpAmount = (amountUsd - mintFee) / data.glpPrice
		this.snapshot.amount = this.snapshot.amount + increaseGlpAmount
		this.snapshot.valueUsd = this.snapshot.amount * data.glpPrice
		this.snapshot.rewards = 0
		this.snapshot.openFee = 0
		this.snapshot.swapFee = feeBps
		this.snapshot.mintBurnFee = this.mintBurnFee
	}

	public async decrease(data: GLPData, amountUsd: number) {
		const feeBps = 0.25//toNumber(await this.dynamicFee(data, amountUsd, false), 2)
		this.mintBurnFee = feeBps
		const burnFee = amountUsd * feeBps
		const decreaseGlpAmount = (amountUsd - burnFee) / data.glpPrice
		this.snapshot.amount = this.snapshot.amount - decreaseGlpAmount
		this.snapshot.valueUsd = this.snapshot.amount * data.ethPrice
		this.snapshot.rewards = 0
		this.snapshot.openFee = 0
		this.snapshot.swapFee = feeBps
		this.snapshot.mintBurnFee = this.mintBurnFee
	}

	public processSample(data: GLPData) {
		const snapshot = this.snapshot
		snapshot.rewards = this.harvestRewards(data)
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