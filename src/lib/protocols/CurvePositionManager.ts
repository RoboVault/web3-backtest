import { CurveStableSwapAbi } from "../abis/CurveStableSwapAbi.js"
import { CurvePoolSnapshot, CurveSnaphot } from "../datasource/curveDex.js"
import { ethers } from "ethers"
import { toBigNumber, toNumber } from "../utils/utility.js"

const RPC = "https://rpc.ankr.com/eth"

export class CurvePosition {
	public totalSupply
	public valueUsd
	public symbol: string
	public reserves: number[]
	public price: number
	public stakeTimestamp: number = 0

    private constructor(
        public data: CurvePoolSnapshot,
        public lpAmount: number,
    ) {
		this.symbol = data.symbol
		this.stakeTimestamp = data.timestamp
		this.totalSupply = data.totalSupply
		this.price = data.price
		this.valueUsd = this.lpAmount * data.price
		this.reserves = data.tokens.map(e => e.reserve)
	}
	
	static async open(data: CurvePoolSnapshot, amounts: number[]) {
		console.log('openning position')
		const provider = new ethers.providers.JsonRpcProvider(RPC)
		const curve = new ethers.Contract(data.pool, CurveStableSwapAbi as any, provider)
		const amountsBigInt = amounts.map((a, i) => toBigNumber(a, data.tokens[i].decimals))
		const lpAcountBigInt = await curve.calc_token_amount(amountsBigInt, true, { blockTag: data.block })
		const lpAmount = toNumber(lpAcountBigInt, 18)
		console.log(lpAmount)
		return new CurvePosition(data, lpAmount)
	}

	public async close(data: CurvePoolSnapshot, index: number) {
		const provider = new ethers.providers.JsonRpcProvider(RPC)
		const curve = new ethers.Contract(data.pool, CurveStableSwapAbi as any, provider)
		const lpTokensBN = toBigNumber(this.lpAmount, 18)
		const tokenAmount = await curve.calc_withdraw_one_coin(lpTokensBN, index)		
		const price = data.tokens[index].price
		this.valueUsd = 0
		this.lpAmount = 0
		const amountUSD = toNumber(tokenAmount, data.tokens[index].decimals) * price
		return amountUSD
	}

    public processData(data: CurvePoolSnapshot) {
		this.totalSupply = data.totalSupply
		this.price = data.price
		this.valueUsd = this.lpAmount * data.price
		this.reserves = data.tokens.map(e => e.reserve)
    }

	public get snapshot() {
		const reserves: any = {}
		this.data.tokens.forEach((e, i) => {
			reserves[`reserves${i}`] = this.reserves[i]
		})
		return {
			totalSupply: this.totalSupply,
			price: this.price,
			valueUsd: this.valueUsd,
			lpAmount: this.lpAmount,
			...reserves,
		}
	}

	public pendingRewards(data: CurvePoolSnapshot) {
		const period = data.timestamp - this.stakeTimestamp
		const positionRelativeWeight = this.lpAmount / data.gaugeTotalSupply
		const crvRewards = data.crvRate * data.gaugeRelativeWeight * period * positionRelativeWeight
		return crvRewards * data.crvPrice
	}

	public claim(data: CurvePoolSnapshot) {
		const rewardsUSD = this.pendingRewards(data)
		this.stakeTimestamp = data.timestamp
		return rewardsUSD
	}
}

export class CurvePositionManager {
    lastData!: CurveSnaphot
	positions: CurvePosition[] = []

    constructor() {

    }   

    public update(snapshot: CurveSnaphot): boolean {
        if (!this.lastData) {
            this.lastData = snapshot
            return false
        }

        for (const pos of this.positions) {
			const pair = snapshot.data.curve.find(p => p.symbol === pos.symbol)!
            pos.processData(pair)
        }

        this.lastData = snapshot
        return true
    }

    public async addLiquidity(
		symbol: string,
		amounts: number[],
    ): Promise<CurvePosition> {
        if (!this.lastData)
            throw new Error('wow')
		
		const pair = this.lastData.data.curve.find(p => p.symbol === symbol)!
		const pos = await CurvePosition.open(pair, amounts)
		this.positions.push(pos)
		return pos
    }

	// Assumes exiting into 1 token
    public close(pos: CurvePosition, tokenIndex: number){
        const idx = this.positions.indexOf(pos)
        this.positions.splice(idx, 1)
		const pair = this.lastData.data.curve.find(p => p.symbol === pos.symbol)!
		return pos.close(pair, tokenIndex)
    }
}