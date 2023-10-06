import { InfluxDB } from 'influx';
import { Measurement, ILogAny, TimeSeriesDB } from '../lib/utils/influx1x.js';
import { waitFor } from '../lib/utils/utility.js';

// jest.mock('influx'); // SoundPlayer is now a mock constructor

jest.mock('influx', () => {
  return {
    InfluxDB: function () {
      return {
        getDatabaseNames: jest.fn().mockImplementation(async () => {
          return ['testdb'];
        }),
        createDatabase: jest.fn().mockImplementation(async () => {
          await waitFor(1000);
        }),
        dropMeasurement: jest.fn().mockImplementation(async () => {}),
      };
    },
  };
});

describe('Test DB Connection', () => {
  it('Database is initialized', async () => {
    const Log = new Measurement<ILogAny, any, any>('test');
    await Log.dropMeasurement();
    expect(Log.timeseriesDB.getDatabaseNames).toHaveBeenCalledTimes(1);
    expect(Log.timeseriesDB.createDatabase).toHaveBeenCalledTimes(1);
    expect(TimeSeriesDB.connected).toBeTruthy();
  });
});
