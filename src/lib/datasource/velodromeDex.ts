import { DataSnapshot, DataSource, DataSourceInfo, Resolution } from "./types.js";
import { gql, GraphQLClient } from "graphql-request";

export type Univ2PoolSnapshot = {
	address: string
	token0: string
	token1: string
	symbol: string
	reserves0: number
	reserves1: number
	totalSupply: number
	close: number
}

export type Univ2Snapshot = DataSnapshot<Univ2PoolSnapshot>

type SourceConfig = {
	pairs: string[]
}

type MinuteData = {
    totalSupply: number
    timestamp: number
    reserves1: number
    reserves0: number
    pair: string
    address: string
}

const WETH_LUSD = '0x91e0fc1e4d32cc62c4f9bc11aca5f3a159483d31'
const PAIR_ID = '\"6461ccd4a40e99fb8f2cb798\"' // todo, make generic and fetch in init()

// 
const TokensLookup = {
	'WETH': '0x4200000000000000000000000000000000000006',
	'LUSD': '0xc40F949F8a4e094D1b49a23ea9241D289B7b2819',
}

export class VelodromeDexDataSource implements DataSource<Univ2Snapshot> {
	public static readonly defaultId = 'velodromeDex'
	public readonly id: string
	private client: GraphQLClient

	constructor(public info: DataSourceInfo) {
		this.id = info.id || VelodromeDexDataSource.defaultId
		// only supports WETH/USDC right now
		const config = info.config as SourceConfig
		if (config.pairs[0] !== WETH_LUSD)
			throw new Error('Only USDCLUSD supported by VelodromeDexDataSource currently')
		const url = 'https://data.staging.arkiver.net/robolabs/velo-minutely/graphql'
		this.client = new GraphQLClient(url, { headers: {} })
	}

	public resolutions(): Resolution[] {
		return ['1m']
	}	

	public static create(info: DataSourceInfo) {
		return new VelodromeDexDataSource(info)
	}

	public async init() {

	}

	public async fetch(from: number, to: number, limit?: number): Promise<Univ2Snapshot[]> {
		const query = gql`query MyQuery {
			MinuteDatas (
				sort: TIMESTAMP_ASC
				filter: {_operators: {timestamp: {gt: ${from}, lt: ${to}}}, pair: ${PAIR_ID}}
				limit: ${limit}
			) {
				totalSupply
				timestamp
				reserves1
				reserves0
				pair
				address
			}
		  }
		`

		const raw = (await this.client.request(query)).MinuteDatas
		return this.prep(raw)
	}

	private prep(raw: MinuteData[]): Univ2Snapshot[] {
		return raw.map(e => {
			const ret: Univ2Snapshot = {
				timestamp: e.timestamp,
				data: {}
			}
			ret.data[this.id] = [{
				address: e.address,
				token0: 'WETH',
				token1: 'LUSD',
				symbol: 'WETH/LUSD',
				reserves0: e.reserves0,
				reserves1: e.reserves1,
				totalSupply: e.totalSupply,
				close: e.reserves1 / e.reserves0,
			}]
			return ret
		})
	}
}