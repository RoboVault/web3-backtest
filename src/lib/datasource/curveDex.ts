import {
  DataSnapshot,
  DataSource,
  DataSourceInfo,
  Resolution,
} from './types.js';
import { gql, GraphQLClient } from 'graphql-request';

export type CurvePoolSnapshot = {
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
  virtualPrice: number;
  price: number;
  crvPrice: number;
  crvRate: number;
  gaugeRelativeWeight: number;
  gaugeTotalSupply: number;
};

export type CurveSnaphot = DataSnapshot<CurvePoolSnapshot>;

type Snapshot = {
  block: number;
  pool: string;
  reserves: number[];
  prices: number[];
  timestamp: number;
  // res: '1h' | '1m',
  totalSupply: number;
  virtualPrice: number;
  crvPrice: number;
  crvRate: number;
  gaugeRelativeWeight: number;
  gaugeTotalSupply: number;
};

type Token = {
  symbol: string;
  address: string;
  decimals: number;
};

export class CurveDexDataSource implements DataSource<CurveSnaphot> {
  private client: GraphQLClient;
  private pools: {
    [key: string]: { tokens: Token[]; address: string; symbol: string };
  } = {};
  public readonly id: string;
  constructor(public info: DataSourceInfo) {
    this.id = info.id || 'curve';
    const url =
      'https://data.staging.arkiver.net/s_battenally/curve-snapshots/graphql';
    // const url = 'http://0.0.0.0:4000/graphql'
    this.client = new GraphQLClient(url, { headers: {} });
  }

  public resolutions(): Resolution[] {
    return ['1h'];
  }

  public static create(info: DataSourceInfo) {
    return new CurveDexDataSource(info);
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
    const rawPools = (
      (await this.client.request(gql`
        query MyQuery {
          CurvePools {
            _id
            tokens {
              _id
            }
            address
            symbol
          }
        }
      `)) as any
    ).CurvePools as {
      tokens: [{ _id: string }];
      address: string;
      _id: string;
      symbol: string;
    }[];

    rawPools.forEach((pool) => {
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
  ): Promise<CurveSnaphot[]> {
    const query = gql`query MyQuery {
			Snapshots (
				sort: TIMESTAMP_ASC
				filter: {_operators: {timestamp: {gt: ${from}, lt: ${to}}}}
				${limit ? `limit: ${limit}` : ``}
			) {
				pool
				timestamp
				totalSupply
				virtualPrice
				reserves
				block
				prices
				crvPrice
				crvRate
				gaugeRelativeWeight
				gaugeTotalSupply
			}
		  }
		`;

    const raw = ((await this.client.request(query)) as any).Snapshots;
    return this.prep(raw);
  }

  private prep(raw: Snapshot[]): CurveSnaphot[] {
    // combine snapshots on the same time
    const timestamps = raw.map((e: Snapshot) => e.timestamp);
    const unique = Array.from(new Set(timestamps)).sort((a, b) => a - b);
    const ret = unique.map((timestamp: number) => {
      const ret: CurveSnaphot = { timestamp, data: {} };
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
