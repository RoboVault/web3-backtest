import { DataSnapshot, DataSource, DataSourceInfo, Resolution } from "./types.js";
import { gql, GraphQLClient } from "graphql-request";

export type CamelotFarmRewardsSnapshot = {
	pool: string
	symbol: string
	rewardTokenPrice: number
	rewardsPerSecond: number
}

export type CamelotFarmSnapshot = DataSnapshot<CamelotFarmRewardsSnapshot> 

type HourData = {
	timestamp: number
	rewardTokenPrice: number
	rewardsPerSecond: number
}

export type CamelotFarmConfig = {
	pools: string[]
}

// Only supports one pair currently
const USDCWETH = '0x794a61358D6845594F94dc1DB02A252b5b4814aD'

export class CamelotFarmDataSource implements DataSource<CamelotFarmSnapshot> {
	private client: GraphQLClient
	public readonly id: string
	public readonly config: CamelotFarmConfig
	constructor(public info: DataSourceInfo) {
		this.id = info.id || 'camelotFarm'

		// TODO - Config validation because it isn't typed
		this.config = info.config as CamelotFarmConfig

		// TODO - Validate the class supports the requested data
		if (this.config.pools[0] !== USDCWETH)
			throw new Error('Invalid pools for Camelot Farm - Only ETHUSDC is supported currently')

		const url = 'https://data.arkiver.net/s_battenally/cpmm_v2/graphql'
        this.client = new GraphQLClient(url, { headers: {} })
	}

	public resolutions(): Resolution[] {
		return ['1h']
	}	

	public static create(info: DataSourceInfo) {
		return new CamelotFarmDataSource(info)
	}

	public async init() {

	}

	public async fetch(from: number, to: number, limit?: number): Promise<CamelotFarmSnapshot[]> {
		const query = gql`query MyQuery {
			HourDatas (
				sort: TIMESTAMP_ASC
				filter: {_operators: {timestamp: {gt: ${from}, lt: ${to}}}}
				${limit ? `limit: ${limit}` : ``}
			) {
				timestamp
				rewardTokenPrice
				rewardsPerSecond
			}
		  }
		`

		const raw = (await this.client.request(query)).HourDatas
		return this.prep(raw)
	}

	private prep(raw: HourData[]): CamelotFarmSnapshot[] {
		return raw.map(e => {
			const ret: CamelotFarmSnapshot = {
				timestamp: e.timestamp,
				data: {}
			}
			ret.data[this.id] = [{
				pool: USDCWETH,
				symbol: 'WETH/USDC',
				rewardsPerSecond: e.rewardsPerSecond,
				rewardTokenPrice: e.rewardTokenPrice,
			}]
			return ret
		})
	}
}