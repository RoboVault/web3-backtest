
import type { OnDataCallback } from "../types/core.js";
import type { DataSource } from "../types/datasource.js";
import { gql, GraphQLClient } from "graphql-request";

type UniV2 = {
	id: string,
	block: number,
	timestamp: number,
	reserves0: number,
	reserves1: number,
	totalSupply: number,
}

export type UniV2Data = {
	block: number
	timestamp: number
	reserves0: number,
	reserves1: number,
	totalSupply: number,
	close: number
}

export class Univ2DataSource implements DataSource<UniV2Data> {
	private client: GraphQLClient
    constructor(
        private start: number,
        private end: number,
    ) {
		const url = 'http://0.0.0.0:4000/graphql'
        this.client = new GraphQLClient(url, { headers: {} })
	}
    
    public async init() {

    }

	private prepData(data: UniV2[]): UniV2Data[] {
		const res = data.map(e => {
			return {
				...e,
				close: e.reserves1 / e.reserves0,
			}
		})

		return res
	}

	// Only supports USDC/WETH on Camelot right now
	private async fetch(from: number, limit: number, skip: number) {
		const query = gql`query MyQuery {
			MinuteDatas (
				sort: TIMESTAMP_ASC
				filter: {_operators: {timestamp: {gt: ${from}, lt: ${this.end}}}}
				limit: ${limit}
				skip: ${skip}
			) {
				reserves0
				reserves1
				timestamp
				totalSupply
			}
		  }
		`
		const data = await this.client.request(query)
		return this.prepData(data.MinuteDatas)
	}

    public async run(ondata: OnDataCallback<any>) {
        let finished = false
		let skip = 0
        do {
            
            let data = await this.fetch(this.start, 100, skip)
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