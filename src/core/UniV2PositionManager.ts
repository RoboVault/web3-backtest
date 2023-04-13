import { UniV2Data } from "./datasource/univ2DataSource.js"

export class UniV2Position {
    // pool!: ethers.Contract
    // provider!: ethers.providers.BaseProvider
    // public unboundedFees: [number, number] = [0, 0]
    // public snapshot: any
    // public feeToken0: number = 0
    // public feeToken1: number = 0
	public totalSupply
	public valueUsd
	public reserves0
	public reserves1
	public lpTokens

    constructor(
        public amount0: number, 
        public amount1: number, 
        public data: UniV2Data,
    ) {
		this.lpTokens = (amount0 / data.reserves0) * data.totalSupply
		this.totalSupply = data.totalSupply
		this.valueUsd = amount1 * 2
		this.reserves0 = amount0
		this.reserves1 = amount1
	}

    public processData(lastData: UniV2Data, data: UniV2Data) {
		const pc = this.lpTokens / data.totalSupply
		this.totalSupply = data.totalSupply
		this.valueUsd = pc * data.reserves1 * 2
		this.reserves0 = pc * data.reserves0
		this.reserves1 = pc * data.reserves1
    }

	public get snapshot() {
		return {
			totalSupply: this.totalSupply,
			valueUsd: this.valueUsd,
			reserves0: this.reserves0,
			reserves1: this.reserves1,
			lpTokens: this.lpTokens,
		}
	}
}



export class UniV2PositionManager {
    lastData?: UniV2Data
    positions: UniV2Position[] = []

    constructor() {

    }   


    public update(data: UniV2Data): boolean {
        if (!this.lastData) {
            this.lastData = data
            return false
        }

        
        for (const pos of this.positions) {
            pos.processData(this.lastData, data)
        }
        this.lastData = data
        return true
    }

    public addLiquidity(
        amount0: number,
        amount1: number, 
    ): UniV2Position {
        if (!this.lastData)
            throw new Error('wow')
		console.log('openning positions with ')
		console.log(amount0, amount1)
		const pos = new UniV2Position(amount0, amount1, this.lastData)
		this.positions.push(pos)
		return pos
    }

    public close(pos: UniV2Position){
        const idx = this.positions.indexOf(pos)
        this.positions.splice(idx, 1)
    }
}