import { Backtest } from "../../../lib/backtest.js"
import { DataSourceInfo } from "../../../lib/datasource/types.js"
import { SingleSidedUniswapStrategy } from "./strategy.js"


	
const main = async () => {
	const USDCLUSD = '0x4e0924d3a751bE199C426d52fb1f2337fa96f736'
	const sources: DataSourceInfo[] = [
		{
			chain: 'ethereum',
			protocol: 'uniswap-dex',
			resoution: '1h',
			config: {
				pairs: [USDCLUSD]
			}
		},
	]

	const bt = await Backtest.create(
		new Date('2023-03-16'), 
		// new Date('2023-01-05'), 
        new Date(), // Now
		sources
	)

	// Configure Strategy
	const strategy = new SingleSidedUniswapStrategy()
	bt.onBefore(strategy.before.bind(strategy))
	bt.onData(strategy.onData.bind(strategy))
	bt.onAfter(strategy.after.bind(strategy))

	// Run
	await bt.run()
}

main()