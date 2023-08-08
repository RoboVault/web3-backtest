import { Backtest } from '../../../lib/backtest.js';
import { DataSourceInfo } from '../../../lib/datasource/types.js';
import { SingleSidedVelodromeStrategy } from './strategy.js';

const main = async () => {
  const USDCLUSD = '0x207addb05c548f262219f6bfc6e11c02d0f7fdbe';
  const MAILUSD = '0x88835af27c7a22bded54033c5fad482a913981bc';
  const USDPLUSLUSD = '0x8a9Cd3dce710e90177B4332C108E159a15736A0F';
  const sources: DataSourceInfo[] = [
    {
      chain: 'optimism',
      protocol: 'velodrome-dex',
      resoution: '1h',
      config: {
        pairs: [USDCLUSD, MAILUSD, USDPLUSLUSD],
      },
    },
  ];

  const bt = await Backtest.create(
    new Date('2022-11-16'),
    // new Date('2023-01-05'),
    new Date(), // Now
    sources,
  );

  // Configure Strategy
  const strategy = new SingleSidedVelodromeStrategy();
  bt.onBefore(strategy.before.bind(strategy));
  bt.onData(strategy.onData.bind(strategy));
  bt.onAfter(strategy.after.bind(strategy));

  // Run
  await bt.run();
};

main();
