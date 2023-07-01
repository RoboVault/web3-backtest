import { DataSourceStore } from './datasource/datasource.js';
import {
  DataSnapshot,
  DataSource,
  DataSourceInfo,
  Resolution,
} from './datasource/types.js';

const toElapsed = (start: number) => {
  return ((Date.now() - start) / 1000).toFixed(2) + 's';
};

export class Backtest {
  private onDataHandler?: (update: DataSnapshot<any>) => Promise<void>;
  private onBeforeHandler?: () => Promise<void>;
  private onAfterHandler?: () => Promise<void>;

  constructor(
    private start: Date,
    private end: Date,
    public readonly sources: DataSource[],
  ) {}

  public static async create(
    start: Date,
    end: Date,
    sourceConfig: DataSourceInfo[],
  ): Promise<Backtest> {
    const sources = sourceConfig.map((source) => DataSourceStore.get(source));
    const bt = new Backtest(start, end, sources);
    return bt;
  }

  public static ResToSeconds(res: Resolution) {
    switch (res) {
      case '1m':
        return 60;
      case '1h':
        return 60 * 60;
      case '1d':
        return 60 * 60 * 24;
      default:
        throw new Error('unsuppported resolution');
    }
  }

  public onBefore(handler: () => Promise<void>) {
    this.onBeforeHandler = handler;
  }

  public onData<T = any>(handler: (update: DataSnapshot<T>) => Promise<void>) {
    this.onDataHandler = handler;
  }

  public onAfter(handler: () => Promise<void>) {
    this.onAfterHandler = handler;
  }

  public async run() {
    // Initialise the goodz
    await Promise.all(this.sources.map((e) => e.init()));
    if (this.onBeforeHandler) await this.onBeforeHandler();

    // sort the datasources from high res to low res
    const sources = this.sources.sort((a, b) => {
      const aRes = Backtest.ResToSeconds(a.info.resoution);
      const bRes = Backtest.ResToSeconds(b.info.resoution);
      return aRes >= bRes ? 1 : -1;
    });

    let start = this.start.getTime() / 1000;
    let end = this.end.getTime() / 1000;

    const limit = 1000;
    let finished = false;
    let from = start;
    let to = end;

    const formatTime = (time: number) => {
      const t = new Date(time * 1000)
        .toISOString()
        .replace(':00.000Z', '')
        .split('T');
      return `${t[0]} ${t[1]}`;
    };

    // use the first data source as the lead because it'll have the highest resolution
    const lead = sources[0];
    const others = sources.slice(1);
    do {
      const data = await lead.fetch(from, end, limit);
      if (data.length === 0) break;

      to = data[data.length - 1].timestamp;
      console.log(
        `Fetching data from ${formatTime(from)} to ${formatTime(to)}`,
      );
      const start = Date.now();
      const allData = [
        data,
        ...(await Promise.all(others.map((ds) => ds.fetch(from, to, limit)))),
      ];
      console.log(`data fetch elapsed ${toElapsed(start)}`);
      from = to;

      // merge all timestamps
      const timestamps = Array.prototype.concat.apply(
        [],
        allData.map((e) => e.map((e) => e.timestamp)),
      ) as number[];
      const unique = Array.from(new Set(timestamps)).sort((a, b) => a - b);

      const mergedData = unique.map((ts) => {
        const dsWithSnapshots = allData.filter(
          (ds) => ds.findIndex((e) => e.timestamp === ts) !== -1,
        );
        const data = dsWithSnapshots.map(
          (ds) => ds.find((e) => e.timestamp === ts)?.data,
        );
        return {
          timestamp: ts,
          data: Object.assign({}, ...data),
        };
      });

      // emit each of the snapshots
      for (const snap of mergedData) {
        if (this.onDataHandler) await this.onDataHandler(snap);
      }

      // End when we run out of data
      finished = data.length < 10;
    } while (!finished);

    if (this.onAfterHandler) await this.onAfterHandler();
  }
}
