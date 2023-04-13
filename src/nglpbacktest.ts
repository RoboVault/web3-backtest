

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
	const fromBlock = 2260000
	const toBlock = 0 // not used
    const datasource = new GmxDataSource(fromBlock, toBlock)

    const strategy = new nGLPStrategy()
    const bt = new Backtest(
        datasource,
        strategy
    )
    bt.run()
}

export default main()

