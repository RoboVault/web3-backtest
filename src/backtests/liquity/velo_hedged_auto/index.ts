import { Backtest } from "../../../lib/backtest.js"
import { DataSourceInfo } from "../../../lib/datasource/types.js"
import { LiquityHedgedStrategy } from "./strategy.js"


	
const main = async () => {
	const WETH_LUSD = '0x91e0fc1e4d32cc62c4f9bc11aca5f3a159483d31'
	const sources: DataSourceInfo[] = [
		{
			chain: 'optimism',
			protocol: 'velodrome-dex',
			resoution: '1m',
			config: {
				pairs: [WETH_LUSD]
			}
		},
		{
			chain: 'optimism',
			protocol: 'aave',
			resoution: '1h',
			config: {
				pools: ['WETH', 'LUSD']
			}
		},
		// {
		// 	chain: 'arbitrum',
		// 	protocol: 'camelot-farm',
		// 	resoution: '1h',
		// 	config: {
		// 		pools: [USDCWETH]
		// 	}
		// }
	]

	const bt = await Backtest.create(
		new Date('2023-04-06'), 
        new Date('2023-04-16'),
		//new Date(), // Now
		sources
	)

	// Configure Strategy
	const strategy = new LiquityHedgedStrategy({
		univ2: bt.sources[0].id,
		aave: bt.sources[1].id,
		// farm: bt.sources[2].id,
	})
	bt.onBefore(strategy.before.bind(strategy))
	bt.onData(async (snapshot: any) => {
		await strategy.onData(snapshot)
	})
	bt.onAfter(strategy.after.bind(strategy))

	// Run
	await bt.run()
}

main()