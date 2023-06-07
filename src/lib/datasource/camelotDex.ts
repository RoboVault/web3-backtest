import {
  DataSnapshot,
  DataSource,
  DataSourceInfo,
  Resolution,
} from './types.js';
import { gql, GraphQLClient } from 'graphql-request';

export type Univ2PoolSnapshot = {
  address: string;
  token0: string;
  token1: string;
  symbol: string;
  reserves0: number;
  reserves1: number;
  totalSupply: number;
  close: number;
};

export type Univ2Snapshot = DataSnapshot<Univ2PoolSnapshot>;

type SourceConfig = {
  pairs: string[];
};

type MinuteData = {
  timestamp: number;
  reserves0: number;
  reserves1: number;
  totalSupply: number;
};

const USDCWETH = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';

export class CamelotDexDataSource implements DataSource<Univ2Snapshot> {
  private client: GraphQLClient;
  public readonly id: string;

  constructor(public info: DataSourceInfo) {
    this.id = info.id || 'camelotDex';
    // only supports WETH/USDC right now
    const config = info.config as SourceConfig;
    if (config.pairs[0] !== USDCWETH)
      throw new Error(
        'Only USDCWETH supported by CamelotDexDataSource currently',
      );
    const url =
      'https://data.staging.arkiver.net/s_battenally/cpmm_v2/graphql?apiKey=29718b18-f0c1-466a-ac6d-d1db84d41a66';
    this.client = new GraphQLClient(url, { headers: {} });
  }

  public resolutions(): Resolution[] {
    return ['1m'];
  }

  public static create(info: DataSourceInfo) {
    return new CamelotDexDataSource(info);
  }

  public async init() {}

  public async fetch(
    from: number,
    to: number,
    limit?: number,
  ): Promise<Univ2Snapshot[]> {
    const query = gql`query MyQuery {
			MinuteDatas (
				sort: TIMESTAMP_ASC
				filter: {_operators: {timestamp: {gt: ${from}, lt: ${to}}}}
				limit: ${limit}
			) {
				timestamp
				reserves0
				reserves1
				totalSupply
			}
		  }
		`;

    const raw = (await this.client.request(query)).MinuteDatas;
    return this.prep(raw);
  }

  private prep(raw: MinuteData[]): Univ2Snapshot[] {
    return raw.map((e) => {
      const ret: Univ2Snapshot = {
        timestamp: e.timestamp,
        data: {},
      };
      ret.data[this.id] = [
        {
          address: USDCWETH,
          token0: 'WETH',
          token1: 'USDC',
          symbol: 'WETH/USDC',
          reserves0: e.reserves0,
          reserves1: e.reserves1,
          totalSupply: e.totalSupply,
          close: e.reserves1 / e.reserves0,
        },
      ];
      return ret;
    });
  }
}
