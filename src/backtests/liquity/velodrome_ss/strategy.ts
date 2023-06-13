
import { Measurement, Schema } from "../../../lib/utils/timeseriesdb.js";
import { VelodromePosition, VelodromePositionManager } from "../../../lib/protocols/VelodromePositionManager.js";
import { VelodromeSnaphot } from "../../../lib/datasource/velodromeDex.js";
import { stringify } from 'csv-stringify/sync';
import fs from 'fs/promises'
import { ethers } from "ethers"
import { VelodromeRouterAbi } from "../../../lib/abis/VelodromeRouter.js"
import { toBigNumber, toNumber } from "../../../lib/utils/utility.js"

interface ILogAny extends Schema {
    tags: any
    fields: any
}

const Log = new Measurement<ILogAny, any, any>('ssc_lusd_strategy')

const HARVEST_PERIOD = 60 * 60 * 24 // 1 day
const TWO_WEEKS = 60 * 60 * 24 * 14
const ONE_YEAR = 60 * 60 * 24 * 14

const RPC = "https://optimism-mainnet.infura.io/v3/5e5034092e114ffbb3d812b6f7a330ad"
const VELODROME_ROUTER = "0x9c12939390052919aF3155f41Bf4160Fd3666A6f"

class Stats {
	// Calculate the average of all the numbers
	static mean(values: number[]) {
		const mean = (values.reduce((sum, current) => sum + current)) / values.length;
		return mean;
	};

	// Calculate variance
	static variance(values: number[]) {
		const average = Stats.mean(values);
		const squareDiffs = values.map((value) => {
			const diff = value - average;
			return diff * diff;
		});
		const variance = Stats.mean(squareDiffs);
		return variance;
	};

	// Calculate stand deviation
	static stddev(variance: number) {
		return Math.sqrt(variance);
	};
}


class SingleSidedVelodrome {

	public pos!: VelodromePosition
	public start!: number
	public highest: number
	public lastHarvest: number = 0
	public claimed = 0
	public idle = 0 // idle assets
	public maxDrawdown = 0
	public series: any[] = []
	count = 0;

    constructor(
		public name: string, 
		public poolSymbol: string, 
		public initial: number
	) {
		this.highest = initial
		// this.symbol = 'WETH/USDC'
    }

	public pool(data: VelodromeSnaphot) {
		return data.data.velodrome.find(p => p.symbol === this.poolSymbol)!
	}

	public poolIndex(data: VelodromeSnaphot) {
		return data.data.velodrome.findIndex(p => p.symbol === this.poolSymbol)!
	}

	private fromNumber(amount: number, decimals: number){
		return amount * 10**decimals
	}

	private router() {
		const provider = new ethers.providers.JsonRpcProvider(RPC)
		return new ethers.Contract(VELODROME_ROUTER, VelodromeRouterAbi as any, provider)
	}

