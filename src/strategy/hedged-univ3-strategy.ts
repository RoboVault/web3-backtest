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
    public lend: number = 0
    public borrow: number = 0
    public totalAssets: number
    public debtRatioRange: number = 0.10 // +/- 5%
    public ticks = 2000

    constructor(
        amount: number,
    ) {
        this.totalAssets = amount
        this.updateLenderAmounts(amount)
    }

    public async process(mgr: UniV3PositionManager, data: PoolHourData) {
        const debtRatio = this.calcDebtRatio()
        if (!this.position) {
            await this.openPosition(mgr, data)
        } else if (debtRatio > (1 + this.debtRatioRange) || debtRatio < (1 - this.debtRatioRange)) {
            console.log('rebalancing debt! ' + debtRatio)
            this.rebalanceDebt(mgr, data)
            // ToDo - Rebalance Debt
        }

        this.log(data)
    }

    public openPosition(mgr: UniV3PositionManager, data: PoolHourData) {
        console.log('Openning Position!!')
        const lpSize = this.borrow * 2       
        this.position = mgr.openBalancedPosition(
            lpSize,
            this.ticks // ticks
        )
    }

    public get snapshot() {
        if (!this.position?.snapshot) return
        return this.position.snapshot
    }

    public rebalanceDebt(mgr: UniV3PositionManager, data: PoolHourData) {
        const snapshot = this.snapshot
        const reserves = snapshot.reserves;
        const fees = [snapshot.feeToken0, snapshot.feeToken1]
        if (!this.position) throw new Error('wot')
        mgr.close(this.position)
        this.position = undefined
        

        const totalAssets = 
            this.lend - this.borrow + 
            (reserves[0] + fees[1]) * data.close + 
            (reserves[1] + fees[0])
        console.log('\ntotal Assets: ' + totalAssets)
        console.log(this.lend, this.borrow)
        console.log(reserves)
        console.log(fees)
        
        // Update Lend
        this.updateLenderAmounts(totalAssets)

        const lpSize = this.borrow * 2      
        this.position = mgr.openBalancedPosition(
            lpSize,
            this.ticks // ticks
        )

    }

    public estTotalAssets(data: PoolHourData) {
        if (!this.position?.snapshot) return
        const snapshot = this.position.snapshot
        return this.lend - this.borrow + data.close * snapshot.reserves[0] + snapshot.reserves[1]
    }


    private updateLenderAmounts(totalAssets: number) {
        const collatRatio = 0.6
        this.lend = totalAssets * (1 / (1 + collatRatio))
        this.borrow = totalAssets - this.lend
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
        const usdValue = this.estTotalAssets(data)

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
                debtUpper: 1 + this.debtRatioRange,
                debtLower: 1 - this.debtRatioRange,
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
