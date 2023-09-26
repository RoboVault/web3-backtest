import { DataSourceStore } from './datasource/datasource.js';
import {
  DataSnapshot,
  DataSource,
  DataSourceInfo,
  Resolution,
} from './datasource/types.js';
import { getCachedData, updateCache } from './utils/cache.js';

type BacktestOptions = {
  useCache?: boolean; // default: true
};

export class Backtest {
  private onDataHandler?: (update: DataSnapshot<any>) => Promise<void>;
  private onBeforeHandler?: () => Promise<void>;
  private onAfterHandler?: () => Promise<void>;

  constructor(
    private start: Date,
    private end: Date,
    public readonly sources: DataSource[],
    public options: BacktestOptions,
  ) {}

  public static async create(
    start: Date,
    end: Date,
    sourceConfig?: DataSourceInfo[],
    _sources?: DataSource[],
    options?: BacktestOptions,
  ): Promise<Backtest> {
    const sources =
      _sources || sourceConfig?.map((source) => DataSourceStore.get(source));
    if (!sources) throw new Error('no sources provided');
    const bt = new Backtest(
      start,
      end,
      sources,
      options || { useCache: false },
    );
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
      return aRes > bRes ? 1 : -1;
    });

    const start = this.start.getTime() / 1000;
    const end = this.end.getTime() / 1000;

    const limit = 5000;

    const formatTime = (time: number) => {
      const t = new Date(time * 1000)
        .toISOString()
        .replace(':00.000Z', '')
        .split('T');
      return `${t[0]} ${t[1]}`;
    };

    // grab all the data
    const dataPromises = sources.map(async (ds) => {
      let from = start;
      let finished = false;
      let allData: any[] = [];
      let prevDataLimit = 0;

      if (this.options.useCache) {
        const cachedData = await getCachedData(ds.id, start, end);
        if (cachedData) return cachedData;
      }

      do {
        const data = await ds.fetch(from, end, limit);
        if (data.length === 0) break;

        const to = data[data.length - 1].timestamp;
        console.log(
          `Fetched ${ds.id} data from ${formatTime(from)} to ${formatTime(to)}`,
        );
        from = to;

        allData = [...allData, ...data];

        finished = data.length < prevDataLimit;
        prevDataLimit = data.length;
      } while (!finished);
      return allData;
    });

    const allData = await Promise.all(dataPromises);
    if (this.options.useCache) {
      for (const data of allData) {
        await await updateCache(data, start, end);
      }
    }

    // merge all timestamps
    const timestamps = Array.prototype.concat.apply(
      [],
      allData.map((e) => e.map((e) => e.timestamp)),
    ) as number[];
    console.log('sorting timestamps');
    const unique = Array.from(new Set(timestamps)).sort((a, b) => a - b);

    console.log('merging data');
    const mergedData = unique.map((ts) => {
      // grab data from each datasource at this timestamp
      const data = allData
        .map((ds) => {
          const index = ds.findIndex((e) => e.timestamp === ts);
          if (index === -1) return;
          const data = ds[index]?.data;
          // remove data from the array so we don't have to iterate through it again
          ds.splice(index, 1);
          return data;
        })
        .filter((e) => e);

      return {
        timestamp: ts,
        data: Object.assign({}, ...data),
      };
    });

    console.log('running backtest... 🏃‍♂️');
    // emit each of the snapshots
    for (const snap of mergedData) {
      if (this.onDataHandler) await this.onDataHandler(snap);
    }

    if (this.onAfterHandler) await this.onAfterHandler();
  }
}
