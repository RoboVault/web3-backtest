import { Measurement, Schema } from "../data/timeseriesdb.js";
import type { Strategy } from "../core/types/strategy.js";
import { GLPData } from "../core/datasource/GmxDataSource.js";
import { GLPPosition, GLPPositionManager } from "../core/GLPPositionManager.js";
import { GMXPosition, GMXPositionManager } from "../core/GMXPositionManager.js";

interface ILogAny extends Schema {
    tags: any
    fields: any
}

const Log = new Measurement<ILogAny, any, any>('nglp_strategy')
const GlpPositionLog = new Measurement<ILogAny, any, any>('glp_position')
const GmxPositionLog = new Measurement<ILogAny, any, any>('gmx_position')
const RebalanceLog = new Measurement<ILogAny, any, any>('rebalance')

type AumType = 'AmountsUsdg' | 'withoutTraderPnL' | 'withTraderPnL'

class nGLPStrategySim {

    public firstPosition = true

	public glpPosition!: GLPPosition
	public ethShort!: GMXPosition
	public btcShort!: GMXPosition
	public rebalanceCount = 0
	public harvestSum = 0

    constructor(
		public id: string,
		public glp: GLPPositionManager,
		public gmx: GMXPositionManager,
        public initialInvestment: number,
        public aumType: AumType,
		public debtRange: number,
    ) {
    }

    public async process(data: GLPData) {
        this.log(data)

        if (this.firstPosition) {
            this.openPosition(data, this.initialInvestment)
        } else {
			const { debtRatio }  = this.calcDebtRatios(data)

			const isOutOfRange = (debtRatio: number) => {
				return debtRatio < (1 - this.debtRange) || debtRatio > (1 + this.debtRange)
			}
			if (isOutOfRange(debtRatio)) {
				this.rebalancePosition(data)
			}
		}

		this.harvestSum += this.glpPosition.snapshot.rewards
    }

	private getAum(data: GLPData, token: 'BTC' | 'ETH') {
		switch (this.aumType) {
			case 'AmountsUsdg': 
				return token === 'BTC' ? data.btcAumA : data.ethAumA
			case 'withoutTraderPnL': 
				return token === 'BTC' ? data.btcAumB : data.ethAumB
			case 'withTraderPnL': 
				return token === 'BTC' ? data.btcAumC : data.ethAumC
		}

	}

	private getRatio(data: GLPData, token: 'BTC' | 'ETH') {
		switch (this.aumType) {
			case 'AmountsUsdg': 
				return token === 'BTC' ? data.btcRatioA : data.ethRatioA
			case 'withoutTraderPnL': 
				return token === 'BTC' ? data.btcRatioB : data.ethRatioB
			case 'withTraderPnL': 
				return token === 'BTC' ? data.btcRatioC : data.ethRatioC
		}

	}	

	private desiredPosition(data: GLPData, investment: number) {
		const i = investment
		const l = 5.5 // target leverage
		const br =  this.getRatio(data, 'BTC') // Bitcoin ratio
		const er =  this.getRatio(data, 'ETH') // Ethereum ratio
		const glpAmount = (i * l) / (br + er + l)
		const btcCollateral = (i * br) / (br + er + l)
		const ethCollateral = (i * er) / (br + er + l)
		return { i, l, br, er, glpAmount, btcCollateral, ethCollateral }
	}

    public openPosition(data: GLPData, investment: number) {	
		console.log(`Openning first position with ${this.initialInvestment} DAI`)
		const { l, glpAmount, btcCollateral, ethCollateral } = this.desiredPosition(data, investment)
		this.glpPosition = this.glp.OpenPosition(glpAmount)
		this.btcShort = this.gmx.openShort(btcCollateral, l, 'BTC')
		this.ethShort = this.gmx.openShort(ethCollateral, l, 'ETH')
		this.firstPosition = false
    }

