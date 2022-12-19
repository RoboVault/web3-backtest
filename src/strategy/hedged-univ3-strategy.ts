import { Measurement, Schema } from "../data/timeseriesdb";
import type { Strategy } from "../core/types/strategy";
import { BigNumber, ethers } from "ethers";
// import * as jsbi from 'jsbi'
// import { TickMath } from "@uniswap/v3-sdk";
import type { PoolHourData } from "../core/datasource/univ3datasource";
import { UniV3Position, UniV3PositionManager } from "../core/UniV3PositionManager";

// const JSBI: any = jsbi


// /// @dev Rounds tick down towards negative infinity so that it's a multiple
// /// of `tickSpacing`.
// function floorTick(tick: number, tickSpacing: number) {
//     let compressed = tick / tickSpacing;
//     if (tick < 0 && tick % tickSpacing != 0) compressed--;
//     return compressed * tickSpacing;
// }

// function tickToPrice(tick: number) {
//     const sqrtPriceX96 = BigNumber.from((TickMath.getSqrtRatioAtTick(tick).toString()))
//     return sqrtPriceX96ToPrice(sqrtPriceX96)
// }

// function sqrtPriceX96ToPrice(sqrtPriceX96: ethers.BigNumber) {
//     const oneE18 = BigNumber.from(10).pow(18)
//     return sqrtPriceX96.pow(2).mul(oneE18).div(BigNumber.from(2).pow(192))
// }


interface ILogAny extends Schema {
    tags: any
    fields: any
}

const Log = new Measurement<ILogAny, any, any>('backtest_v1')


export class HedgedUniv3Strategy implements Strategy {
    posMgr: UniV3PositionManager
    position?: UniV3Position

    constructor(private pool: string) {
        this.posMgr = new UniV3PositionManager()
    }

    public async before() {
        await Log.dropMeasurement()
    }

    public async after() {
        console.log('Unbounded fees:')
        console.log(this.position?.unboundedFees)
        console.log('Back test finished')
    }

    public async onData(data: PoolHourData) {
        
        if (!await this.posMgr.processPoolData(data)) {
            // skip on first data
            return
        }


        if (!this.position) {
            console.log('Creating position')
            const price = data.close
            this.position = await this.posMgr.open(
                this.pool,
                10000,
                (price - 400),
                (price + 400),
            )
        }
        console.log('snapshot')
        console.log(this.position.snapshot)
        


        // Psuedo
        /*
        if (strat.debtRatio() > 10200) {
            strat.rebalance()
        }

        */

        // hour: 12,
        // day: 9,
        // month: 10,
        // year: 2022,
        // fg0: 8.165901701842049e-14,
        // fg1: 5.904380717795264e-17,
        // activeliquidity: 21.314387211367674,
        // feeToken0: 0,
        // feeToken1: 0,
        // tokens: [ 0, 0 ],
        // fgV: 1.5395137035787528e-13,
        // feeV: 0,
        // feeUnb: 0,
        // amountV: 0,
        // amountTR: 1000,
        // feeUSD: 0,
        // close: 1224.385025199548,
        // baseClose: 1224.385025199548

        if (!this.position.snapshot)
            return


        console.log(`Here's data!`)
        console.log(data)
        const token0 = this.position.snapshot.tokens[0]
        const token1 = this.position.snapshot.tokens[1]
        const snapshot = this.position.snapshot
        console.log(token0, data.close, token1, snapshot.feeUSD)
        const usdValue = token0 + data.close * token1
        const log = {
            tags: {
            },
            fields: {
                ...this.position.snapshot,
                tokens: 0,
                token0,
                token1,
                usdValue,
                price_max: this.position.maxRange,
                price_min: this.position.minRange,
            },
            timestamp: new Date(data.periodStartUnix * 1000),
        }
        // delete log.fields.tokens
        console.log(log)
        // Log.writePoint(log)
        try {
            await Log.writePoint(log)
        } catch(e) {
            console.log(log)
            throw new Error('Log Failed')
        }
    }
}
