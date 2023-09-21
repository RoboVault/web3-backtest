import { Backtest } from '../../../lib/backtest.js';
import { DataSourceInfo } from '../../../lib/datasource/types.js';
import { HedgedUniswapStrategyRunner } from './strategyRunner.js';

const main = async () => {
  const USDCWETH = '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526';
  const sources: DataSourceInfo[] = [
    {
      chain: 'arbitrum',
      protocol: 'camelot-dex',
      resoution: '1h',
      config: {
        pairs: [USDCWETH],
      },
    },
    {
      chain: 'arbitrum',
      protocol: 'aave',
      resoution: '1h',
      config: {
        pools: ['USDC', 'WETH'],
      },
    },
  ];

  const bt = await Backtest.create(new Date('2023-06-20'), new Date(), sources);

  // Configure Strategy
  const strategy = new HedgedUniswapStrategyRunner();
  bt.onBefore(strategy.before.bind(strategy));
  bt.onData(strategy.onData.bind(strategy));
  bt.onAfter(strategy.after.bind(strategy));

  // Run
  await bt.run();
};

main();
