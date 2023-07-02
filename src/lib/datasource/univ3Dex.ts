import { bigintToNumber, toNumber } from "../utils/utility.js";
import { DataSnapshot, DataSource, DataSourceInfo, Resolution } from "./types.js";
import { gql, GraphQLClient } from "graphql-request";

export type Uni3PoolSnapshot = {
	block: number
	timestamp: number
	pool: string
	symbol: string
	tokens: {
		symbol: string
		address: string
		decimals: number
		//reserve: number
		price: number
	}[]
	// totalSupply: number
	prices: [number, number]
	sqrtPriceX96: bigint
	close: number,
	// tick: number
	feeGrowthGlobal0X128: bigint
	feeGrowthGlobal1X128: bigint
	low: number
	high: number
	totalValueLockedToken0: number
	totalValueLockedToken1: number
	totalValueLockedUSD: number
}

export type Uni3Snaphot = DataSnapshot<Uni3PoolSnapshot> 

type Snapshot = {
	block: number,
	pool: {_id: string},
	//reserves: number[],
	prices: [number, number],
	timestamp: number,
	res: '1h' | '1m',
	// totalSupply: number,
	sqrtPriceX96: string,
	tick: string,
	feeGrowthGlobal0X128: string,
	feeGrowthGlobal1X128: string,
	low: string,
	high: string
	totalValueLockedToken0: string,
	totalValueLockedToken1: string,
	totalValueLockedUSD: number
}

type Token = {
	symbol: string
	address: string
	decimals: number
}

export class Uni3DexDataSource implements DataSource<Uni3Snaphot> {
    private client: GraphQLClient
	private pools: {[key: string]: { tokens: Token[], address: string, symbol: string}} = {}
	public readonly id: string
	constructor(public info: DataSourceInfo) {
		this.id = info.id || 'univ3'
		const url = 'https://data.staging.arkiver.net/robolabs/univ3-ohlc/graphql'
		//const url = 'http://0.0.0.0:4000/graphql'
        this.client = new GraphQLClient(url, { headers: {} })
	}

	public resolutions(): Resolution[] {
		return ['1h']
	}	

	public static create(info: DataSourceInfo) {
		return new Uni3DexDataSource(info)
	}

	private async getTokens() {
		return ((await this.client.request(gql`query TokenQuery {
			Tokens {
				_id
				symbol
				address
				decimals
			}
		}`)) as any).Tokens as { symbol: string, address: string, decimals: number, _id: string }[]
	}

	// to patch use
	// tokens {
	// 	_id
	// 	address
	// }
	public async init() {
		const tokens = await this.getTokens()
		const rawPools = ((await this.client.request(gql`query PoolQuery {
			AmmPools {
				_id
				tokens{
					_id
				}
				address
				symbol
			}
		}`)) as any).AmmPools as { tokens: any[], address: string, _id: string, symbol: string }[]
		
		rawPools.forEach(pool => {
			//pool.tokens.map(e => console.log(e._id))
			this.pools[pool._id] = {  
				...pool,
				tokens:  pool.tokens.map(e => tokens.find(t => t._id === e._id)!), // e._id to patch
			} 
		})
		console.log(rawPools.map(e => e.symbol))
	}

	public async fetch(from: number, to: number, limit?: number): Promise<Uni3Snaphot[]> {
		const query = gql`query SnapshotQuery {
			Snapshots (
				sort: TIMESTAMP_ASC
				filter: {_operators: {timestamp: {gt: ${from}, lt: ${to}}}}
				${limit ? `limit: ${limit}` : ``}
			) {
				pool {
					_id
				}
				block
				feeGrowthGlobal0X128
				feeGrowthGlobal1X128
				high
				low
				prices
				res
				timestamp
				sqrtPriceX96
				totalValueLockedToken0
				totalValueLockedToken1
				totalValueLockedUSD
			}
		  }
		`

		const raw = ((await this.client.request(query)) as any).Snapshots
		return this.prep(raw)
	}

	private prep(raw: Snapshot[]): Uni3Snaphot[] {
		// combine snapshots on the same time
		const timestamps = raw.map((e: Snapshot) => e.timestamp)
		const unique = Array.from(new Set(timestamps)).sort((a, b) => a - b)
		const ret = unique.map((timestamp: number) => {
			const ret: Uni3Snaphot = { timestamp, data: {} }
			ret.data[this.id] = raw.filter(e => e.timestamp === timestamp).map((snap: Snapshot) => {
				const pool = this.pools[snap.pool._id]!
				const tokens = pool.tokens.map((e: Token, i: number) => {
					return {
						...e,
						//reserve: snap.reserves[i],
						price: snap.prices[i]
					}
				})

				const sqrtPriceX96ToPrice = (sqrtPriceX96: string) => {
					const sqrtPriceX96BN = BigInt(sqrtPriceX96)
					const price = sqrtPriceX96BN * sqrtPriceX96BN * (10n ** 18n) / (2n ** 192n)
					return bigintToNumber(price, pool.tokens[1].decimals)
				}
				
				//const price = tokens.reduce((acc, token) => acc + (token.reserve * token.price), 0) / snap.totalSupply
				// console.log(tokens)
				// console.log(`price: ${price} `)
				// console.log(`totSupply: ${snap.totalSupply}`)
				const s: Uni3PoolSnapshot = {
					...snap,
					timestamp,
					pool: pool.address,
					tokens,
					symbol: pool.symbol,
					sqrtPriceX96: BigInt(snap.sqrtPriceX96),
					close: sqrtPriceX96ToPrice(snap.sqrtPriceX96),
					block: snap.block,
					feeGrowthGlobal0X128: BigInt(Number(snap.feeGrowthGlobal0X128)),
					feeGrowthGlobal1X128: BigInt(Number(snap.feeGrowthGlobal1X128)),
					low: sqrtPriceX96ToPrice(snap.low),
					high: sqrtPriceX96ToPrice(snap.high),
					totalValueLockedToken0: Number(snap.totalValueLockedToken0),
					totalValueLockedToken1: Number(snap.totalValueLockedToken1),
					totalValueLockedUSD: Number(snap.totalValueLockedUSD)
				}
				return s
			})
			return ret
		})
		return ret
	}
}