	public async process(
		velodrome: VelodromePositionManager,
		data: VelodromeSnaphot,
	) {
		if (!this.pool(data)) {
			console.log('missing data for ' + this.name)
			return
		}
		// open the first position
        if (!this.pos) {
			const pool = this.pool(data)
			const poolIndex = this.poolIndex(data)
			const prices = [pool.tokens[0].price, pool.tokens[1].price]
			const decimals = [pool.tokens[0].decimals, pool.tokens[1].decimals]
			
			// const velo = this.router()
			// const quote = await velo.quoteAddLiquidity(
			// 	data.data.velodrome[0].tokens[0].address, 
			// 	data.data.velodrome[0].tokens[1].address, 
			// 	true, 
			// 	(10 ** data.data.velodrome[0].tokens[0].decimals).toString() , 
			// 	(10 ** data.data.velodrome[0].tokens[1].decimals).toString(), 
			// 	{ blockTag: velodrome.lastData.data.velodrome[0].block }
			// )
			// const amountA = toNumber(quote['amountA'], data.data.velodrome[0].tokens[0].decimals)
			// const amountB = toNumber(quote['amountB'], data.data.velodrome[0].tokens[1].decimals)
			// console.log(`amountA: ${amountA/prices[0]}`)
			// console.log(`amountB: ${amountB/prices[1]}`)
			// const ABRatio = amountA/amountB
			// const BDenominator = ABRatio + 1
			// console.log(`abratio: ${ABRatio}`)
			// const calculatedAmountA = (ABRatio*(1/BDenominator))
			// const calculatedAmountB = (1/BDenominator)
			// console.log(`ModifiedamountA: ${calculatedAmountA}`)
			// console.log(`ModifiedamountB: ${calculatedAmountB}`)
			// //const ratios = [calculatedAmountA, calculatedAmountB]
			// console.log(ratios)
			// console.log(`deposit A: ${Math.floor(((this.initial)*ratios[0])/prices[0] )}`)
			// console.log(`deposit B: ${Math.floor(((this.initial)*ratios[1])/prices[1] )}`)
			//const Boptimal = this.quoteLiquidity((10 ** data.data.velodrome[0].tokens[1].decimals), this.pos.reserves[1], this.pos.reserves[0])
			//console.log(`Boptimal: ${Boptimal}`)

			// console.log("velodrome: ")
			// const reserveA = velodrome.lastData.data.velodrome[poolIndex].tokens[0].reserve
			// const reserveB = velodrome.lastData.data.velodrome[poolIndex].tokens[1].reserve
			// let amountAOptimal = this.quoteLiquidity(1, reserveA, reserveB )
			// let amountBOptimal = this.quoteLiquidity(1, reserveB, reserveA)
			// let depositA = 1
			// let depositB = 1
			// let ratio = 0
			// if (amountBOptimal <= 1){
			// 	depositB = amountBOptimal
			// 	ratio = amountBOptimal

			// } else {
			// 	depositA = amountAOptimal
			// 	ratio = amountAOptimal
			// }
			// const ratioA = depositB / (ratio + 1)
			// const ratioB = depositA / (ratio + 1)
			// //const ratios = [ 0.5741067417692928, 0.4258932582307073 ]
			// ratios = [ratioA, ratioB]
			// const amounts = pool.tokens.map((e, i) => Math.floor(((this.initial)*ratios[i])/prices[i]))
			console.log(prices)
			console.log(pool.tokens[0].symbol)
			console.log(pool.tokens[1].symbol)
            this.pos = await velodrome.addLiquidity(this.poolSymbol, this.initial, 1)
			this.start = data.timestamp
			this.lastHarvest = this.start
			this.idle = this.initial - this.pos.valueUsd
        }

		if (data.timestamp - this.lastHarvest >= HARVEST_PERIOD) {
			this.harvest(data)
		}

		// always log data
		await this.log(data)
    }

	private estTotalAssets(data: VelodromeSnaphot) {
		return this.claimed + this.pos.valueUsd + this.idle
	}

	private harvest(data: VelodromeSnaphot) {
		const pool = this.pool(data)
		const claimed = this.pos.claim(pool)
		this.claimed += claimed
		this.lastHarvest = data.timestamp
	}

	private apy(data: VelodromeSnaphot) {
		const elapsed = data.timestamp - this.start
		if (elapsed < TWO_WEEKS)
			return 0
		const totalAssets = this.estTotalAssets(data)
		const profit = totalAssets - this.initial
		const apy = ((totalAssets / this.initial) ^ ( ONE_YEAR / elapsed)) - 1 
		return apy
	}

	private apr(data: VelodromeSnaphot) {
		const elapsed = data.timestamp - this.start
		return this.claimed / this.initial / (elapsed / ONE_YEAR)
	}

