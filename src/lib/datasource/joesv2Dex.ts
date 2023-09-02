import {
  DataSnapshot,
  DataSource,
  DataSourceInfo,
  Resolution,
} from './types.js';
import { gql, GraphQLClient } from 'graphql-request';

export type Bin = {
  id: number
  reserveX: number
  reserveY: number
  supply: string // hex number
}

type HourData = {
  pool: string
  timestamp: number
  block: number
  price: number
  activeBin: number
  bins: Bin[]
}

type Token = {
  symbol: string;
  address: string;
  decimals: number;
};

type Pool = {
  address: string
  symbol: string
  tokenX: Token
  tokenY: Token
}

export type JoesV2PoolSnapshot = {
  block: number;
  timestamp: number;
  price: number;
  pool: Pool;
  activeBin: number;
  bins: Bin[]
};

export type JoesV2Snaphot = DataSnapshot<JoesV2PoolSnapshot>;

export class JoesV2DexDataSource implements DataSource<JoesV2Snaphot> {
  private client: GraphQLClient;
  private pools: Pool[] = [];
  public readonly id: string;
  constructor(public info: DataSourceInfo) {
    this.id = info.id || 'joes';
    const url =
      'https://data.staging.arkiver.net/robolabs/joes-v2/graphql?apiKey=ef7a25de-c6dd-4620-a616-2196eedde775';
    //const url = 'http://0.0.0.0:4000/graphql'
    this.client = new GraphQLClient(url, { headers: {} });
  }

  public resolutions(): Resolution[] {
    return ['1h'];
  }

  public static create(info: DataSourceInfo) {
    return new JoesV2DexDataSource(info);
  }


  public async init() {
    const query = gql`
      query {
        Pools {
          address
          symbol
          tokenX {
            address
            symbol
            decimals
          }
          tokenY {
            address
            symbol
            decimals
          }
        }
      }
    `;
    this.pools = ((await this.client.request(query)) as any).Pools as Pool[]
  }

  public async fetch(
    from: number,
    to: number,
    limit?: number,
  ): Promise<JoesV2Snaphot[]> {
    console.log('Joesv2  from', from, 'to', to);
    const query = gql`query {
      HourDatas(
        sort: TIMESTAMP_ASC
        filter: {_operators: {timestamp: {gt: ${Math.floor(from)}, lt: ${Math.floor(to)}}}}
        ${limit ? `limit: ${limit}` : ``}
      ) {
        activeBin
        block
        pool
        price
        timestamp
        bins {
          supply
          reserveY
          reserveX
          id
        }
      }
    }`
    const raw = ((await this.client.request(query)) as any).HourDatas as HourData[];
    return this.prep(raw);
  }

  private prep(raw: HourData[]): JoesV2Snaphot[] {
    // combine snapshots on the same time
    const timestamps = raw.map((e: HourData) => e.timestamp);
    const unique = Array.from(new Set(timestamps)).sort((a, b) => a - b);
    const ret = unique.map((timestamp: number) => {
      const ret: JoesV2Snaphot = { timestamp, data: {} };
      ret.data[this.id] = raw
        .filter((e) => e.timestamp === timestamp)
        .map((snap: HourData) => {
          const pool = this.pools.find(e => e.address == snap.pool)!;

          return {
            ...snap,
            pool,

          };
        });
      return ret;
    });
    return ret;
  }
}
