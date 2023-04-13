
import type { OnDataCallback } from "../types/core.js";
import type { DataSource } from "../types/datasource.js";
import { gql, GraphQLClient } from "graphql-request";

type MinuteData = {
	timestamp: number,
	reserves0: number,
	reserves1: number,
	totalSupply: number,
}


type HourData = {
	timestamp: number
	usdcIncomeRate: number
	ethDebtRate: number
	rewardTokenPrice: number
	rewardsPerSecond: number
}

type ResponseData = { minuteData: MinuteData[], hourData: HourData[] }

export type UniV2Data = {
	timestamp: number
	reserves0: number,
	reserves1: number,
	totalSupply: number,
	close: number
}
export type AAVEData = {
	timestamp: number
	usdcIncomeRate: number
	ethDebtRate: number
}
export type FarmData = {
	timestamp: number
	rewardTokenPrice: number
	rewardsPerSecond: number
}

export type DataUpdate = {
	univ2: UniV2Data,
	aave?: AAVEData,
	farm?: FarmData,
}

export class Univ2DataSource implements DataSource<DataUpdate> {
	private client: GraphQLClient
    constructor(
        private start: number,
        private end: number,
    ) {
		// const url = 'http://0.0.0.0:4000/graphql'
		const url = 'https://data.arkiver.net/s_battenally/cpmm_v1/graphql'
        this.client = new GraphQLClient(url, { headers: {} })
	}
    
    public async init() {

    }

	private prepData(data: ResponseData): DataUpdate[] {
		const { minuteData, hourData } = data
		const res = minuteData.map(m => {
			const ret: DataUpdate = {
				univ2: {
					...m,
					close: m.reserves1 / m.reserves0,
				},
			}
			const hourly = hourData.find(h => h.timestamp == m.timestamp)
			if (hourly) {
				ret.aave = { ...hourly}
				ret.farm = { ...hourly}
			}
			return ret
		})
		return res
	}

	// Only supports USDC/WETH on Camelot right now
	private async fetch(from: number, limit: number, skip: number) {
		const minuteDataQuery = gql`query MyQuery {
			MinuteDatas (
				sort: TIMESTAMP_ASC
				filter: {_operators: {timestamp: {gt: ${from}, lt: ${this.end}}}}
				limit: ${limit}
				skip: ${skip}
			) {
				timestamp
				reserves0
				reserves1
				totalSupply
			}
		  }
		`
		const minuteData = (await this.client.request(minuteDataQuery)).MinuteDatas
		if (!minuteData.length)
		  return []

		const end = minuteData[minuteData.length - 1].timestamp

		const hourDataQuery = gql`query MyQuery {
			HourDatas (
				sort: TIMESTAMP_ASC
				filter: {_operators: {timestamp: {gt: ${from}, lt: ${end}}}}
				limit: ${limit}
				skip: ${skip}
			) {
				timestamp
				usdcIncomeRate
				ethDebtRate
				rewardTokenPrice
				rewardsPerSecond
			}
			}
		`

		const hourData = (await this.client.request(hourDataQuery)).HourDatas
		return this.prepData({ minuteData, hourData })
	}

    public async run(ondata: OnDataCallback<any>) {
        let finished = false
		let skip = 0
        do {
            
            let data = await this.fetch(this.start, 1000, skip)
			skip += data.length
            // Calls the ondata handler
            for (const update of data) {
                await ondata(update)
            }

			// End when we run out of data
            finished = data.length < 10
        } while (!finished)
    }
}