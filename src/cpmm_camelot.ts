

import { Backtest } from './core/backtest.js'
import { Univ2DataSource } from './core/datasource/univ2DataSource.js'
import './data/timeseriesdb.js'
import { CpmmHedgedStrategy } from './strategy/cpmm_hedged.js'


function getTimestamp(dateString: string) {
    const ts = Math.floor((new Date(dateString)).getTime()/1000)
    console.log(ts)
    return ts
}

async function main () {
    const datasource = new Univ2DataSource(
		getTimestamp('01/24/2023'), // 1670386220, // 
		// getTimestamp('01/30/2023'), // 1670386220, // 
		Math.floor(Date.now() / 1000)
	)

    const strategy = new CpmmHedgedStrategy()
    const bt = new Backtest(
        datasource,
        strategy
    )
    bt.run()
}

export default main()

