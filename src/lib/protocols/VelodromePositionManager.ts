//import { CurveStableSwapAbi } from "../abis/CurveStableSwapAbi.js"
import { VelodromeRouterAbi } from "../abis/VelodromeRouter.js"
import { VelodromePoolSnapshot, VelodromeSnaphot } from "../datasource/velodromeDex.js"
import { ethers, BigNumber} from "ethers"
import { toBigNumber, toNumber } from "../utils/utility.js"
import { Curve2CryptoAbi } from "../abis/Curve2CryptoAbi.js"
import { VelodromePairFactoryAbi } from "../abis/VelodromePairFactoryAbi.js"

const RPC = "https://optimism-mainnet.infura.io/v3/5e5034092e114ffbb3d812b6f7a330ad"
const VELODROME_ROUTER = "0x9c12939390052919aF3155f41Bf4160Fd3666A6f"
const VELODROME_FACTORY = "0x25CbdDb98b35ab1FF77413456B31EC81A6B6B746"

export class VelodromePosition {
	public totalSupply
	public valueUsd
	public symbol: string
	public reserves: number[]
	public price: number
	public stakeTimestamp: number = 0

    private constructor(
        public data: VelodromePoolSnapshot,
        public lpAmount: number,
    ) {
		this.symbol = data.symbol
		this.stakeTimestamp = data.timestamp
		this.totalSupply = data.totalSupply
		this.price = data.price
		this.valueUsd = this.lpAmount * data.price
		this.reserves = data.tokens.map(e => e.reserve)
	}

	static contract(data: VelodromePoolSnapshot) {
		const provider = new ethers.providers.JsonRpcProvider(RPC)
		return new ethers.Contract(data.pool, Curve2CryptoAbi as any, provider)
	}

	static router() {
		const provider = new ethers.providers.JsonRpcProvider(RPC)
		return new ethers.Contract(VELODROME_ROUTER, VelodromeRouterAbi as any, provider)
	}

	static pairFactory() {
		const provider = new ethers.providers.JsonRpcProvider(RPC)
		return new ethers.Contract(VELODROME_FACTORY, VelodromePairFactoryAbi as any, provider)
	}

	static getFee(stable: Boolean) {
		const provider = new ethers.providers.JsonRpcProvider(RPC)
		const factory = new ethers.Contract(VELODROME_FACTORY, VelodromePairFactoryAbi as any, provider)
		return factory.getFee(stable)
	}

	static calc_token_amount(data: VelodromePoolSnapshot, amounts: ethers.BigNumber[], stable: Boolean) {
		const velo = VelodromePosition.router()
		return velo.quoteAddLiquidity(data.tokens[0].address, data.tokens[1].address, stable, amounts[0], amounts[1], { blockTag: data.block })
	}

	static calc_withdraw_one_coin(data: VelodromePoolSnapshot, amount: ethers.BigNumber, stable: Boolean) {
		const velo = VelodromePosition.router()
		return velo.quoteRemoveLiquidity(data.tokens[0].address, data.tokens[1].address, stable, amount, { blockTag: data.block })
	}
	
	static quoteLiquidity(amountA: number, reserveA: number, reserveB: number){
		return amountA * reserveB / reserveA;
	}

	static getAmountOut(router: any, amount: BigNumber, tokenIn: string, tokenOut: string){
			return router.getAmountOut(amount, tokenIn, tokenOut)
	}

	static getDepositRatio(data: VelodromePoolSnapshot) {
		const reserveA = data.tokens[0].reserve
		const reserveB = data.tokens[1].reserve
		let amountAOptimal=this.quoteLiquidity(1, reserveA, reserveB )
		let amountBOptimal=this.quoteLiquidity(1, reserveB, reserveA)
		let depositA = 1
		let depositB = 1
		let ratio = 0
		if (amountBOptimal <= 1){
			depositB = amountBOptimal
			ratio = amountBOptimal
		} else {
			depositA = amountAOptimal
			ratio = amountAOptimal
		}
		const ratioA = depositB / (ratio + 1)
		const ratioB = depositA / (ratio + 1)
		return [ratioA, ratioB]
	}

