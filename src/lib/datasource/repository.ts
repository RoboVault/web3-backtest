import { AaveDataSource } from './Aave.js';
import { CamelotDexDataSource } from './camelotDex.js';
import { CamelotFarmDataSource } from './camelotFarm.js';
import { DataSource, DataSourceInfo } from './types.js';

type DataSourceEntry = DataSourceInfo & {
  createSource: (info: DataSourceInfo) => DataSource;
};

export const DataSourcesRepo: DataSourceEntry[] = [
  {
    chain: 'arbitrum',
    protocol: 'aave',
    resoution: '1h',
    createSource: AaveDataSource.create,
  },
  {
    chain: 'arbitrum',
    protocol: 'camelot-farm',
    resoution: '1h',
    createSource: CamelotFarmDataSource.create,
  },
  {
    chain: 'arbitrum',
    protocol: 'camelot-dex',
    resoution: '1m',
    createSource: CamelotDexDataSource.create,
  },
];
