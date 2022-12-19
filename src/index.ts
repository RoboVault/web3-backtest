

import { request, gql } from 'graphql-request'
import { Backtest } from './core/backtest';
import { UniV3DataSource } from './core/datasource/univ3datasource';
import { HedgedUniv3Strategy } from './strategy/hedged-univ3-strategy';
import './data/timeseriesdb';


function getTimestamp(dateString: string) {
    const ts = Math.floor((new Date(dateString)).getTime()/1000)
    console.log(ts)
    return ts
}

async function main () {
    const pool = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640"
    const datasource = new UniV3DataSource(
        pool, 
        getTimestamp('11/01/2022'),
        getTimestamp('11/11/2022'),
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

