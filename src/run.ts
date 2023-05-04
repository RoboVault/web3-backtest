import { Context } from "vm"
import { Backtest } from "./lib/backtest.js"
import { DataSourceInfo } from "./lib/datasource/types.js"




const main = async () => {
	const USDCWETH = '0x794a61358D6845594F94dc1DB02A252b5b4814aD'
	const ETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as const
	const USDC = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8' as const
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
		}
	]

	const bt = await Backtest.create(
		new Date('2023-01-01'), 
		new Date('2023-01-02'), 
		sources
	)

	bt.on('data', (data: Context) => {
		console.log('we got data!')
	})

	bt.run()
}

main()