	public timestring(ts: number) {
		const d = new Date(ts * 1000)
		return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`
	}

    public rebalancePosition(data: GLPData) {
		const { btcDebtRatio, ethDebtRatio }  = this.calcDebtRatios(data)
		const totalAssets = this.totalAssets(data)

		console.log(`${this.timestring(data.timestamp)} | Rebalancing!`, data.block, btcDebtRatio, ethDebtRatio)

		// Calc the size we need 
		const { l, glpAmount, btcCollateral, ethCollateral } = this.desiredPosition(data, totalAssets)

		// Adjust GLP Position
		const glpDiffUsd = glpAmount - this.glpPosition.snapshot.valueUsd
		if(glpDiffUsd > 0) {
			this.glpPosition.increase(data, glpDiffUsd)
		} else {
			this.glpPosition.decrease(data, -glpDiffUsd)
		}

		// Adjust short positions
		let borrowFee = 0
		borrowFee += this.ethShort.adjustPosition(data, ethCollateral, l)
		borrowFee += this.btcShort.adjustPosition(data, btcCollateral, l)
		this.harvestSum -= borrowFee

		RebalanceLog.writePoint({
			tags: {},
			fields: { 
				btcDebtRatio,
				ethDebtRatio,
			},
			timestamp: new Date(data.timestamp * 1000)
		})
		this.rebalanceCount++
    }

    public totalAssets(data: GLPData) {
		return this.glpPosition.snapshot.valueUsd + 
			this.btcShort.valueUsd() +
			this.ethShort.valueUsd()
    }

    private calcDebtRatios(data: GLPData) {
		const btcLong = this.getRatio(data, 'BTC') * this.glpPosition.snapshot.valueUsd
		const btcShort = -this.btcShort.positionBase * data.btcPrice
		const btcDebtRatio = btcLong / btcShort

		const ethLong = this.getRatio(data, 'ETH') * this.glpPosition.snapshot.valueUsd
		const ethShort = -this.ethShort.positionBase * data.ethPrice
		const ethDebtRatio = ethLong / ethShort

		const longSum = (ethLong * data.ethPrice) + (btcLong * data.btcPrice)
		const shortSum = (ethShort * data.ethPrice) + (btcShort * data.btcPrice)
		const debtRatio = longSum / shortSum

		return {btcDebtRatio, ethDebtRatio, debtRatio }
    }

    private async log(data: GLPData) {
        if (!this.glpPosition?.snapshot) {
			return
		}

        const totalAssets = this.totalAssets(data)
		const timestamp = new Date(data.timestamp * 1000)
		const { btcDebtRatio, ethDebtRatio, debtRatio } = this.calcDebtRatios(data)

		// Strategy log
        const strategyLog = {
            tags: {
				strategy: this.id,
				aumType: this.aumType
            },
            fields: {
				...data,
				totalAssets,
				btcDebtRatio,
				ethDebtRatio,	
				debtRatio,
				rebalanceCount: this.rebalanceCount,	
				block: data.block,	
				harvestSum: this.harvestSum,
            },
            timestamp,
        }
        // console.log(strategyLog.timestamp)
        // console.log(strategyLog)
        try {
			// Log GLP Position
            await GlpPositionLog.writePoint({
				tags: {strategy: this.id, aumType: this.aumType },
				fields: { ...this.glpPosition.snapshot },
				timestamp
			})

			// Log Short Positions
            await GmxPositionLog.writePoint({
				tags: { shortToken: 'BTC', strategy: this.id, aumType: this.aumType},
				fields: { ...this.btcShort.snapshot },
				timestamp
			})
            await GmxPositionLog.writePoint({
				tags: { shortToken: 'ETH', strategy: this.id, aumType: this.aumType},
				fields: { ...this.ethShort.snapshot },
				timestamp
			})

            await Log.writePoint(strategyLog)
        } catch(e) {
			console.log(strategyLog)
            throw new Error('Log Failed')
        }

    }
}

const wait = async (ms: number) => {
	return new Promise((resolve) => {
		setTimeout(resolve, ms)
	})
}


export class nGLPStrategy implements Strategy {
    glp: GLPPositionManager
    gmx: GMXPositionManager
    strategies: nGLPStrategySim[] = []

    constructor() {
        const amount = 10000 // USD amount
        this.glp = new GLPPositionManager()
        this.gmx = new GMXPositionManager()
		const debtRange = 0.03
        this.strategies.push(new nGLPStrategySim(
			'standard',
			this.glp, this.gmx, 
			amount, 
			'withoutTraderPnL',
			debtRange
		))
        this.strategies.push(new nGLPStrategySim(
			'withTraderPnL',
			this.glp, this.gmx, 
			amount, 
			'withTraderPnL',
			debtRange
		))
    }

    public async before() {
        await Log.dropMeasurement()
		await GlpPositionLog.dropMeasurement()
		await GmxPositionLog.dropMeasurement()
    }

    public async after() {
        console.log('Back test finished')
    }

    public async onData(data: any) {
		await wait(10)
		await this.gmx.update(data)
        if (await this.glp.update(data)) {
            // skip on first data
            return
        }

		// Procress the strategy
        await Promise.all(this.strategies.map(e => e.process(data)))
    }
}
