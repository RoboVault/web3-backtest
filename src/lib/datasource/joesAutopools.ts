import {
  DataSnapshot,
  DataSource,
  DataSourceInfo,
  Resolution,
} from './types.js';
import { gql, GraphQLClient } from 'graphql-request';

export type Bin = {
  id: number;
  reserveX: number;
  reserveY: number;
  supply: string; // hex number
};

type HourData = {
  pool: string;
  priceX: number;
  priceY: number;
  tvl: number;
  totalSupply: number;
  timestamp: number;
  sharePrice: number;
  price: number;
  joesPrice: number;
  joesPerSec: number;
  block: number;
  balances: number[]
};

type Token = {
  symbol: string;
  address: string;
  decimals: number;
};

type Pool = {
  address: string;
  symbol: string;
  tokenX: Token;
  tokenY: Token;
};

export type JoesAutopoolsPoolSnapshot = {
  pool: Pool;
  priceX: number;
  priceY: number;
  tvl: number;
  totalSupply: number;
  timestamp: number;
  sharePrice: number;
  price: number;
  joesPrice: number;
  joesPerSec: number;
  block: number;
  balances: number[]
};

export type JoesAutopoolsSnaphot = DataSnapshot<JoesAutopoolsPoolSnapshot>;

export class JoesAutopoolsDexDataSource implements DataSource<JoesAutopoolsSnaphot> {
  private client: GraphQLClient;
  private pools: Pool[] = [];
  public readonly id: string;
  constructor(public info: DataSourceInfo) {
    this.id = info.id || 'joes';
    const url =
      'https://data.staging.arkiver.net/robolabs/joes-autopools/graphql';
    this.client = new GraphQLClient(url, { headers: {} });
  }

  public resolutions(): Resolution[] {
    return ['1h'];
  }

  public static create(info: DataSourceInfo) {
    return new JoesAutopoolsDexDataSource(info);
  }

  public async init() {
    const query = gql`
      query {
        Pools {
          tokenX {
            address
            network
            decimals
            symbol
          }
          tokenY {
            address
            network
            decimals
            symbol
          }
          symbol
          oracleY
          oracleX
          farmId
          decimals
          address
        }
      }
    `;
    this.pools = ((await this.client.request(query)) as any).Pools as Pool[];
  }

  public async fetch(
    from: number,
    to: number,
    limit?: number,
  ): Promise<JoesAutopoolsSnaphot[]> {
    console.log('JoesAutopools  from', from, 'to', to);
    const query = gql`query {
      HourDatas(
        sort: TIMESTAMP_ASC
        filter: {_operators: {timestamp: {gt: ${Math.floor(
          from,
        )}, lt: ${Math.floor(to)}}}}
        ${limit ? `limit: ${limit}` : ``}
      ) {
        priceX
        priceY
        tvl
        totalSupply
        timestamp
        sharePrice
        price
        joesPrice
        joesPerSec
        block
        balances
        pool
      }
    }`;
    const raw = ((await this.client.request(query)) as any)
      .HourDatas as HourData[];
    return this.prep(raw);
  }

  private prep(raw: HourData[]): JoesAutopoolsSnaphot[] {
    // combine snapshots on the same time
    const timestamps = raw.map((e: HourData) => e.timestamp);
    const unique = Array.from(new Set(timestamps)).sort((a, b) => a - b);
    const ret = unique.map((timestamp: number) => {
      const ret: JoesAutopoolsSnaphot = { timestamp, data: {} };
      ret.data[this.id] = raw
        .filter((e) => e.timestamp === timestamp)
        .map((snap: HourData) => {
          const pool = this.pools.find((e) => e.address == snap.pool)!;
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
