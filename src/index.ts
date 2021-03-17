import { Client } from './Client';

export { Client } from './Client';
export { Pool } from './Pool';

export type {
  Serializer,
  BeanstalkJobState,
  IClientCtorOptions,
  IPoolCtorOptions,
  IClientRawReservedJob,
  IBeanstalkStats,
  IBeanstalkJobStats,
  IBeanstalkTubeStats,
} from './types';

const client = new Client();

client.connect().then(() => {
  client.put('{}');
});
