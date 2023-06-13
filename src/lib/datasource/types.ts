export abstract class DataSource<T = DataSnapshot<any>> {
  abstract get id(): string;
  abstract get info(): DataSourceInfo;
  abstract resolutions(): Resolution[];
  abstract init(): Promise<void>;
  abstract fetch(from: number, to: number, limit?: number): Promise<T[]>;
}

export type Chains = 'ethereum' | 'arbitrum' | 'optimism';

export type Protocols = 'aave' | 'camelot-dex' | 'camelot-farm';

export type Resolution = '1m' | '1h' | '1d';

export type DataSourceInfo = {
  id?: string; // optional id for the datasource
  chain: Chains;
  protocol: Protocols;
  resoution: Resolution;
  config?: any;
};

export type DataSnapshot<T> = {
  timestamp: number;
  data: { [key: string]: T[] };
};
