import {
  DataSnapshot,
  DataSource,
  DataSourceInfo,
  Resolution,
} from './types.js';
import { gql, GraphQLClient } from 'graphql-request';

export type VelodromePoolSnapshot = {
  block: number;
  timestamp: number;
  pool: string;
  symbol: string;
  tokens: {
    symbol: string;
    address: string;
    decimals: number;
    reserve: number;
    price: number;
  }[];
  totalSupply: number;
  price: number;
};

export type VelodromeSnaphot = DataSnapshot<VelodromePoolSnapshot>;

type Snapshot = {
  block: number;
  pool: string;
  reserves: number[];
  prices: number[];
  timestamp: number;
  res: '1h' | '1m';
  totalSupply: number;
};

type Token = {
  symbol: string;
  address: string;
  decimals: number;
};

export class VelodromeDexDataSource implements DataSource<VelodromeSnaphot> {
  private client: GraphQLClient;
  private pools: {
    [key: string]: { tokens: Token[]; address: string; symbol: string };
  } = {};
  public readonly id: string;
  constructor(public info: DataSourceInfo) {
    this.id = info.id || 'velodrome';
    const url =
      'https://data.staging.arkiver.net/robolabs/velodrome-snapshots-v2/graphql?apiKey=ef7a25de-c6dd-4620-a616-2196eedde775';
    //const url = 'http://0.0.0.0:4000/graphql'
    this.client = new GraphQLClient(url, { headers: {} });
  }

  public resolutions(): Resolution[] {
    return ['1h'];
  }

  public static create(info: DataSourceInfo) {
    return new VelodromeDexDataSource(info);
  }

  private async getTokens() {
    return (
      (await this.client.request(gql`
        query MyQuery {
          Tokens {
            _id
            symbol
            address
            decimals
          }
        }
      `)) as any
    ).Tokens as {
      symbol: string;
      address: string;
      decimals: number;
      _id: string;
    }[];
  }

  public async init() {
    const tokens = await this.getTokens();
    const query = gql`
    query MyQuery {
      AmmPools {
        _id
        tokens {
          _id
          address
        }
        address
        symbol
      }
    }
  `
    const rawPools = (
      (await this.client.request(query)) as any
    ).AmmPools as {
      tokens: any[];
      address: string;
      _id: string;
      symbol: string;
    }[];
    if (rawPools.length === 0)
      console.log(query)
    rawPools.forEach((pool) => {
      //pool.tokens.map(e => console.log(e._id))
      this.pools[pool._id] = {
        ...pool,
        tokens: pool.tokens.map((e) => tokens.find((t) => t._id === e._id)!),
      };
    });
    console.log(rawPools.map((e) => e.symbol));
  }

  public async fetch(
    from: number,
    to: number,
    limit?: number,
  ): Promise<VelodromeSnaphot[]> {
    console.log('velo  from', from, 'to', to)
    const query = gql`query MyQuery {
			Snapshots (
				sort: TIMESTAMP_ASC
				filter: {_operators: {timestamp: {gt: ${from}, lt: ${to}}}}
				${limit ? `limit: ${limit}` : ``}
			) {
				pool
				timestamp
				totalSupply
				reserves
				block
				prices
			}
		  }
		`;
    const raw = ((await this.client.request(query)) as any).Snapshots;
    return this.prep(raw);
  }

  private prep(raw: Snapshot[]): VelodromeSnaphot[] {
    // combine snapshots on the same time
    const timestamps = raw.map((e: Snapshot) => e.timestamp);
    const unique = Array.from(new Set(timestamps)).sort((a, b) => a - b);
    const ret = unique.map((timestamp: number) => {
      const ret: VelodromeSnaphot = { timestamp, data: {} };
      ret.data[this.id] = raw
        .filter((e) => e.timestamp === timestamp)
        .map((snap: Snapshot) => {
          const pool = this.pools[snap.pool]!;
          const tokens = pool.tokens.map((e: Token, i: number) => {
            return {
              ...e,
              reserve: snap.reserves[i],
              price: snap.prices[i],
            };
          });
          const price =
            tokens.reduce(
              (acc, token) => acc + token.reserve * token.price,
              0,
            ) / snap.totalSupply;
          // console.log(tokens)
          // console.log(`price: ${price} `)
          // console.log(`totSupply: ${snap.totalSupply}`)
          return {
            ...snap,
            timestamp,
            pool: pool.address,
            tokens,
            symbol: pool.symbol,
            price,
            block: snap.block,
          };
        });
      return ret;
    });
    return ret;
  }
}
