import { UniV3PositionManager } from '../../../lib/protocols/UNIV3PositionManager.js';
import { Uni3Snaphot } from '../../../lib/datasource/univ3Dex.js';
import { stringify } from 'csv-stringify/sync';
import fs from 'fs/promises';
import { AAVEPositionManager } from '../../../lib/protocols/AavePositionManager.js';
import { HedgedUniswap } from './strategy.js';
import { Log, Rebalance, Summary } from './models.js';

export class HedgedUniswapStrategyRunner {
  private uni = new UniV3PositionManager();
  private lastData!: Uni3Snaphot;
  private lender = new AAVEPositionManager();
  private strategies: HedgedUniswap[] = [];
  constructor() {
    const strategies = Array.from(Array(5).keys()).flatMap((i) => {
      return Array.from(Array(5).keys()).flatMap((j) => {
        return Array.from(Array(1).keys()).flatMap((k) => {
          const n = i + 1;
          return {
            initialInvestment: 100_000,
            name: `#${n}: Camelotv3 WETH/USDC ${n * 5}% | debt ratio : ${
              (j + 1) * 2.5
            }% | slippage : ${(k + 1) * 0.1}%`,
            pool: 'Camelotv3 WETH/USDC 0%',
            rangeSpread: 0.05 * n,
            priceToken: 0,
            collatRatio: 0.6,
            debtRatioRange: 0.025 * (j + 1),
            fixedSlippage: 0.001 * (k + 1),
          };
        });
      });
    });

    this.strategies = strategies.map(
      (s) =>
        new HedgedUniswap(
          s.name,
          s.pool,
          s.initialInvestment,
          s.rangeSpread,
          s.priceToken,
          s.collatRatio,
          s.debtRatioRange,
          s.fixedSlippage,
        ),
    );
  }

  public async before() {
    await Log.dropMeasurement();
  }

  public async after() {
    console.log(
      'end date:',
      new Date(this.lastData.timestamp * 1000).toISOString(),
    );
    await Log.exec(true);
    await Rebalance.exec(true);
    const summary = await Promise.all(
      this.strategies.map((s) => s.end(this.uni, this.lastData)),
    );
    console.log(summary);
    const csv = stringify(summary, { header: true });
    fs.writeFile('./camelotv3_hedged.csv', csv);

    const series = this.strategies.map((s) => s.series).flat();
    const seriesCsv = stringify(series, { header: true });
    fs.writeFile('./camelotv3_hedged_series.csv', seriesCsv);

    await Summary.writePoints(
      summary.map((s, i) => {
        return {
          tags: this.strategies[i].tags,
          fields: s,
          timestamp: new Date(this.lastData.timestamp * 1000),
        };
      }),
    );
    await Summary.exec();
  }

  public async onData(snapshot: Uni3Snaphot) {
    if (snapshot.data.aave && snapshot.data.univ3) {
      this.lastData = snapshot;

      // Aave Position Update
      await this.lender.update({
        timestamp: snapshot.timestamp,
        data: snapshot.data.aave as any,
      });

      this.uni.processPoolData(snapshot);

      // Process the strategy
      for (const strat of this.strategies) {
        await strat.process(this.uni, snapshot, this.lender);
      }
    } else {
      console.log(
        Object.keys(snapshot.data),
        new Date(snapshot.timestamp * 1000).toISOString(),
      );
    }
  }
}
