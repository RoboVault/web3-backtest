import { Backtest } from '../../../lib/backtest.js';
import { DataSourceInfo } from '../../../lib/datasource/types.js';
import { HedgeManualVeloStrategy } from './strategy.js';

const main = async () => {
  const USDCLUSD = '0x207addb05c548f262219f6bfc6e11c02d0f7fdbe'; // 10093268 june 1 2-22
  const MAILUSD = '0x88835af27c7a22bded54033c5fad482a913981bc'; // 19803176 aug 19 2022
  const USDPLUSLUSD = '0x8a9Cd3dce710e90177B4332C108E159a15736A0F'; // 25707350 sep 27 2022
  const ETHLUSD = '0x91e0fC1E4D32cC62C4f9Bc11aCa5f3a159483d31'; // 38349790 nov 15 2022
  const sources: DataSourceInfo[] = [
    {
      chain: 'optimism',
      protocol: 'velodrome-dex',
      resoution: '1h',
      config: {
        pairs: [USDCLUSD, MAILUSD, USDPLUSLUSD, ETHLUSD],
      },
    },
    {
      chain: 'optimism',
      protocol: 'sonne',
      resoution: '1h',
      config: { 
        pools: ['LUSD', 'WETH']
      },
    }
  ];

  const bt = await Backtest.create(
    new Date('2023-02-05'),
    // new Date('2023-01-05'),
    new Date(), // Now
    sources,
  );

  // Configure Strategy
  const strategy = new HedgeManualVeloStrategy();
  bt.onBefore(strategy.before.bind(strategy));
  bt.onData(strategy.onData.bind(strategy));
  bt.onAfter(strategy.after.bind(strategy));

  // Run
  await bt.run();
};

main();
