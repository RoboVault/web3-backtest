import EventEmitter from "events"
import { DataSourceStore } from "./datasource/datasource.js"
import { DataSource, DataSourceInfo, Resolution } from "./datasource/types.js"

type Context = {
	
}


export class Backtest extends EventEmitter {

    constructor(
		private start: Date,
		private end: Date,
        private datasources: DataSource[]
    ) {
		super()
    }

	public static async create(start: Date, end: Date, sources: DataSourceInfo[]): Promise<Backtest> {
		const datasources = sources.map((source) => DataSourceStore.get(source))
		const bt = new Backtest(start, end, datasources)
		return bt
	}
	
	public static ResToSeconds(res: Resolution) {
		switch (res) {
			case '1m': return 60
			case '1h': return 60 * 60
			case '1d': return 60 * 60 * 24
			default: throw new Error('unsuppported resolution')
		}
	}

    public async run() {
        // Initialise the goodz
        await Promise.all(this.datasources.map(e => e.init()))
		await this.emit('before')

        // sort the datasources from high res to low res
		const datasources = this.datasources.sort((a, b) => {
			const aRes = Backtest.ResToSeconds(a.info.resoution)
			const bRes = Backtest.ResToSeconds(b.info.resoution)
			return aRes > bRes ? 1 : -1
		})

		let start = this.start.getTime() / 1000
		let end = this.end.getTime() / 1000

		const limit = 500
		let finished = false
		let from = start
		let to = end

		// use the first data source as the lead because it'll have the highest resolution
		const lead = datasources[0]
		const others = datasources.slice(1)
		do {
			const data = await lead.fetch(from, end, limit)
			to = data[data.length - 1].timestamp

			const allData = [
				data,
				...await Promise.all(others.map(ds => ds.fetch(from, to, limit)))
			]

			// merge all timestamps
			const timestamps = Array.prototype.concat.apply(this, allData.map(e => e.map(e => e.timestamp))) as number[]
			const unique = Array.from(new Set(timestamps)).sort((a, b) => a - b)

			const mergedData = unique.map(ts => {
				const dsWithSnapshots = allData.filter(ds => ds.findIndex(e => e.timestamp === ts) !== -1)
				const data = dsWithSnapshots.map(ds => ds.find(e => e.timestamp === ts)?.data)
				return {
					timestamp: ts,
					data: Object.assign({}, ...data)
				}
			})

			// emit each of the snapshots
			for (const snapshot of mergedData) {
				await this.emit('data', snapshot)
			}

			// End when we run out of data
            finished = data.length < 10
		} while (!finished)
    }
}