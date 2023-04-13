import { Measurement, Schema } from "../data/timeseriesdb.js";
import type { Strategy } from "../core/types/strategy.js";
import { UniV2Position, UniV2PositionManager } from "../core/UniV2PositionManager.js";
import { UniV2Data } from "../core/datasource/UniV2DataSource.js";
import { AAVEPosition, AAVEPositionManager } from "../core/AavePositionManager.js";

interface ILogAny extends Schema {
    tags: any
    fields: any
}

const Log = new Measurement<ILogAny, any, any>('cpmm_strategy')

class CpmmHedgedPosition {
    public position!: UniV2Position
    public aave!: AAVEPosition
    public firstPosition = false
	public initialInvestment
	public debtRatioRange
	public collatRatio

    constructor(public name: string, options: {
		initialInvestment: number,
		debtRatioRange: number,
		collatRatio: number,
	}) {
        this.initialInvestment = options.initialInvestment
        this.debtRatioRange = options.debtRatioRange
        this.collatRatio = options.collatRatio
    }

    public async process(mgr: UniV2PositionManager, aave: AAVEPositionManager, data: UniV2Data) {
        this.log(data)

        if (!this.firstPosition) {
            this.openFirstPosition(mgr, aave, data)
        } else {
			const debtRatio = this.calcDebtRatio(data)
			if (debtRatio > (1 + this.debtRatioRange) || debtRatio < (1 - this.debtRatioRange)) 
			{
				console.log('\n************* rebalancing debt! *************')
				console.log((debtRatio * 100).toFixed(2))
				this.rebalanceDebt(mgr, aave, data)
				console.log('new debt ratio:', this.calcDebtRatio(data))
			}
        }

    }

    public openFirstPosition(mgr: UniV2PositionManager, aave: AAVEPositionManager, data: UniV2Data) {
		const { borrow, lend } = this.calcLenderAmounts(this.initialInvestment, data)
		this.aave = aave.create()
		this.aave.lend('USDC', lend)
		this.aave.borrow('ETH', borrow)
        this.firstPosition = true  
        this.position = mgr.addLiquidity(
			borrow,
            borrow * data.close,
        )
    }

    public get snapshot() {
        if (!this.position?.snapshot) return
        return this.position.snapshot
    }

    public rebalanceDebt(mgr: UniV2PositionManager, aave: AAVEPositionManager, data: UniV2Data) {
		console.log('rebalanceDebt', (new Date(data.timestamp * 1000)).toISOString())
        // Calc total assets
        const totalAssets = this.estTotalAssets(data)

        // Close this position
        mgr.close(this.position)
        aave.close(this.aave)

		// TODO: Account for trading fees and slippage on rebalances
        
        // Update Lend
		const { borrow, lend } = this.calcLenderAmounts(totalAssets, data)
		this.aave = aave.create()
		this.aave.lend('USDC', lend)
		this.aave.borrow('ETH', borrow)
        this.position = mgr.addLiquidity(
			borrow,
            borrow * data.close,
        )
    }
    public borrowInWant(data: UniV2Data) {
		return (this.aave.borrowed('ETH') * data.close)
	}

    public estTotalAssets(data: UniV2Data) {
        return this.position.valueUsd + this.aave.lent('USDC') - (this.aave.borrowed('ETH') * data.close)
    }

    private calcLenderAmounts(totalAssets: number, data: UniV2Data) {
        const lend = totalAssets * (1 / (1 + this.collatRatio))
        const borrowInWant = totalAssets - lend
        const borrow = borrowInWant / data.close
        return {borrow, lend}
    }

    private calcDebtRatio(data: UniV2Data): number {
        if (!this.position)
            return 1
        return this.borrowInWant(data) / this.position.reserves1
    }

    private async log(data: UniV2Data) {
        if (!this.position) return

        const log = {
            tags: {
				strategy: this.name,
            },
            fields: {
				...data,
                ...this.position.snapshot,
				lend: this.aave.lent('USDC'),
				borrow: this.aave.borrowed('ETH'),
				borrowInWant: this.borrowInWant(data),
				price: data.close,
				totalAssets: this.estTotalAssets(data),
                debtRatio: this.calcDebtRatio(data),
            },
            timestamp: new Date(data.timestamp * 1000),
        }
		// console.log(log)
        try {
            await Log.writePoint(log)
        } catch(e) {
            console.log(log)
            throw new Error('Log Failed')
        }

    }

}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class CpmmHedgedStrategy implements Strategy {
	private univ2Manager = new UniV2PositionManager()
	private aaveManager = new AAVEPositionManager()
	private strategies: CpmmHedgedPosition[] = []
    constructor() {
		this.strategies.push(new CpmmHedgedPosition('debt_1.5%',{
			initialInvestment: 1000,
			collatRatio: 0.06,
			debtRatioRange: 0.015,
		}))
		this.strategies.push(new CpmmHedgedPosition('debt_2%',{
			initialInvestment: 1000,
			collatRatio: 0.06,
			debtRatioRange: 0.02,
		}))
		this.strategies.push(new CpmmHedgedPosition('debt_5%',{
			initialInvestment: 1000,
			collatRatio: 0.06,
			debtRatioRange: 0.05,
		}))
    }

    public async before() {
        await Log.dropMeasurement()
    }

    public async after() {
        // console.log('Back test finished')
    }

    public async onData(data: any) {

		await this.univ2Manager.update(data)
		await this.aaveManager.update(data)

		// Procress the strategy
		for (const strat of this.strategies) {
			await strat.process(this.univ2Manager, this.aaveManager, data)
			await wait(0)
		}
    }
}
