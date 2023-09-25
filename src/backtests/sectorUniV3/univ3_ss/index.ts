import { Backtest } from '../../../lib/backtest.js';
import { DataSourceInfo } from '../../../lib/datasource/types.js';
import { SingleSidedUniswapStrategy } from './strategy.js';

const main = async () => {
  const USDCWETH = '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526';
  const sources: DataSourceInfo[] = [
    {
      chain: 'arbitrum',
      protocol: 'uniswap-dex',
      resoution: '1h',
      config: {
        pairs: [USDCWETH],
      },
    },
  ];

  const bt = await Backtest.create(
    new Date('2022-08-01'),
    // new Date('2023-01-05'),
    new Date(), // Now
    sources,
  );

  // Configure Strategy
  const strategy = new SingleSidedUniswapStrategy();
  bt.onBefore(strategy.before.bind(strategy));
  bt.onData(strategy.onData.bind(strategy));
  bt.onAfter(strategy.after.bind(strategy));

  // Run
  await bt.run();
};

main();
