import { Backtest } from '../../lib/backtest.js';
import { DataSourceInfo } from '../../lib/datasource/types.js';
import { CpmmHedgedStrategy } from './strategy.js';

const main = async () => {
  const USDCWETH = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
  const sources: DataSourceInfo[] = [
    {
      chain: 'arbitrum',
      protocol: 'camelot-dex',
      resoution: '1m',
      config: {
        pairs: [USDCWETH],
      },
    },
    {
      chain: 'arbitrum',
      protocol: 'aave',
      resoution: '1h',
      config: {
        pools: ['ETH', 'USDC'],
      },
    },
    {
      chain: 'arbitrum',
      protocol: 'camelot-farm',
      resoution: '1h',
      config: {
        pools: [USDCWETH],
      },
    },
  ];

  const bt = await Backtest.create(
    new Date('2023-01-01'),
    new Date(), // Now
    sources,
  );

  // Configure Strategy
  const strategy = new CpmmHedgedStrategy({
    univ2: bt.sources[0].id,
    aave: bt.sources[1].id,
    farm: bt.sources[2].id,
  });
  bt.onBefore(strategy.before.bind(this));
  bt.onData(async (snapshot: any) => {
    await strategy.onData(snapshot);
  });
  bt.onAfter(strategy.after.bind(strategy));

  // Run
  await bt.run();
};

main();