	static async open(data: VelodromePoolSnapshot, amount: number, tokenIndex: number) {
		if(tokenIndex > 1)
			throw new Error('Invalid Token Index!')
		console.log('openning position')

		const ratios = this.getDepositRatio(data)
		const prices = [data.tokens[0].price, data.tokens[1].price]
		const spotA = await this.getAmountOut(this.router(), toBigNumber(10**6), data.tokens[0].address, data.tokens[1].address)
		const spotB = await this.getAmountOut(this.router(), toBigNumber(10**18), data.tokens[1].address, data.tokens[0].address)
		console.log(`spotA: ${spotA[0] / (10**data.tokens[1].decimals)}`)
		console.log(`spotB: ${spotB[0] / (10**data.tokens[0].decimals)}`)
		console.log(`prices: ${prices}`)
		const amounts = data.tokens.map((e, i) => Math.floor((amount)*ratios[i]))
		const swapAmount = Math.floor((amount/prices[tokenIndex]))-amounts[tokenIndex]
		const amountOut = await this.getAmountOut(this.router(), ethers.utils.parseUnits(swapAmount.toString(), data.tokens[tokenIndex].decimals), data.tokens[tokenIndex].address, data.tokens[tokenIndex==1 ? 0:1].address)
		const slippage = amounts[tokenIndex==1 ? 0:1] - (amountOut[0] / (10 ** data.tokens[tokenIndex==1 ? 0:1].decimals))
		console.log(`slippage: ${slippage}`)
		amounts[tokenIndex==1 ? 0:1] = amountOut[0] / (10 ** data.tokens[tokenIndex==1 ? 0:1].decimals)
		const lpPercent = ((amounts[tokenIndex==1 ? 0:1])/data.tokens[tokenIndex==1 ? 0:1].reserve)
		const lpEstimated = lpPercent*(data.totalSupply)
		//console.log(data)
		let usdDiff = (amount - (slippage/prices[tokenIndex==1 ? 0:1]))-(lpEstimated*data.price)
		let lusdDiff = usdDiff/prices[tokenIndex]
		console.log(`usdDiff: ${usdDiff}`)
		console.log(`lusdDiff: ${lusdDiff}`)
		console.log(`lpEstimated: ${lpEstimated}`)

		return new VelodromePosition(data, lpEstimated)
	}

	public async close(data: VelodromePoolSnapshot) {
		const lpTokensBN = toBigNumber(this.lpAmount, 18)
		console.log(`lptokensbn: ${lpTokensBN}`)
		const tokenAmounts = await VelodromePosition.calc_withdraw_one_coin(data, lpTokensBN, true)		

		const price0 = data.tokens[0].price
		const price1 = data.tokens[1].price
		this.valueUsd = 0
		this.lpAmount = 0
		const amountUSD0 = toNumber(tokenAmounts[0], data.tokens[0].decimals) * price0
		const amountUSD1 = toNumber(tokenAmounts[1], data.tokens[1].decimals) * price1
		return amountUSD0+amountUSD1
	}

    public processData(data: VelodromePoolSnapshot) {
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

	public pendingRewards(data: VelodromePoolSnapshot) {
		return 0
	}

	public claim(data: VelodromePoolSnapshot) {
		const rewardsUSD = this.pendingRewards(data)
		this.stakeTimestamp = data.timestamp
		return rewardsUSD
	}
}

export class VelodromePositionManager {
    lastData!: VelodromeSnaphot
	positions: VelodromePosition[] = []

    constructor() {

    }   

    public update(snapshot: VelodromeSnaphot): boolean {
        if (!this.lastData) {
            this.lastData = snapshot
            return false
        }

			for (const pos of this.positions) {
				const pair = snapshot.data.velodrome.find(p => p.symbol === pos.symbol)
			if (pair)
            	pos.processData(pair)
        }

        this.lastData = snapshot
        return true
    }

    public async addLiquidity(
		symbol: string,
		amount: number,
		tokenIndex: number
    ): Promise<VelodromePosition> {
        if (!this.lastData)
            throw new Error('wow')
		
		const pair = this.lastData.data.velodrome.find(p => p.symbol === symbol)!
		const pos = await VelodromePosition.open(pair, amount, tokenIndex)
		this.positions.push(pos)
		return pos
    }

	// Assumes exiting into 1 token
    public close(pos: VelodromePosition){
			const idx = this.positions.indexOf(pos)
			this.positions.splice(idx, 1)
			console.log(this.lastData)
			const pair = this.lastData.data.velodrome.find(p => p.symbol === pos.symbol)!
			return pos.close(pair)
    }
}