import { Backtest } from "../../../lib/backtest.js"
import { DataSourceInfo } from "../../../lib/datasource/types.js"
import { SingleSidedCurveStrategy } from "./strategy.js"


	
const main = async () => {
	const LUSD3CRV = '0xed279fdd11ca84beef15af5d39bb4d4bee23f0ca'
	const sources: DataSourceInfo[] = [
		{
			chain: 'ethereum',
			protocol: 'curve-dex',
			resoution: '1h',
			config: {
				pairs: [LUSD3CRV]
			}
		},
	]

	const bt = await Backtest.create(
		new Date('2023-01-01'), 
		// new Date('2023-01-05'), 
        new Date(), // Now
		sources
	)

	// Configure Strategy
	const strategy = new SingleSidedCurveStrategy()
	bt.onBefore(strategy.before.bind(strategy))
	bt.onData(strategy.onData.bind(strategy))
	bt.onAfter(strategy.after.bind(strategy))

	// Run
	await bt.run()
}

main()