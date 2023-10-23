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
  ];
  const start = new Date('2023-06-20');
  const end = new Date();
  const bt = await Backtest.create(start, end, sources);

  // Configure Strategy
  const strategy = new HedgedUniswapStrategyRunner(end);
  bt.onBefore(strategy.before.bind(strategy));
  bt.onData(strategy.onData.bind(strategy));
  bt.onAfter(strategy.after.bind(strategy));

  // Run
  await bt.run();
};

main();
