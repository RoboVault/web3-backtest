import { Measurement, Schema } from "../data/timeseriesdb.js";
import type { Strategy } from "../core/types/strategy.js";
import { UniV2Position, UniV2PositionManager } from "../core/UniV2PositionManager.js";
import { DataUpdate, UniV2Data } from "../core/datasource/UniV2DataSource.js";
import { AAVEPosition, AAVEPositionManager } from "../core/AavePositionManager.js";
import { CamelotFarm } from "../core/CamelotFarm.js";
import { FarmPosition } from "../core/CamelotFarm.js";

interface ILogAny extends Schema {
    tags: any
    fields: any
}

const Log = new Measurement<ILogAny, any, any>('cpmm_strategy')
const Harvest = new Measurement<ILogAny, any, any>('cpmm_harvest')
const Rebalance = new Measurement<ILogAny, any, any>('cpmm_rebalance')
const AAVE = new Measurement<ILogAny, any, any>('cpmm_aave')

const REBALANCE_COST = 5
const HARVEST_COST = 5

class CpmmHedgedPosition {
    public position!: UniV2Position
    public aave!: AAVEPosition
	public farm!: FarmPosition
    public firstPosition = false
	public initialInvestment
	public debtRatioRange
	public collatRatio
	public start!: number
	public highest!: number
	public maxDrawdown: number = 0
	public rebalanceCount: number = 0
	public performanceFee: number
	public managementFee: number
	public lastHarvest!: number
	public lastHarvestSharePrice!: number
	public gasCosts: number = 0
	public harvestCount: number = 0
	public rewardsSum: number = 0
	public pendingRewards: number = 0

	// cumulative fees
	public fees: {
		total: number
		performanceFee: number
		managementFee: number
	} = {
		total: 0,
		performanceFee: 0,
		managementFee: 0,
	}

    constructor(public name: string, options: {
		initialInvestment: number,
		debtRatioRange: number,
		collatRatio: number,
		performanceFee: number,
		managementFee: number,
	}) {
        this.initialInvestment = options.initialInvestment
        this.debtRatioRange = options.debtRatioRange
        this.collatRatio = options.collatRatio
		this.performanceFee = options.performanceFee
		this.managementFee = options.managementFee
    }

    public async process(
		mgr: UniV2PositionManager, 
		aave: AAVEPositionManager, 
		farm: CamelotFarm, 
		data: DataUpdate
	) {
		if (data.univ2.timestamp  % (60 * 10) === 0)
        	this.log(data)

        if (!this.firstPosition) {
            this.openFirstPosition(mgr, aave, farm, data)
        } else {
			const debtRatio = this.calcDebtRatio(data)
			if (debtRatio > (1 + this.debtRatioRange) || debtRatio < (1 - this.debtRatioRange)) 
			{
				console.log('\n************* rebalancing debt! *************')
				console.log((debtRatio * 100).toFixed(2))
				this.rebalanceDebt(mgr, aave, farm, data)
				console.log('new debt ratio:', this.calcDebtRatio(data))
			}

			const sinceLastHarvest = data.univ2.timestamp - this.lastHarvest
			const harvestInterval = 60 * 60 * 24 // one day
			if (sinceLastHarvest >= harvestInterval) {
				this.harvest(mgr, aave, farm, data)
			}
        }

    }

    public openFirstPosition(mgr: UniV2PositionManager, aave: AAVEPositionManager, farmMgr: CamelotFarm, data: DataUpdate) {
		this.lastHarvest = data.univ2.timestamp
		this.lastHarvestSharePrice = 1
		const { borrow, lend } = this.calcLenderAmounts(this.initialInvestment, data)
		this.aave = aave.create()
		this.aave.lend('USDC', lend)
		this.aave.borrow('ETH', borrow)
        this.firstPosition = true  
		// console.log(borrow, lend)
		this.start = data.univ2.timestamp
		this.highest = this.initialInvestment
		// process.exit(-1)
        this.position = mgr.addLiquidity(
			borrow,
            borrow * data.univ2.close,
        )
		this.farm = farmMgr.stake(this.position.lpTokens)
    }

    // public get positionSnapshot() {
    //     if (!this.position?.snapshot) return
    //     return this.position.snapshot
    // }

