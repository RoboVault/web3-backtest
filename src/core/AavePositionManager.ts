import { AAVEData, UniV2Data } from "./datasource/univ2DataSource.js"

export class AAVEPosition {
	public borrows: { [key: string]: number } = {}
	public lends: { [key: string]: number } = {}
	public interest = { cost: 0, income: 0 }

    constructor(public rates: { [key: string]: number }) {
	}

	public lent(token: string) {
		return this.lends[token]
	}

	public borrowed(token: string) {
		return this.borrows[token]
	}

    public lend(
		token: string,
        amount: number,
    ) {
		const now = this.lends[token] || 0
		this.lends[token] = now + amount
    }

    public redeem(
		token: string,
        amount: number,
    ) {
		const now = this.lends[token] || 0
		this.lends[token] = now - amount
    }

    public borrow(
		token: string,
        amount: number,
    ) {
		const now = this.borrows[token] || 0
		this.borrows[token] = now + amount
    }

    public process(elapsed: number, rates: { [key: string]: number }) {
		this.rates = rates
		let income = 0
		let cost = 0
		
		// WARN this is broken for generic borrows. Only works for USDC
		for (const borrow of Object.keys(this.borrows)) {
			const rate = this.rates[borrow]
			const interest = this.borrows[borrow] * rate * elapsed / (60 * 60 * 24 * 365)
			this.borrows[borrow] -= interest
			cost += interest
		}

		for (const lend of Object.keys(this.lends)) {
			const rate = this.rates[lend]
			const interest = this.lends[lend] * rate * elapsed / (60 * 60 * 24 * 365)
			this.lends[lend] += interest
			income += interest
		}
		this.interest = { cost, income }
    }
}

export class AAVEPositionManager {
	private lastData!: AAVEData
	private rates: { [key: string]: number }
    positions: AAVEPosition[] = []
	
	
    constructor() {
		this.rates = {
			'USDC': 0, // 2%
			'ETH': 0, // 1%
		}
    }

    public update(data: AAVEData): boolean {
        if (!this.lastData) {
            this.lastData = data
            return false
        }
		const elapsed = data.timestamp - this.lastData.timestamp
		this.rates = {
			'USDC': data.usdcIncomeRate - 1,
			'ETH': data.ethDebtRate - 1,
		}
        for (const pos of this.positions) {
            pos.process(elapsed, this.rates)
        }

        this.lastData = data
        return true
    }

    public create(): AAVEPosition {
        const pos = new AAVEPosition(this.rates)
        this.positions.push(pos)
        return pos
    }

    public close(pos: AAVEPosition){
        const idx = this.positions.indexOf(pos)
        this.positions.splice(idx, 1)
    }
}