
import { gql, GraphQLClient } from "graphql-request";
import type { Chain, OnDataCallback } from "../types/core";
import type { DataSource } from "../types/datasource";
import type { Obj } from "../types/obj";

export type PoolHourData = {
    pool: { 
        id: string,
        totalValueLockedUSD: number,
        totalValueLockedToken0: number,
        totalValueLockedToken1: number,
        token0: {
            decimals: number
        },
        token1: {
            decimals: number
        }
    },
    liquidity: number,
    sqrtPrice: number,
    token0Price: number,
    token1Price: number,
    tick: number,
    feeGrowthGlobal0X128: number,
    feeGrowthGlobal1X128: number,
    tvlUSD: number,
    volumeToken0: number,
    volumeToken1: number,
    volumeUSD: number,
    feesUSD: number,
    txCount: number,
    open: number,
    high: number,
    low: number,
    close: number,
    periodStartUnix: number
}

export class UniV3DataSource implements DataSource {

    constructor(
        private pool: string,
        private start: number,
        private end: number,
        private chain: Chain,
    ) {
        
    }
    
    public async init() {

    }

    public async run(ondata: OnDataCallback<PoolHourData>) {
        const url = this.getUrl(this.chain)
        const client = new GraphQLClient(url, { headers: {} })

        let finished = false
        const size = 100
        let timestamp = this.start
        do {
            const { query, variables } = this.query(size, timestamp)
            let data = await client.request(query, variables)
            
            // Calls the ondata handler
            for (const update of data.poolHourDatas) {
                await ondata(UniV3DataSource.beautifyData(update))
            }

            const len = data.poolHourDatas.length
            finished = len !== size
            if (len > 0) {
                timestamp = parseInt(data.poolHourDatas[len-1].periodStartUnix)
                // console.log(data.poolHourDatas[len-1])
            }
        } while (!finished)
    }

    private query(first: number, timestamp: number) {

        const query = gql`
            query getPoolHourDatas ($pool: ID!, $timestamp: Int!, $end: Int!) {
                poolHourDatas(where:{ pool:$pool, periodStartUnix_gt:$timestamp, periodStartUnix_lt:$end}, orderBy: periodStartUnix, first: $first) {
                    pool {
                        id
                        totalValueLockedUSD
                        totalValueLockedToken0
                        totalValueLockedToken1
                        token0 {
                            decimals
                        }
                        token1 {
                            decimals
                        }
                    }
                    liquidity
                    sqrtPrice
                    token0Price
                    token1Price
                    tick
                    feeGrowthGlobal0X128
                    feeGrowthGlobal1X128
                    tvlUSD
                    volumeToken0
                    volumeToken1
                    volumeUSD
                    feesUSD
                    txCount
                    open
                    high
                    low
                    close
                    periodStartUnix
                }
            }
        `
        const variables = {
            first,
            timestamp,
            pool: this.pool,
            end: this.end
        }
        // console.log(query)
        // console.log(variables)
        return { query, variables }
    }

    public getUrl(chain: string) {
        const CHAIN_LOOKUP: Obj<string> = {
            'ethereum': 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
            'optimism': 'https://api.thegraph.com/subgraphs/name/ianlapham/optimism-post-regenesis',
            'arbitrum': 'https://api.thegraph.com/subgraphs/name/ianlapham/arbitrum-minimal',
            'polygon': 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-polygon',
            'optimism-perp': 'https://api.thegraph.com/subgraphs/name/perpetual-protocol/perpetual-v2-optimism',
        }
        if (!CHAIN_LOOKUP[chain])
            throw new Error(`No chain "${chain}" available`)

        return CHAIN_LOOKUP[chain]
    }

    public static beautifyData(raw: any): PoolHourData {
        return {
            ...raw,
            pool: {
                id: raw.pool.id,
                totalValueLockedUSD: parseFloat(raw.pool.totalValueLockedUSD),
                totalValueLockedToken0: parseFloat(raw.pool.totalValueLockedToken0),
                totalValueLockedToken1: parseFloat(raw.pool.totalValueLockedToken1),
                token0: { decimals: parseFloat(raw.pool.token0.decimals) },
                token1: { decimals: parseFloat(raw.pool.token1.decimals) },
            },
            liquidity: parseFloat(raw.liquidity),
            sqrtPrice: parseFloat(raw.sqrtPrice),
            token0Price: parseFloat(raw.token0Price),
            token1Price: parseFloat(raw.token1Price),
            tick: parseFloat(raw.tick),
            feeGrowthGlobal0X128: parseFloat(raw.feeGrowthGlobal0X128),
            feeGrowthGlobal1X128: parseFloat(raw.feeGrowthGlobal1X128),
            tvlUSD: parseFloat(raw.tvlUSD),
            volumeToken0: parseFloat(raw.volumeToken0),
            volumeToken1: parseFloat(raw.volumeToken1),
            volumeUSD: parseFloat(raw.volumeUSD),
            feesUSD: parseFloat(raw.feesUSD),
            txCount: parseFloat(raw.txCount),
            open: parseFloat(raw.open),
            high: parseFloat(raw.high),
            low: parseFloat(raw.low),
            close: parseFloat(raw.close),
            periodStartUnix: parseInt(raw.periodStartUnix)
        }
    }

}