

import { Backtest } from './core/backtest.js';
import { GmxDataSource } from './core/datasource/GmxDataSource.js';
import './data/timeseriesdb.js';
import { nGLPStrategy } from './strategy/nglp-strategy.js';


function getTimestamp(dateString: string) {
    const ts = Math.floor((new Date(dateString)).getTime()/1000)
    console.log(ts)
    return ts
}

async function main () {
    // const pool = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640" // WETH/USDC 0.05%
    const pool = '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8' // WETH/USDC 0.3%
    const datasource = new GmxDataSource(
        pool, 
        2260000, //3000000
        71000000,
        'ethereum'
    )

    const strategy = new nGLPStrategy()
    const bt = new Backtest(
        datasource,
        strategy
    )
    bt.run()
}

export default main()

