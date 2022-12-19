import { Measurement, Schema } from "../data/timeseriesdb";
import type { Strategy } from "../core/types/strategy";
import type { PoolHourData } from "../core/datasource/univ3datasource";
import { UniV3Position, UniV3PositionManager } from "../core/UniV3PositionManager";

interface ILogAny extends Schema {
    tags: any
    fields: any
}

const Log = new Measurement<ILogAny, any, any>('backtest_v1')

class CoreStrategy {
    public position?: UniV3Position
    public lend: number
    public borrow: number
    public totalAssets: number
    public debtRatioRange: number = 0.05 // +/- 5%

    constructor(
        amount: number,
    ) {
        this.totalAssets = amount
        const lender = this.calcLenderAmounts(amount)
        this.lend = lender.lend
        this.borrow = lender.borrow
    }

    public async process(mgr: UniV3PositionManager, data: PoolHourData) {
        const debtRatio = this.calcDebtRatio()
        if (!this.position) {
            await this.openPosition(mgr, data)
        } else if (debtRatio > (1 + this.debtRatioRange) || debtRatio < (1 - this.debtRatioRange)) {
                // ToDo - Rebalance Debt
        }

        this.log(data)
    }

    public async openPosition(mgr: UniV3PositionManager, data: PoolHourData) {
        console.log('Openning Position!!')
        const lpSize = this.borrow * 2       
        this.position = await mgr.openBalancedPosition(
            lpSize,
            2000 // ticks
        )
    }


    private calcLenderAmounts(totalAssets: number): { lend: number, borrow: number} {
        const collatRatio = 0.6
        const lend = totalAssets * (1 / (1 + collatRatio))
        const borrow = totalAssets - lend
        return {lend, borrow}
    }

    private calcDebtRatio(): number {
        if (!this.position)
            return 1
        if (!this.position.snapshot)
            return 1

        const snapshot = this.position.snapshot
        // console.log(this.position)
        const shortInLp = snapshot.reserves[0] * snapshot.close
        return shortInLp / this.borrow
    }

    private async log(data: PoolHourData) {
        if (!this.position?.snapshot) return

        const token0 = this.position.snapshot.tokens[0]
        const token1 = this.position.snapshot.tokens[1]
        const reserves0 = this.position.snapshot.reserves[0]
        const reserves1 = this.position.snapshot.reserves[1]
        const usdValue = data.close * reserves0 + reserves1

        const log = {
            tags: {
            },
            fields: {
                ...this.position.snapshot,
                tokens: 0,
                reserves: 0,
                token0,
                token1,
                reserves0,
                reserves1,
                usdValue,
                price_max: this.position.maxRange,
                price_min: this.position.minRange,
                debt_ratio: this.calcDebtRatio()
            },
            timestamp: new Date(data.periodStartUnix * 1000),
        }
        // delete log.fields.tokens
        // console.log(log)
        // Log.writePoint(log)
        try {
            await Log.writePoint(log)
        } catch(e) {
            console.log(log)
            throw new Error('Log Failed')
        }

    }
}


export class HedgedUniv3Strategy implements Strategy {
    posMgr: UniV3PositionManager
    strategy: CoreStrategy

    constructor() {
        const amount = 10000 // USD amount
        this.posMgr = new UniV3PositionManager()
        this.strategy = new CoreStrategy(amount)
    }

    public async before() {
        await Log.dropMeasurement()
    }

    public async after() {
        // console.log('Unbounded fees:')
        // console.log(this.position?.unboundedFees)
        console.log('Back test finished')
    }

    public async onData(data: PoolHourData) {
        
        if (!await this.posMgr.processPoolData(data)) {
            // skip on first data
            return
        }

        await this.strategy.process(this.posMgr, data)
    }
}
