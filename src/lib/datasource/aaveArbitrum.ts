import { DataSnapshot, DataSource, DataSourceInfo, Resolution } from "./types.js";
import { gql, GraphQLClient } from "graphql-request";

export type AavePoolSnapshot = {
	underlying: string
	incomeRate: number
	debtRate: number
}
export type AaveSnapshot = DataSnapshot<AavePoolSnapshot> 

type HourData = {
	timestamp: number
	usdcIncomeRate: number
	ethDebtRate: number
	rewardTokenPrice: number
	rewardsPerSecond: number
}


export class AaveArbitrumDataSource implements DataSource<AaveSnapshot> {
	private client: GraphQLClient
	public readonly id: string
	constructor(public info: DataSourceInfo) {
		this.id = info.id || 'aave'
		const url = 'https://data.staging.arkiver.net/s_battenally/cpmm_v2/graphql'
        this.client = new GraphQLClient(url, { headers: {} })
	}

	public resolutions(): Resolution[] {
		return ['1h']
	}	

	public static create(info: DataSourceInfo) {
		return new AaveArbitrumDataSource(info)
	}

	public async init() {

	}

	public async fetch(from: number, to: number, limit?: number): Promise<AaveSnapshot[]> {
		const query = gql`query MyQuery {
			HourDatas (
				sort: TIMESTAMP_ASC
				filter: {_operators: {timestamp: {gt: ${from}, lt: ${to}}}}
				${limit ? `limit: ${limit}` : ``}
			) {
				timestamp
				usdcIncomeRate
				ethDebtRate
				rewardTokenPrice
				rewardsPerSecond
			}
		  }
		`

		const raw = (await this.client.request(query)).HourDatas
		return this.prep(raw)
	}

	private prep(raw: HourData[]): AaveSnapshot[] {
		return raw.map(e => {
			const ret: AaveSnapshot = {
				timestamp: e.timestamp,
				data: {}
			}
			ret.data[this.id] = [{
				underlying: 'USDC',
				incomeRate: e.usdcIncomeRate,
				debtRate: 0,
			},{
				underlying: 'WETH',
				incomeRate: 0,
				debtRate: e.ethDebtRate,
			}]
			return ret
		})
	}
}