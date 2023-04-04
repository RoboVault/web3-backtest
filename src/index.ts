

import { request, gql } from 'graphql-request'
import { Backtest } from './core/backtest.js';
import { UniV3DataSource } from './core/datasource/univ3datasource.js';
import { HedgedUniv3Strategy } from './strategy/hedged-univ3-strategy.js';
import './data/timeseriesdb';


function getTimestamp(dateString: string) {
    const ts = Math.floor((new Date(dateString)).getTime()/1000)
    console.log(ts)
    return ts
}

async function main () {
    // const pool = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640" // WETH/USDC 0.05%
    const pool = '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8' // WETH/USDC 0.3%
    const datasource = new UniV3DataSource(
        pool, 
        getTimestamp('10/01/2022'),
        getTimestamp('12/01/2022'),
        'ethereum'
    )

    const strategy = new HedgedUniv3Strategy()
    const bt = new Backtest(
        datasource,
        strategy
    )
    bt.run()
}

export default main()

