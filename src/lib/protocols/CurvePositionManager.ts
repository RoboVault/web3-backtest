import { CurveStableSwapAbi } from "../abis/CurveStableSwapAbi.js"
import { CurvePoolSnapshot, CurveSnaphot } from "../datasource/curveDex.js"
import { ethers } from "ethers"
import { toBigNumber, toNumber } from "../utils/utility.js"
import { Curve2CryptoAbi } from "../abis/Curve2CryptoAbi.js"

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

	static contract(data: CurvePoolSnapshot) {
		const provider = new ethers.providers.JsonRpcProvider(RPC)
		if (data.symbol === 'bLUSDLUSD3-f')
			return new ethers.Contract(data.pool, Curve2CryptoAbi as any, provider)
		else 
			return new ethers.Contract(data.pool, CurveStableSwapAbi as any, provider)
	}

	static calc_token_amount(data: CurvePoolSnapshot, amounts: ethers.BigNumber[]) {
		const curve = CurvePosition.contract(data)
		if (data.symbol === 'bLUSDLUSD3-f')
			return curve.calc_token_amount(amounts, { blockTag: data.block })
		else 
			return curve.calc_token_amount(amounts, true, { blockTag: data.block })
	}

	static calc_withdraw_one_coin(data: CurvePoolSnapshot, amount: ethers.BigNumber, index: number) {
		const curve = CurvePosition.contract(data)
		if (data.symbol === 'bLUSDLUSD3-f')
			return curve.calc_withdraw_one_coin(amount, index, { blockTag: data.block })
		else 
			return curve.calc_withdraw_one_coin(amount, index, { blockTag: data.block })
	}
	
	static async open(data: CurvePoolSnapshot, amounts: number[]) {
		console.log('openning position')
		
		const amountsBigInt = amounts.map((a, i) => toBigNumber(a, data.tokens[i].decimals))
		
		const lpAcountBigInt = await CurvePosition.calc_token_amount(data, amountsBigInt)
		const lpAmount = toNumber(lpAcountBigInt, 18)
		console.log(lpAmount)
		return new CurvePosition(data, lpAmount)
	}

	public async close(data: CurvePoolSnapshot, index: number) {
		const lpTokensBN = toBigNumber(this.lpAmount, 18)
		const tokenAmount = await CurvePosition.calc_withdraw_one_coin(data, lpTokensBN, index)		
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
			const pair = snapshot.data.curve.find(p => p.symbol === pos.symbol)
			if (pair)
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