    public async log(data: VelodromeSnaphot) {
		const tokens: any = {}
		const prices: any = {}
		const pool = this.pool(data)
		pool.tokens.forEach((token, i) => {
			tokens[`token${i}`] = token.symbol
			prices[`price${i}`] = token.price
		})
		const totalAssets = this.estTotalAssets(data)
		this.highest = this.highest < totalAssets ? totalAssets : this.highest
		const drawdown = -(this.highest - totalAssets) / this.highest
		const { tokens: _t, prices: _p, reserves: _r, ...poolSnap} = pool as any
		this.maxDrawdown = Math.max(this.maxDrawdown, -drawdown)

		const apy = this.apy(data)
        const log = {
            tags: {
				name: this.name,
				pool: this.poolSymbol,
				...tokens,
            },
            fields: {
				strategy: this.name,
				...this.pos.snapshot,
				...prices,
				rewards: this.claimed,
				drawdown,
				...poolSnap,
				highest: this.highest,
				aum: totalAssets,
            },
            timestamp: new Date(data.timestamp * 1000),
        }
		if (this.count++ % 24 === 0) {
			this.count = 0
			if (apy !== 0)
				log.fields.apy = apy
			// console.log(log)
			try {
				await Log.writePoint(log)
			} catch(e) {
				await wait(10)
				await Log.writePoint(log)
			}
		}

		this.series.push({
			name: this.name,
			timestamp: data.timestamp,
			aum: totalAssets,
			rewards: this.claimed,
			lpAmount: this.pos.lpAmount,
			...tokens,
			...prices,
			...this.pos.snapshot,
		})

    }

	public async end(curve: VelodromePositionManager, data: VelodromeSnaphot) {
		this.idle = await curve.close(this.pos)
		console.log(this.idle)
		console.log('Strategy closing position', this.estTotalAssets(data))
		const variance = Stats.variance(this.series.map(e => e.aum))
		const stddev = Stats.stddev(variance)

		// Create summary
		const toDate = (time: number) => (new Date(time * 1000)).toISOString().replace(':00.000Z','').replace('T', ' ')
		return {
			name: this.name, 
			symbol: this.poolSymbol,
			initial: this.initial,
			aum: this.estTotalAssets(data),
			roi: (this.estTotalAssets(data) - this.initial) / this.initial,
			apy: this.apy(data),
			apr: this.apr(data),
			drawdown: this.maxDrawdown,
			rewards: this.claimed,
			start: toDate(this.start),
			end: toDate(data.timestamp),
			daysElapsed: (data.timestamp - this.start) / (60 * 60 * 24), // days
			variance,
			stddev,
		}
	}


}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class SingleSidedVelodromeStrategy {
	private curve = new VelodromePositionManager()
	private lastData!: VelodromeSnaphot
	// private aaveManager = new AAVEPositionManager()
	// private farm = new CamelotFarm()
	private strategies: SingleSidedVelodrome[] = []
    constructor() {
		const strategies = [
			{ initialInvestment: 100_000, name: 'A: sAMM-USDC/LUSD', pool: 'sAMM-USDC/LUSD' },
		]
		this.strategies = strategies.map(s => new SingleSidedVelodrome(s.name, s.pool, s.initialInvestment))
    }

    public async before() {
        await Log.dropMeasurement()
    }

    public async after() {
		const summary = await Promise.all(this.strategies.map(s => s.end(this.curve, this.lastData)))
		console.log(summary)
		const csv = stringify(summary, { header: true })
		fs.writeFile('./curve_ss.csv', csv)

		const series = this.strategies.map(s => s.series).flat()
		const seriesCsv = stringify(series, { header: true })
		fs.writeFile('./curve_ss_series.csv', seriesCsv)
    }

    public async onData(snapshot: VelodromeSnaphot) {
		this.lastData = snapshot
		// console.log('onData')
		this.curve.update(snapshot)

		// Process the strategy
		for (const strat of this.strategies) {
			// await wait(1)
			await strat.process(this.curve, snapshot)
		}
    }
}