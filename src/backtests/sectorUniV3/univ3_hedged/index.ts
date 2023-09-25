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

  for (let i = 0; i < 24; i++) {
    const start = new Date('2022-06-20')
    const hour = 60 * 60 * 1000;
    // 12 hours 
    const simPeriod = hour*12
    const bt = await Backtest.create(new Date(start.getTime() + i*hour), new Date(start.getTime() + i*hour + simPeriod), sources);
    // Configure Strategy
    const strategy = new HedgedUniswapStrategyRunner();
    bt.onBefore(strategy.before.bind(strategy));
    bt.onData(strategy.onData.bind(strategy));
    bt.onAfter(strategy.after.bind(strategy));
    await bt.run();
  }
};

main();
