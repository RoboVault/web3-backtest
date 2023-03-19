
import { Between, Repository } from "typeorm";
import type { Chain, OnDataCallback } from "../types/core.js";
import type { DataSource } from "../types/datasource.js";
import { TypeOrmDataSource as GLPDatabase } from "./data/database.js";
import { GLP } from "./data/entities.js";

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

    constructor(
        private pool: string,
        private start: number,
        private end: number,
        private chain: Chain,
    ) {}
    
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

	private async fetch(glp: Repository<GLP>, from: number, to: number, skip: number) {
		const data = await glp.find({ 
			order: { block: "ASC" },
			take: 10,
			skip,
			where: { 
				// timestamp: Between(from, to)
				block: Between(from, to)
			}
		})
		
		return this.prepData(data)
	}

    public async run(ondata: OnDataCallback<any>) {
		await GLPDatabase.initialize()
        let finished = false

		const glp = GLPDatabase.getRepository(GLP)

		let skip = 0
        do {
            
            let data = await this.fetch(glp, this.start, this.end, skip)
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