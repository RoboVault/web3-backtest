import { Backtest } from "./lib/backtest.js"
import { AavePoolSnapshot } from "./lib/datasource/Aave.js"
import { Univ2PoolSnapshot } from "./lib/datasource/camelotDex.js"
import { CamelotFarmRewardsSnapshot } from "./lib/datasource/camelotFarm.js"
import { DataSnapshot, DataSourceInfo } from "./lib/datasource/types.js"

type Snapshots = 
	| CamelotFarmRewardsSnapshot
	| Univ2PoolSnapshot
	| AavePoolSnapshot
	
const main = async () => {
	const USDCWETH = '0x794a61358D6845594F94dc1DB02A252b5b4814aD'
	const sources: DataSourceInfo[] = [
		{
			chain: 'arbitrum',
			protocol: 'camelot-dex',
			resoution: '1m',
			config: {
				pairs: [USDCWETH]
			}
		},
		{
			chain: 'arbitrum',
			protocol: 'aave',
			resoution: '1h',
			config: {
				pools: ['ETH', 'USDC']
			}
		},
		{
			chain: 'arbitrum',
			protocol: 'camelot-farm',
			resoution: '1h',
			config: {
				pools: [USDCWETH]
			}
		}
	]

	const bt = await Backtest.create(
		new Date('2023-01-01'), 
		new Date('2023-01-02'), 
		sources
	)

	bt.onData(async (update: DataSnapshot<Snapshots>) => {
		console.log(`we have data for ${update.timestamp}!`)
		console.log(update.data)
	})

	bt.onAfter(async () => {
		console.log('backtest complete!')
	})

	bt.run()
}

main()