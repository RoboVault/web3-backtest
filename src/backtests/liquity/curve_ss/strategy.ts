
import { Measurement, Schema } from "../../../lib/utils/timeseriesdb.js";
import { CurvePosition, CurvePositionManager } from "../../../lib/protocols/CurvePositionManager.js";
import { CurveSnaphot } from "../../../lib/datasource/curveDex.js";

interface ILogAny extends Schema {
    tags: any
    fields: any
}

const Log = new Measurement<ILogAny, any, any>('ssc_lusd_strategy')

const HARVEST_PERIOD = 60 * 60 * 24 // 1 day

class SingleSidedCurve {

	public pos!: CurvePosition
	public start!: number
	public highest: number
	public lastHarvest: number = 0
	public claimed = 0
	public idle = 0 // idle assets

    constructor(
		public name: string, 
		public tokenIndex: number, 
		public poolSymbol: string, 
		public initial: number
	) {
		this.highest = initial
		// this.symbol = 'WETH/USDC'
    }

	public pool(data: CurveSnaphot) {
		return data.data.curve.find(p => p.symbol === this.poolSymbol)!
	}

    public async process(
		curve: CurvePositionManager,
		data: CurveSnaphot,
	) {
		// open the first position
        if (!this.pos) {
			const pool = this.pool(data)
			const price = pool.tokens[this.tokenIndex].price
			const amounts = pool.tokens.map((e, i) => i === this.tokenIndex ? this.initial / price : 0)
			console.log(price)
			console.log(pool.tokens[0].symbol)
			console.log(amounts)
            this.pos = await curve.addLiquidity(this.poolSymbol, amounts)
			this.start = data.timestamp
			this.lastHarvest = this.start
        }

		if (data.timestamp - this.lastHarvest >= HARVEST_PERIOD) {
			this.harvest(data)
		}

		// always log data
		await this.log(data)
    }

	private estTotalAssets(data: CurveSnaphot) {
		return this.claimed + this.pos.valueUsd + this.idle
	}

	private harvest(data: CurveSnaphot) {
		const pool = this.pool(data)
		const claimed = this.pos.claim(pool)
		this.claimed += claimed
		this.lastHarvest = data.timestamp
	}

	private apy(data: CurveSnaphot) {
		const pool = this.pool(data)
		const elapsed = data.timestamp - this.start
		const TWO_WEEKS = 60 * 60 * 24 * 14
		const ONE_YEAR = 60 * 60 * 24 * 14
		if (elapsed < TWO_WEEKS)
			return 0
		const totalAssets = this.estTotalAssets(data)
		const profit = totalAssets - this.initial
		const apy = profit / this.initial / (elapsed / ONE_YEAR)
		return apy
	}

    public async log(data: CurveSnaphot) {
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

	public async end(curve: CurvePositionManager, data: CurveSnaphot) {
		this.idle = await curve.close(this.pos, this.tokenIndex)
		console.log(this.idle)
		console.log('Strategy closing position', this.estTotalAssets(data))
	}

}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class SingleSidedCurveStrategy {
	private curve = new CurvePositionManager()
	private lastData!: CurveSnaphot
	// private aaveManager = new AAVEPositionManager()
	// private farm = new CamelotFarm()
	private strategies: SingleSidedCurve[] = []
    constructor() {
		const strategies = [
			{ name: '10k', pool: 'LUSD3CRV-f', initialInvestment: 10_000, tokenIndex: 0},
		]
		this.strategies = strategies.map(s => new SingleSidedCurve(s.name, s.tokenIndex, s.pool, s.initialInvestment))
    }

    public async before() {
        await Log.dropMeasurement()
    }

    public async after() {
		await Promise.all(this.strategies.map(s => s.end(this.curve, this.lastData)))
		// this.strategies.forEach(s => {
		// 	const data = this.getDataUpdate(this.lastData!)
		// 	console.log(s.summary(data))
		// })
        // console.log('Back test finished')
    }

    public async onData(snapshot: CurveSnaphot) {
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