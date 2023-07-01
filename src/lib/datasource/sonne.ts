import {
  DataSnapshot,
  DataSource,
  DataSourceInfo,
  Resolution,
} from './types.js';
import { gql, GraphQLClient } from 'graphql-request';

export type CompPoolSnapshot = SonnePoolSnapshot
export type SonnePoolSnapshot = {
  underlying: string;
  liquidityRate: number;
  variableBorrowRate: number;
  totalSupply: number;
  totalDebt: number;
	cTokenTotalSupply: number,
	compPrice: number,
	compSupplyPerBlock: number,
	compBorrowPerBlock: number,
};
export type SonneSnapshot = DataSnapshot<SonnePoolSnapshot>;

type Snapshots = {
  pool: string;
  timestamp: number;
  liquidityRate: number;
  variableBorrowRate: number;
  totalSupply: number;
  totalDebt: number;
  underlying: string;
	cTokenTotalSupply: number,
	compPrice: number,
	compSupplyPerBlock: number,
	compBorrowPerBlock: number,
};

type SonnePool = {
  _id: string;
  protocol: string;
  network: string;
  underlyingSymbol: string;
  underlying: {
    symbol: string,
    address: string,
  }
};

export class SonneDataSource implements DataSource<SonneSnapshot> {
  private client: GraphQLClient;
  public readonly id: string;
  public poolSymbols: string[]; // Underlying Symbols
  public pools: SonnePool[] = [];
  constructor(public info: DataSourceInfo) {
    this.id = info.id || 'sonne';
    this.poolSymbols = info.config.pools;
    // const url =
      // 'https://data.staging.arkiver.net/robolabs/sonne-snapshots/graphql';
    const url =
      'https://data.staging.arkiver.net/robolabs/sonne-snapshots/graphql?apiKey=ef7a25de-c6dd-4620-a616-2196eedde775';
    this.client = new GraphQLClient(url, { headers: {} });
  }

  public resolutions(): Resolution[] {
    return ['1h'];
  }

  public static create(info: DataSourceInfo) {
    return new SonneDataSource(info);
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
					underlying {
            address
            symbol
          }
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
    pool: SonnePool,
    limit?: number,
  ): Promise<Snapshots[]> {
    const poolId = `"${pool._id}"`;
    console.log('sonne from', from, 'to', to)
    const query = gql`query MyQuery {
			Snapshots (
				sort: TIMESTAMP_ASC
				filter: {_operators: {timestamp: {gt: ${from}, lt: ${to}}}, pool: ${poolId}}
				${limit ? `limit: ${limit}` : ``}
			) {
				timestamp
				liquidityRate
				variableBorrowRate
				totalSupply
				totalDebt
        cTokenTotalSupply
        compPrice
        compSupplyPerBlock
        compBorrowPerBlock
			}
    }
		`;
    return ((await this.client.request(query)) as any).Snapshots.map(
      (e: any) => {
        return { ...e, underlying: pool.underlying.symbol };
      },
    );
  }

  public async fetch(
    from: number,
    to: number,
    limit?: number,
  ): Promise<SonneSnapshot[]> {
    const Snapshots = await Promise.all(
      this.pools.map(async (pool) => {
        return this.fetchPool(from, to, pool, limit);
      }),
    );
    return this.prep(Snapshots);
  }

  private prep(raw: Snapshots[][]): SonneSnapshot[] {
    const ts = raw[0].map((e) => e.timestamp);
    return ts.map((e) => {
      const ret: SonneSnapshot = {
        timestamp: e,
        data: {},
      };
      ret.data[this.id] = raw.map((data: Snapshots[]) => {
        return { ...data.find((snap) => snap.timestamp === e)! };
      });
      return ret;
    });
  }
}
