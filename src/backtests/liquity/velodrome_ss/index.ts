import { Backtest } from "../../../lib/backtest.js"
import { DataSourceInfo } from "../../../lib/datasource/types.js"
import { SingleSidedVelodromeStrategy } from "./strategy.js"


	
const main = async () => {
	const USDLUSD = '0x207addb05c548f262219f6bfc6e11c02d0f7fdbe'
	const sources: DataSourceInfo[] = [
		{
			chain: 'optimism',
			protocol: 'velodrome-dex',
			resoution: '1h',
			config: {
				pairs: [USDLUSD]
			}
		},
	]

	const bt = await Backtest.create(
		new Date('2023-03-11'), 
		// new Date('2023-01-05'), 
        new Date(), // Now
		sources
	)

	// Configure Strategy
	const strategy = new SingleSidedVelodromeStrategy()
	bt.onBefore(strategy.before.bind(strategy))
	bt.onData(strategy.onData.bind(strategy))
	bt.onAfter(strategy.after.bind(strategy))

	// Run
	await bt.run()
}

main()