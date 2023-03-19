import type { DataSource } from "./types/datasource.js";
import type { Strategy } from "./types/strategy.js";




export class Backtest<SampleType> {

    constructor(
        private datasource: DataSource<SampleType>,
        private strategy: Strategy
    ) {
    }

    public async run() {
        // Initialise the goodz
        await this.datasource.init()
        await this.strategy.before()

        // Start the run
        await this.datasource.run(async (data: any) => {
            await this.strategy.onData(data)
        })

        // Clean up
        await this.strategy.after()
    }
}