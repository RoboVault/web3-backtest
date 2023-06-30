import { AaveDataSource } from './aave.js';
import { AaveArbitrumDataSource } from './aaveArbitrum.js';
import { CamelotDexDataSource } from './camelotDex.js';
import { CamelotFarmDataSource } from './camelotFarm.js';
import { CurveDexDataSource } from './curveDex.js';
import { DataSource, DataSourceInfo } from './types.js';
import { VelodromeDexDataSource } from './velodromeDex.js';
import { Uni3DexDataSource } from './uni3Dex.js';

type DataSourceEntry = DataSourceInfo & {
  createSource: (info: DataSourceInfo) => DataSource;
};

// TODO - Temporary solution, this needs to be more generic.
export const DataSourcesRepo: DataSourceEntry[] = [
  {
    chain: 'arbitrum',
    protocol: 'aave',
    resoution: '1h',
    createSource: AaveArbitrumDataSource.create,
  },
  {
    chain: 'optimism',
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
  {
    chain: 'optimism',
    protocol: 'velodrome-dex',
    resoution: '1m',
    createSource: VelodromeDexDataSource.create,
  },
  {
    chain: 'ethereum',
    protocol: 'curve-dex',
    resoution: '1m',
    createSource: CurveDexDataSource.create,
  },
  {
    chain: 'ethereum',
    protocol: 'uniswap-dex',
    resoution: '1h',
    createSource: Uni3DexDataSource.create,
  },
];
