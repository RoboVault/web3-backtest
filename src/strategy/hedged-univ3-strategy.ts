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
    public borrowInShort: number = 0
    public debtRatioRange: number = 0.05 // +/- %
    public ticks = 10000
    public firstPosition = false

    constructor(
        public initialInvestment: number,
    ) {
    }

    public async process(mgr: UniV3PositionManager, data: PoolHourData) {
        this.log(data)

        const debtRatio = this.calcDebtRatio()
        if (!this.firstPosition) {
            this.openFirstPosition(mgr, data)
        } else if (debtRatio > (1 + this.debtRatioRange) || debtRatio < (1 - this.debtRatioRange)) {
            console.log('\n************* rebalancing debt! *************')
            console.log((debtRatio * 100).toFixed(2))
            this.rebalanceDebt(mgr, data)
        }

    }

    public openFirstPosition(mgr: UniV3PositionManager, data: PoolHourData) {
        const borrowInWant = this.updateLenderAmounts(this.initialInvestment, data)
        this.firstPosition = true
        console.log('Openning Position!!')
        const lpSize = borrowInWant * 2       
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
        if (!this.position) throw new Error('wot')

        // Calc total assets
        const totalAssets = this.estTotalAssets(data)

        // Close this position
        mgr.close(this.position)
        this.position = undefined
        
        // Update Lend
        const borrowInWant = this.updateLenderAmounts(totalAssets, data)
        const lpSize = borrowInWant * 2      
        this.position = mgr.openBalancedPosition(
            lpSize,
            this.ticks // ticks
        )

    }

    public estTotalAssets(data: PoolHourData) {
        if (!this.position?.snapshot) throw new Error('No Snapshot')
        const snapshot = this.position.snapshot
        const reserves = snapshot.reserves
        const fees = [snapshot.cumulativeFeeToken0, snapshot.cumulativeFeeToken1]
        const price = data.close
        const totalAsset = this.lend + reserves[1] + fees[0] + price * (snapshot.reserves[0] + fees[1] - this.borrow)
        console.log(this.lend, reserves[1], fees[0], snapshot.reserves[0], fees[1], this.borrow)
        console.log('estTotalAssets')
        console.log(totalAsset)
        console.log(reserves)
        return totalAsset
    }


    private updateLenderAmounts(totalAssets: number, data: PoolHourData) {
        const collatRatio = 0.6
        this.lend = totalAssets * (1 / (1 + collatRatio))
        const borrowInWant = totalAssets - this.lend
        this.borrow = borrowInWant / data.close
        // console.log('updateLenderAmounts')
        // console.log(this.lend, borrowInWant, this.borrow, totalAssets)
        return borrowInWant
    }

    private calcDebtRatio(): number {
        if (!this.position)
            return 1
        if (!this.position.snapshot)
            return 1

        const snapshot = this.position.snapshot
        // console.log('calcDebtRatio')
        // console.log(snapshot.reserves)
        // console.log(this.borrow)
        const debtRatio =  this.borrow / snapshot.reserves[0]
        return debtRatio
    }

    private async log(data: PoolHourData) {
        if (!this.position?.snapshot) return

        const token0 = this.position.snapshot.tokens[0]
        const token1 = this.position.snapshot.tokens[1]
        const reserves0 = this.position.snapshot.reserves[0]
        const reserves1 = this.position.snapshot.reserves[1]
        const totalAssets = this.estTotalAssets(data)

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
                totalAssets,
                debtUpper: 1 + this.debtRatioRange,
                debtLower: 1 - this.debtRatioRange,
                price_max: this.position.maxRange,
                price_min: this.position.minRange,
                debt_ratio: this.calcDebtRatio(),
                lend: this.lend,
                borrow: this.borrow,
                borrowInWant: this.borrow * data.close,
            },
            timestamp: new Date(data.periodStartUnix * 1000),
        }
        // console.log(log.timestamp)
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