    public rebalanceDebt(mgr: UniV2PositionManager, aave: AAVEPositionManager, farmMgr: CamelotFarm, data: DataUpdate) {
		this.rebalanceCount++
		console.log('rebalanceDebt', (new Date(data.univ2.timestamp * 1000)).toISOString())
        // Calc total assets
        const totalAssets = this.estTotalAssets(data)

		// Future: Account for trading fees and slippage on rebalances
        
        // Update Lend
		const { borrow, lend } = this.calcLenderAmounts(totalAssets, data)
		this.pendingRewards = this.farm.pendingRewards
        // Close this position
        mgr.close(this.position)
        aave.close(this.aave)
		farmMgr.close(this.farm)
		this.aave = aave.create()
		this.aave.lend('USDC', lend)
		this.aave.borrow('ETH', borrow)
        this.position = mgr.addLiquidity(
			borrow,
            borrow * data.univ2.close,
        )
		this.farm = farmMgr.stake(this.position.lpTokens)
		this.gasCosts += REBALANCE_COST
		Rebalance.writePoint({
			tags: { strategy: this.name },
			fields: {
				gas: REBALANCE_COST,
			},
			timestamp: new Date(data.univ2.timestamp * 1000),
		})
    }

	public harvest(mgr: UniV2PositionManager, aave: AAVEPositionManager, farmMgr: CamelotFarm, data: DataUpdate) {
		// Add rewards to lending positions
		const now = new Date(data.univ2.timestamp * 1000)
		// console.log(`harvesting!! ${now.toUTCString()}`)
		const rewards = this.farm.claim() + this.pendingRewards
		this.pendingRewards = 0
		if (rewards > 0)
			this.aave.lend('USDC', rewards)
		let performanceFee = 0
		let managementFee = 0
		let profit = 0

		// Claim fees
		const totalAssets = this.estTotalAssets(data)
		const sharePrice = totalAssets / this.initialInvestment
		if (sharePrice > this.lastHarvestSharePrice) {
			const elapsed = data.univ2.timestamp - this.lastHarvest
			profit = (sharePrice - this.lastHarvestSharePrice) * totalAssets
			performanceFee = profit * this.performanceFee
			managementFee = totalAssets * this.managementFee * elapsed / (60 * 60 * 24 * 365)
			if (performanceFee + managementFee > profit) {
				managementFee = profit
				performanceFee = 0	
			}

			this.aave.redeem('USDC', performanceFee + managementFee)
		}
		this.lastHarvestSharePrice = sharePrice
		this.lastHarvest = data.univ2.timestamp
		const totalFee = performanceFee + managementFee
		const harvestLog = {            
			tags: {
				strategy: this.name,
			},
			fields: {
				performanceFee,
				managementFee,
				profit,
				sharePrice,
				totalAssets,
				elapsed: data.univ2.timestamp - this.start,
				totalFee,
				rewards,
				gas: HARVEST_COST,
			},
			timestamp: new Date(data.univ2.timestamp * 1000),
		}
		this.rewardsSum += rewards
		this.fees.managementFee += managementFee
		this.fees.performanceFee += performanceFee
		this.fees.total += totalFee
		this.gasCosts += HARVEST_COST
		// console.log(harvestLog)
		Harvest.writePoint(harvestLog)
		this.harvestCount++
	}


    public borrowInWant(data: DataUpdate) {
		return (this.aave.borrowed('ETH') * data.univ2.close)
	}

    public estTotalAssets(data: DataUpdate) {
		const totalAssets = 
			this.position.valueUsd + 
			this.aave.lent('USDC') - 
			(this.aave.borrowed('ETH') * data.univ2.close) + 
			this.farm.pendingRewards
		// console.log(totalAssets, this.position.valueUsd, this.aave.lent('USDC'), (this.aave.borrowed('ETH') * data.close))
        return totalAssets
    }

    private calcLenderAmounts(totalAssets: number, data: DataUpdate) {
        const lend = totalAssets * (1 / (1 + this.collatRatio))
        const borrowInWant = totalAssets - lend
        const borrow = borrowInWant / data.univ2.close
        return {borrow, lend}
    }

    private calcDebtRatio(data: DataUpdate): number {
        if (!this.position)
            return 1
        return this.borrowInWant(data) / this.position.reserves1
    }

    private calcCollatRatio(data: DataUpdate): number {
        if (!this.position)
            return 1
        return this.borrowInWant(data) / this.aave.lent('USDC')
    }

	private apy(data: DataUpdate) {
		const elapsed = data.univ2.timestamp - this.start
		const totalAssets = this.estTotalAssets(data)
		const profit = totalAssets - this.initialInvestment
		const apy = profit / this.initialInvestment / (elapsed / (60 * 60 * 24 * 365))
		return apy
	}

