import { DataSourcesRepo } from './repository.js';
import { DataSource, DataSourceInfo } from './types.js';

export class DataSourceStore {
  static get(info: DataSourceInfo): DataSource {
    const entry = DataSourcesRepo.find(
      (s) => s.chain === info.chain && s.protocol === info.protocol,
    );
    if (!entry)
      throw new Error(
        `No data source found for ${info.chain} ${info.protocol}`,
      );

    const source = entry.createSource(info);
    const resolutions = source.resolutions();
    if (!resolutions.includes(info.resoution))
      throw new Error(
        `Data source ${info.chain} ${info.protocol} does not support resolution ${info.resoution}`,
      );

    return source;
  }
}
