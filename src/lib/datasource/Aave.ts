import {
  DataSnapshot,
  DataSource,
  DataSourceInfo,
  Resolution,
} from './types.js';
import { gql, GraphQLClient } from 'graphql-request';

export type AavePoolSnapshot = {
  underlying: string;
  incomeRate: number;
  debtRate: number;
  totalSupply: number;
  totalDebt: number;
};
export type AaveSnapshot = DataSnapshot<AavePoolSnapshot>;

type HourData = {
  pool: string;
  timestamp: number;
  incomeRate: number;
  debtRate: number;
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
  constructor(public info: DataSourceInfo) {
    this.id = info.id || 'aave';
    this.poolSymbols = info.config.pools;
    const url =
      'https://data.staging.arkiver.net/robolabs/aave-hourly-data/graphql';
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
				Pool(filter: {underlyingSymbol: ${sym}}) {
					_id
					protocol
					network
					underlyingSymbol
					underlying
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
				pool
				timestamp
				liquidityRate
				variableBorrowRate
				totalSupply
				totalDebt
			}
		  }
		`;
    return ((await this.client.request(query)) as any).HourDatas.map(
      (e: any) => {
        return { ...e, underlying: pool.underlying };
      },
    );
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
