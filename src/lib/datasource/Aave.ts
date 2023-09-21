import {
  DataSnapshot,
  DataSource,
  DataSourceInfo,
  Resolution,
} from './types.js';
import { gql, GraphQLClient } from 'graphql-request';

export type AavePoolSnapshot = {
  underlying: string;
  liquidityRate: number;
  variableBorrowRate: number;
  totalSupply: number;
  totalDebt: number;
};
export type AaveSnapshot = DataSnapshot<AavePoolSnapshot>;

type HourData = {
  pool: string;
  timestamp: number;
  liquidityRate: number;
  variableBorrowRate: number;
  totalSupply: number;
  totalDebt: number;
  underlying: string;
};

type AAVEPool = {
  _id: string;
  protocol: string;
  network: string;
  underlyingSymbol: string;
  underlying: string;
};

export class AaveDataSource implements DataSource<AaveSnapshot> {
  private client: GraphQLClient;
  public readonly id: string;
  public poolSymbols: string[]; // Underlying Symbols
  public pools: AAVEPool[] = [];
  public network: string;
  constructor(public info: DataSourceInfo) {
    this.id = info.id || 'aave';
    this.poolSymbols = info.config.pools;
    this.network = info.chain;
    const url =
      'https://data.staging.arkiver.net/robolabs/aave-multichain/graphql';
    this.client = new GraphQLClient(url, { headers: {} });
  }

  public resolutions(): Resolution[] {
    return ['1h'];
  }

  public static create(info: DataSourceInfo) {
    return new AaveDataSource(info);
  }

  public async init() {
    // need to get the ids of the pools
    this.pools = await Promise.all(
      this.poolSymbols.map(async (e) => {
        const sym = `"${e}"`;
        const query = gql`query MyQuery {
				Pool(filter: {underlyingSymbol: ${sym}, network: "${this.network}"}) {
					_id
					protocol
					network
					underlyingSymbol
				}
			  }
			`;
        return ((await this.client.request(query)) as any).Pool;
      }),
    );
  }

  public async fetchPool(
    from: number,
    to: number,
    pool: AAVEPool,
    limit?: number,
  ): Promise<HourData[]> {
    const poolId = `"${pool._id}"`;
    const query = gql`query MyQuery {
			HourDatas (
				sort: TIMESTAMP_ASC
				filter: {_operators: {timestamp: {gt: ${from}, lt: ${to}}}, pool: ${poolId}}
				${limit ? `limit: ${limit}` : ``}
			) {
				pool {
          underlyingSymbol
        }
				timestamp
				liquidityRate
				variableBorrowRate
				totalSupply
				totalDebt
			}
		  }
		`;
    const data = (await this.client.request(query)) as any;
    return data.HourDatas.map((e: any) => {
      const { pool, ...rest } = e;
      return { ...rest, underlying: pool.underlyingSymbol };
    });
  }

  public async fetch(
    from: number,
    to: number,
    limit?: number,
  ): Promise<AaveSnapshot[]> {
    const hourDatas = await Promise.all(
      this.pools.map(async (pool) => {
        return this.fetchPool(from, to, pool, limit);
      }),
    );
    return this.prep(hourDatas);
  }

  private prep(raw: HourData[][]): AaveSnapshot[] {
    const ts = raw[0].map((e) => e.timestamp);
    return ts.map((e) => {
      const ret: AaveSnapshot = {
        timestamp: e,
        data: {},
      };
      ret.data[this.id] = raw.map((data: HourData[]) => {
        return { ...data.find((snap) => snap.timestamp === e)! };
      });
      return ret;
    });
  }
}
