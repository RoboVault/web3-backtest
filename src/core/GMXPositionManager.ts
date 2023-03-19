import { GLPData } from "./datasource/GmxDataSource.js"

type TokenSymbol = 'ETH' | 'BTC' | 'DAI'
type PriceFetcher = (token: TokenSymbol) => number

type Snapshot = {
	profit: number
	profitPercent: number
	positionBase: number
	positionQuote: number
	baseValueUsd: number
	quoteValueUsd: number
	quote: TokenSymbol
	base: TokenSymbol
	collateral: number
	openLeverage: number
	long: boolean
	value: number
}

const POSITION_FEE = 0.001

// assumes collat is in USD
export class GMXPosition {
	public open: boolean = true
	public profit: number = 0
	public profitPercent: number = 0

	public positionBase: number
	public positionQuote: number
	public baseValueUsd: number
	public quoteValueUsd: number
	
	constructor(
		private fetchPrice: PriceFetcher,
		private quote: TokenSymbol,
		private base: TokenSymbol,
		private collateral: number, 
		private openLeverage: number,
		private long: boolean
	) {
		const dir = (this.long ? 1 : -1)
		const size = collateral * openLeverage
		const fee = size * POSITION_FEE
		const basePrice = this.fetchPrice(this.base)
		const quotePrice = this.fetchPrice(this.quote)
		const price = basePrice / quotePrice
		this.positionBase = dir * (size - fee) / price
		this.positionQuote = -dir * (size - fee)
		this.profit = 0
		this.profitPercent = 0
		this.baseValueUsd = this.positionBase * basePrice
		this.quoteValueUsd = this.positionQuote * quotePrice
	}

	public processSample() {
		const dir = (this.long ? 1 : -1)
		const basePrice = this.fetchPrice(this.base)
		const quotePrice = this.fetchPrice(this.quote)
		this.baseValueUsd = this.positionBase * basePrice
		this.quoteValueUsd = this.positionQuote * quotePrice
		this.profit = this.baseValueUsd + this.quoteValueUsd
		this.profitPercent = this.profit / this.collateral
	}

	public adjustPosition(data: GLPData, newCollateral: number, newLeverage: number) {
		// Calc the fee
		const shortSizeCurrent = -this.snapshot.positionBase * data.btcPrice
		const shortSizeDisired = newCollateral * newLeverage
		const shortSizeDiff = shortSizeDisired - shortSizeCurrent
		const fee = shortSizeDiff * POSITION_FEE

		// Prices
		const basePrice = this.fetchPrice(this.base)
		const quotePrice = this.fetchPrice(this.quote)
		const price = basePrice / quotePrice

		// Update Position
		const dir = (this.long ? 1 : -1)
		this.positionBase = dir * (shortSizeDisired - fee) / price
		this.positionQuote = -dir * (shortSizeDisired - fee)
		this.profit = 0
		this.profitPercent = 0
		this.baseValueUsd = this.positionBase * basePrice
		this.quoteValueUsd = this.positionQuote * quotePrice		
	}

	public valueUsd() {
		return this.collateral + this.profit
	} 

	public get snapshot() {
		return {
			profit: this.profit,
			profitPercent: this.profitPercent,
			positionBase: this.positionBase,
			positionQuote: this.positionQuote,
			baseValueUsd: this.baseValueUsd,
			quoteValueUsd: this.quoteValueUsd,
			quote: this.quote,
			base: this.base,
			collateral: this.collateral,
			openLeverage: this.openLeverage,
			long: this.long,
			value: this.valueUsd()
		}
	}
	
	public close() {
		this.open = false
	}

}


export class GMXPositionManager {
    lastData!: GLPData
	private positions: GMXPosition[] = []
	
	public update(data: GLPData): boolean {
		const isFirst = !this.lastData
		this.lastData = data
		for (const pos of this.positions) {
			if (pos.open) {
				pos.processSample()
			}
		}
		return isFirst
	}

	// Assumes collateral is in DAI
	public openShort(collateralDai: number, leverage: number, token: TokenSymbol) {
		const pos = new GMXPosition(this.getTokenPrice.bind(this), 'DAI', token, collateralDai, leverage, false)
		this.positions.push(pos)
		return pos
	}

	private getTokenPrice(token: TokenSymbol) {
		switch (token) {
			case 'ETH': return this.lastData.ethPrice
			case 'BTC': return this.lastData.btcPrice
			case 'DAI': return 1
		}
	}
}