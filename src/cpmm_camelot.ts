

import { Backtest } from './core/backtest.js';
import { GmxDataSource } from './core/datasource/GmxDataSource.js';
import { Univ2DataSource } from './core/datasource/univ2DataSource.js';
import './data/timeseriesdb.js';
import { CpmmHedgedStrategy } from './strategy/cpmm_hedged.js';
import { nGLPStrategy } from './strategy/nglp-strategy.js';


function getTimestamp(dateString: string) {
    const ts = Math.floor((new Date(dateString)).getTime()/1000)
    console.log(ts)
    return ts
}

async function main () {
    const datasource = new Univ2DataSource(
		1670366220, //getTimestamp('10/01/2022'), 
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

