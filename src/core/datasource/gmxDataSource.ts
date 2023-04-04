
import type { OnDataCallback } from "../types/core.js";
import type { DataSource } from "../types/datasource.js";
import { gql, GraphQLClient } from "graphql-request";

type GLP = {
	id: string,
	block: number,
	timestamp: number,
	glpAum: number,
	glpTotalSupply: number,
	glpPrice: number,
	btcReserves: number,
	ethReserves: number,
	btcPrice: number,
	ethPrice: number,
	ethAumA: number,
	btcAumA: number,
	ethAumB: number,
	btcAumB: number,
	ethAumC: number,
	btcAumC: number,
	btcUtilisation: number,
	ethUtilisation: number,
	cumulativeRewardPerToken: number,
	gmxPrice: number,
}

export type GLPData = {
	block: number
	timestamp: number
	glpAum: number
	glpTotalSupply: number
	ethAumA: number
	btcAumA: number
	ethAumB: number
	btcAumB: number
	ethAumC: number
	btcAumC: number
	glpPrice: number
	btcReserves: number
	ethReserves: number
	btcPrice: number
	ethPrice: number
	btcRatioA: number
	ethRatioA: number
	btcRatioB: number
	ethRatioB: number
	btcRatioC: number
	ethRatioC: number
	btcUtilisation: number
	ethUtilisation: number
	cumulativeRewardPerToken: number
	gmxPrice: number
}

export class GmxDataSource implements DataSource<GLPData> {
	private client: GraphQLClient
    constructor(
        private start: number,
        private end: number,
    ) {
		const url = 'http://ec2-44-201-19-56.compute-1.amazonaws.com:4000/s_battenally/nglp_backtest/graphql'
        this.client = new GraphQLClient(url, { headers: {} })
	}
    
    public async init() {

    }

	private prepData(data: GLP[]): GLPData[] {
		const res = data.map(e => {
			return {
				...e,
				btcRatioA: e.btcAumA / e.glpAum,
				ethRatioA: e.ethAumA / e.glpAum,
				btcRatioB: e.btcAumB / e.glpAum,
				ethRatioB: e.ethAumB / e.glpAum,
				btcRatioC: e.btcAumC / e.glpAum,
				ethRatioC: e.ethAumC / e.glpAum,
			}
		})

		return res
	}

	private async fetch(fromBlock: number, limit: number, skip: number) {
		const query = gql`query MyQuery {
			GLPs(
			  sort: BLOCK_ASC
			  limit: ${limit}
			  skip: ${skip}
			  filter: {_operators: {block: {gt: ${fromBlock}}}}
			) {
			  block
			  btcAumA
			  btcAumB
			  btcAumC
			  btcPrice
			  btcUtilisation
			  btcReserves
			  cumulativeRewardPerToken
			  ethAumA
			  ethAumB
			  ethAumC
			  ethPrice
			  ethReserves
			  ethUtilisation
			  glpAum
			  glpPrice
			  glpTotalSupply
			  gmxPrice
			  id
			  timestamp
			}
		  }
		`
		const data = await this.client.request(query)
		return this.prepData(data.GLPs)
	}

    public async run(ondata: OnDataCallback<any>) {
        let finished = false
		let skip = 0
        do {
            
            let data = await this.fetch(this.start, 100, skip)
			skip += data.length
            console.log(data[0].block)
            // Calls the ondata handler
            for (const update of data) {
                await ondata(update)
            }

			// End when we run out of data
            finished = data.length < 10
        } while (!finished)
    }
}