    private async log(data: DataUpdate) {
        if (!this.position) return

		const elapsed = data.univ2.timestamp - this.start
		const totalAssets = this.estTotalAssets(data)
		const profit = totalAssets - this.initialInvestment
		const apy = profit / this.initialInvestment / (elapsed / (60 * 60 * 24 * 365))
		this.highest = this.highest < totalAssets ? totalAssets : this.highest
		const drawdown = (this.highest - totalAssets) / this.highest
		this.maxDrawdown = this.maxDrawdown < drawdown ? drawdown : this.maxDrawdown

		if (data.aave) {
			const borrowCost = this.aave.interest.cost * data.univ2.close
			const hourly = {
				tags: { strategy: this.name},
				timestamp: new Date(data.univ2.timestamp * 1000),
				fields: {
					borrowCost,
					lendIncome: this.aave.interest.income,
					net: this.aave.interest.income - borrowCost,
					rateUSDC: this.aave.rates.USDC,
					rateETH: this.aave.rates.ETH,
				}
			}
			await AAVE.writePoint(hourly)
		}

        const log = {
            tags: {
				strategy: this.name,
            },
            fields: {
				...data.univ2,
                ...this.position.snapshot,
				lend: this.aave.lent('USDC'),
				borrow: this.aave.borrowed('ETH'),
				borrowInWant: this.borrowInWant(data),
				price: data.univ2.close,
				totalAssets,
                debtRatio: this.calcDebtRatio(data),
				collatRatio: this.calcCollatRatio(data),
				pendingRewards: this.farm.pendingRewards,
				profit,
				apy,
				drawdown,
				maxDrawdown: this.maxDrawdown,
				rebalanceCount: this.rebalanceCount,
				managementFee: this.fees.managementFee,
				performanceFee: this.fees.performanceFee,
				revenue: this.fees.total,
				expenses: this.gasCosts,
				daoProfit: this.fees.total - this.gasCosts
            },
            timestamp: new Date(data.univ2.timestamp * 1000),
        }
		// console.log(log)
        try {
            await Log.writePoint(log)
        } catch(e) {
            console.log(log)
			console.log('Log Failed')
			await wait(10)
            await Log.writePoint(log)
            // throw new Error('Log Failed')
        }

    }
	
	public summary(data: DataUpdate) {
		const harvestCost = this.harvestCount * HARVEST_COST
		const rebalanceCost = this.rebalanceCount * REBALANCE_COST
		const totalCost = harvestCost + rebalanceCost
		const elapsed = data.univ2.timestamp - this.start
		const oneDay =  (60 * 60 * 24)
		const totalAssets = this.estTotalAssets(data)
		const sharePrice = totalAssets / this.initialInvestment
		const profit = this.fees.total - (harvestCost + rebalanceCost)
		const strategyRevenue = (sharePrice - 1) * this.initialInvestment + this.fees.total

		return {
			name: this.name,
			days: elapsed / oneDay,
			elapsed,
			roi: sharePrice - 1,
			apy: this.apy(data),
			maxDrawdown: this.maxDrawdown,
			harvestCost,
			rebalanceCost,
			totalCost,
			rebalanceCostDaily: rebalanceCost / (elapsed / oneDay),
			harvestCostDaily: harvestCost / (elapsed / oneDay),
			totalCostDaily: totalCost / (elapsed / oneDay),
			fees: this.fees,
			dailyFees: this.fees.total / (elapsed / oneDay),
			profit,
			dailyProfit: profit / (elapsed / oneDay),
			realYield: 1 - (this.rewardsSum /  strategyRevenue),
		}
	}

}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class CpmmHedgedStrategy implements Strategy {
	private univ2Manager = new UniV2PositionManager()
	private aaveManager = new AAVEPositionManager()
	private farm = new CamelotFarm()
	private strategies: CpmmHedgedPosition[] = []
	private lastData!: DataUpdate
    constructor() {
		const strategies = [
			{ name: 'collat_60%', initialInvestment: 1000000, collatRatio: 0.60, debtRatioRange: 0.05, performanceFee: 0.2, managementFee: 0.01 },
			{ name: 'collat_65%', initialInvestment: 1000000, collatRatio: 0.65, debtRatioRange: 0.05, performanceFee: 0.2, managementFee: 0.01 },
			{ name: 'collat_70%', initialInvestment: 1000000, collatRatio: 0.70, debtRatioRange: 0.05, performanceFee: 0.2, managementFee: 0.01 },
			{ name: 'collat_75%', initialInvestment: 1000000, collatRatio: 0.75, debtRatioRange: 0.05, performanceFee: 0.2, managementFee: 0.01 },
		]
		this.strategies = strategies.map(s => new CpmmHedgedPosition(s.name, s))
    }

    public async before() {
        await Log.dropMeasurement()
        await Harvest.dropMeasurement()
        await Rebalance.dropMeasurement()
		await AAVE.dropMeasurement()
    }

    public async after() {
		this.strategies.forEach(s => {
			console.log(s.summary(this.lastData))
		})
        console.log('Back test finished')
    }

    public async onData(data: DataUpdate) {
		this.lastData = data
		await this.univ2Manager.update(data.univ2)
		await this.farm.update(data.univ2, data.farm)
		
		if (data.aave) {
			await this.aaveManager.update(data.aave)
		}

		// Procress the strategy
		for (const strat of this.strategies) {
			await wait(1)
			await strat.process(this.univ2Manager, this.aaveManager, this.farm, data)
		}
    }
}
