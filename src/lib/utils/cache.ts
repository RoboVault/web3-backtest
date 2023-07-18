import fs from 'fs/promises';
import { DataSnapshot } from '../datasource/types.js';

const getCacheFile = (id: string) => `cache/${id}.json`;
const getMetadataFile = (id: string) => `cache/${id}-metadata.json`;

export const getCachedData = async (id: string, start: number, end: number) => {
  const metadataFile = getMetadataFile(id);
  const cacheFile = getCacheFile(id);
  const cacheExists = await fs
    .access(cacheFile)
    .then(() => true)
    .catch(() => false);

  if (!cacheExists) return;

  const metadataString = await fs.readFile(metadataFile, {
    encoding: 'utf-8',
  });
  const metadata = JSON.parse(metadataString);
  if (metadata.start === start && metadata.end === end) {
    const cache = await fs.readFile(cacheFile, { encoding: 'utf-8' });
    return JSON.parse(cache) as DataSnapshot<any>[];
  } else {
    await fs.rm(metadataFile);
    await fs.rm(cacheFile);
  }
};

export const updateCache = async (
  data: DataSnapshot<any>[],
  start: number,
  end: number,
) => {
  const id = Object.keys(data[0].data)[0];
  const metadataFile = getMetadataFile(id);
  const cacheFile = getCacheFile(id);
  const cacheMetadata = {
    id,
    start,
    end,
  };

  // ensure cache directory exists
  await fs.access('cache').catch(async () => await fs.mkdir('cache'));

  await fs.writeFile(metadataFile, JSON.stringify(cacheMetadata));
  await fs.writeFile(cacheFile, JSON.stringify(data));
  return;
};
