import type { DataSource } from "./types/datasource";
import type { Strategy } from "./types/strategy";




export class Backtest {

    constructor(
        private datasource: DataSource,
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